"""
Tests for the payments module.

Run against the bus module because it needs the least set-up: a booking is a
booking whichever module made it, and the hooks this app calls on a module
(`amount_due`, `release_booking`) are exercised by each module's own suite.

The models are `managed = False`, so the tables are built with the schema
editor - the same way every other suite does it - and the run needs no MySQL.
"""
import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from accounts.authentication import issue_token

from bus.models import (
    AppUser,
    Booking,
    BookingFareLine,
    BusAmenity,
    BusBooking,
    BusBookingSeat,
    BusOperator,
    BusSeat,
    BusStopPoint,
    BusTrip,
    BusTripAmenity,
    City,
    Offer,
    Payment,
)

from payments import gateway
from payments.services import expire_stale

UPI = {'method': 'upi', 'upiId': 'rider@okhdfcbank'}
DECLINED_UPI = {'method': 'upi', 'upiId': 'failure@upi'}
CARD = {
    'method': 'card',
    'card': {
        'number': '4242 4242 4242 4242', 'name': 'A Traveller',
        'expiry': '12/39', 'cvv': '123',
    },
}


def card(**overrides):
    payload = {'method': 'card', 'card': {**CARD['card'], **overrides}}
    return payload


class PaymentsTestCase(TransactionTestCase):
    """The bus fixtures: a Mumbai to Pune sleeper with two priced decks."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from cab import models as cab_models
        from hotel import models as hotel_models
        from plane import models as plane_models
        from train import models as train_models

        cls.schema_models = [
            City, AppUser, Offer,
            BusOperator, BusAmenity, BusTrip, BusTripAmenity, BusStopPoint,
            BusSeat, Booking, BookingFareLine, Payment, BusBooking,
            BusBookingSeat,
            # `me/bookings/` reads all five modes, so the other subtype tables
            # have to exist for the one test that calls it.
            train_models.TrainStation, train_models.TrainClass,
            train_models.TrainQuota, train_models.Train,
            train_models.TrainBooking,
            plane_models.Airline, plane_models.Airport, plane_models.Flight,
            plane_models.FareBrand, plane_models.FlightBooking,
            hotel_models.Property, hotel_models.RoomType,
            hotel_models.RatePlan, hotel_models.HotelBooking,
            cab_models.CabCategory, cab_models.CabRateCard,
            cab_models.CabBooking,
        ]
        with connection.schema_editor() as editor:
            for model in cls.schema_models:
                editor.create_model(model)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in reversed(cls.schema_models):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        for model in reversed(self.schema_models):
            model.objects.all().delete()

        self.account = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9000000001', password_hash=make_password('a-good-password'),
            is_active=True,
        )
        self.token = issue_token(self.account)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Bearer {self.token}'

        self.travel_date = timezone.localdate() + timedelta(days=7)

        mumbai = City.objects.create(name='Mumbai', state='Maharashtra')
        pune = City.objects.create(name='Pune', state='Maharashtra')
        operator = BusOperator.objects.create(
            name='Sharma Travels', rating=Decimal('4.3'), rating_count=1204,
        )
        self.trip = BusTrip.objects.create(
            operator=operator,
            coach_name='Volvo 9600 Multi-Axle',
            seat_kind='sleeper',
            is_air_conditioned=True,
            layout='2+1',
            origin_city=mumbai,
            destination_city=pune,
            departure_time='22:00',
            arrival_time='05:30',
            duration_minutes=450,
            arrives_next_day=True,
            base_fare=Decimal('900.00'),
            cancellation_policy='Free cancellation up to 12 hours before departure.',
            has_live_tracking=True,
        )
        self.boarding = BusStopPoint.objects.create(
            trip=self.trip, kind=BusStopPoint.BOARDING,
            name='Mumbai Central Bus Stand', landmark='Platform 3',
            stop_time='21:40', sort_order=0,
        )
        self.dropping = BusStopPoint.objects.create(
            trip=self.trip, kind=BusStopPoint.DROPPING,
            name='Pune Bus Terminal', landmark='Arrival bay 1',
            stop_time='05:45', sort_order=0,
        )
        for counter, column in enumerate((1, 2, 4), start=1):
            BusSeat.objects.create(
                trip=self.trip, seat_code=f'L{counter}',
                deck='lower', row_no=1, column_no=column,
                seat_kind='sleeper', status='available',
                price=Decimal('1020.00'),
            )

    # -- helpers ------------------------------------------------------------

    def book(self, seat_ids=('L1', 'L2'), token=None):
        """A pending booking. Two seats at 1020, plus 25 and 5%: 2168."""
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps({
                'tripId': self.trip.pk,
                'date': self.travel_date.isoformat(),
                'seatIds': list(seat_ids),
                'passengers': [
                    {'seatId': seat_id, 'name': f'Traveller {index + 1}',
                     'age': '29', 'gender': 'male'}
                    for index, seat_id in enumerate(seat_ids)
                ],
                'contact': {'email': 'demo@gmail.com', 'phone': '9876543210'},
                'boardingPointId': self.boarding.pk,
                'droppingPointId': self.dropping.pk,
            }),
            content_type='application/json',
            **headers,
        )

    def pay(self, reference, payload=UPI, mode='bus', token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.post(
            reverse('payments:pay', args=[mode, reference]),
            data=json.dumps(payload),
            content_type='application/json',
            **headers,
        )

    def order(self, reference, mode='bus'):
        return self.client.get(reverse('payments:pay', args=[mode, reference]))

    def transactions(self, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.get(reverse('payments:transaction-list'), **headers)

    def receipt(self, transaction_ref):
        return self.client.get(
            reverse('payments:transaction-detail', args=[transaction_ref])
        )

    def backdate(self, reference, minutes):
        """Pretend the booking was made `minutes` ago."""
        Booking.objects.filter(reference=reference).update(
            booked_at=timezone.now() - timedelta(minutes=minutes),
        )

    def seat_status(self, code):
        decks = self.client.get(
            reverse('bus:trip-seats', args=[self.trip.pk]),
            {'date': self.travel_date.isoformat()},
        ).json()
        return next(
            seat['status'] for deck in decks for seat in deck['seats']
            if seat['id'] == code
        )


# ---------------------------------------------------------------------------
# The hold
# ---------------------------------------------------------------------------

class HoldTests(PaymentsTestCase):

    def test_a_new_booking_is_pending_and_holds_its_seats(self):
        body = self.book().json()

        self.assertEqual(body['status'], 'pending')
        self.assertIsNone(body['payment'])
        self.assertEqual(body['paymentMethod'], '')

        deadline = timezone.datetime.fromisoformat(body['holdExpiresAt'])
        self.assertAlmostEqual(
            (deadline - timezone.now()).total_seconds(), 15 * 60, delta=5,
        )

        booking = Booking.objects.get(reference=body['pnr'])
        self.assertEqual(booking.payments.count(), 0)
        # Held is held: nobody else can have the seat while it is unpaid.
        self.assertEqual(self.seat_status('L1'), 'booked')

    def test_the_order_view_says_what_is_owed(self):
        pnr = self.book().json()['pnr']

        response = self.order(pnr)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['amountDue'], 2168)
        self.assertEqual(body['currency'], 'INR')
        self.assertIsNotNone(body['holdExpiresAt'])
        self.assertEqual(body['payments'], [])
        self.assertEqual(
            [line['label'] for line in body['fareLines']],
            ['Seat fare', 'Service fee', 'GST'],
        )
        self.assertEqual(body['booking']['reference'], pnr)
        self.assertEqual(body['booking']['status'], 'pending')

    def test_a_hold_that_ran_out_is_released_on_the_next_attempt(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']
        self.backdate(pnr, minutes=20)

        response = self.pay(pnr)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'payment_expired')

        booking = Booking.objects.get(reference=pnr)
        self.assertEqual(booking.status, 'failed')
        self.assertEqual(BusBookingSeat.objects.count(), 0)
        self.assertEqual(self.seat_status('L1'), 'available')

        # And the same seat can be sold again.
        self.assertEqual(self.book(seat_ids=('L1',)).status_code, 201)

    def test_the_order_view_releases_a_hold_that_ran_out(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']
        self.backdate(pnr, minutes=20)

        body = self.order(pnr).json()
        self.assertEqual(body['booking']['status'], 'failed')
        self.assertIsNone(body['holdExpiresAt'])
        self.assertEqual(self.seat_status('L1'), 'available')

    def test_the_sweep_releases_stale_holds_and_leaves_fresh_ones(self):
        stale = self.book(seat_ids=('L1',)).json()['pnr']
        fresh = self.book(seat_ids=('L2',)).json()['pnr']
        self.backdate(stale, minutes=16)

        self.assertEqual(expire_stale(), 1)

        self.assertEqual(Booking.objects.get(reference=stale).status, 'failed')
        self.assertEqual(Booking.objects.get(reference=fresh).status, 'pending')
        self.assertEqual(self.seat_status('L1'), 'available')
        self.assertEqual(self.seat_status('L2'), 'booked')

    def test_a_paid_booking_is_never_swept(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr).status_code, 200)
        self.backdate(pnr, minutes=60)

        self.assertEqual(expire_stale(), 0)
        self.assertEqual(Booking.objects.get(reference=pnr).status, 'confirmed')

    @override_settings(PAYMENT_HOLD_MINUTES=5)
    def test_the_hold_length_comes_from_settings(self):
        pnr = self.book().json()['pnr']
        self.backdate(pnr, minutes=6)

        self.assertEqual(self.pay(pnr).status_code, 409)

    def test_the_account_list_closes_stale_holds_first(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']
        self.backdate(pnr, minutes=20)

        (summary,) = self.client.get(
            reverse('accounts:my-bookings')
        ).json()['bookings']

        self.assertEqual(summary['reference'], pnr)
        self.assertEqual(summary['status'], 'failed')

    def test_the_management_command_reports_what_it_released(self):
        from io import StringIO

        pnr = self.book().json()['pnr']
        self.backdate(pnr, minutes=20)

        out = StringIO()
        call_command('expire_payments', stdout=out)

        self.assertIn('Released 1 booking', out.getvalue())
        self.assertEqual(Booking.objects.get(reference=pnr).status, 'failed')


# ---------------------------------------------------------------------------
# Paying
# ---------------------------------------------------------------------------

class PayTests(PaymentsTestCase):

    def test_paying_confirms_the_booking(self):
        pnr = self.book().json()['pnr']

        response = self.pay(pnr)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['payment']['status'], 'success')
        self.assertEqual(body['payment']['method'], 'upi')
        self.assertEqual(body['payment']['methodLabel'], 'UPI')
        self.assertEqual(body['payment']['instrument'], 'rider@okhdfcbank')
        self.assertEqual(body['payment']['amount'], 2168)
        self.assertEqual(body['payment']['currency'], 'INR')
        self.assertRegex(body['payment']['transactionRef'], r'^TXN\d{6}[0-9A-F]{14}$')
        self.assertIsNotNone(body['payment']['paidAt'])

        # The whole ticket comes back with it, now confirmed.
        self.assertEqual(body['booking']['pnr'], pnr)
        self.assertEqual(body['booking']['status'], 'confirmed')
        self.assertEqual(body['booking']['paymentMethod'], 'rider@okhdfcbank')
        self.assertEqual(body['booking']['payment'], body['payment'])
        self.assertIsNone(body['booking']['holdExpiresAt'])

        booking = Booking.objects.get(reference=pnr)
        self.assertEqual(booking.status, 'confirmed')
        payment = booking.payments.get()
        self.assertEqual(payment.status, 'success')
        self.assertEqual(payment.amount, Decimal('2168.00'))
        self.assertIsNotNone(payment.paid_at)

    def test_a_declined_payment_is_recorded_and_the_booking_stays_held(self):
        pnr = self.book().json()['pnr']

        response = self.pay(pnr, DECLINED_UPI)
        self.assertEqual(response.status_code, 402)

        error = response.json()['error']
        self.assertEqual(error['code'], 'payment_declined')
        self.assertIn('UPI app declined', error['message'])
        self.assertTrue(error['detail']['transactionRef'].startswith('TXN'))
        self.assertEqual(error['detail']['reference'], pnr)
        self.assertIsNotNone(error['detail']['holdExpiresAt'])

        booking = Booking.objects.get(reference=pnr)
        self.assertEqual(booking.status, 'pending')
        payment = booking.payments.get()
        self.assertEqual(payment.status, 'failed')
        self.assertEqual(payment.instrument, 'failure@upi')
        self.assertIsNone(payment.paid_at)
        # The seats are still held for the retry.
        self.assertEqual(self.seat_status('L1'), 'booked')

    def test_a_declined_payment_can_be_retried_another_way(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr, DECLINED_UPI).status_code, 402)

        response = self.pay(pnr, CARD)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['booking']['status'], 'confirmed')

        statuses = list(
            Booking.objects.get(reference=pnr).payments
            .order_by('pk').values_list('status', flat=True)
        )
        self.assertEqual(statuses, ['failed', 'success'])

    def test_paying_twice_answers_with_the_payment_that_went_through(self):
        pnr = self.book().json()['pnr']
        first = self.pay(pnr).json()['payment']

        second = self.pay(pnr, CARD)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()['payment'], first)
        self.assertEqual(Booking.objects.get(reference=pnr).payments.count(), 1)

    def test_a_cancelled_booking_cannot_be_paid_for(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(
            self.client.post(
                reverse('accounts:cancel-booking', args=['bus', pnr])
            ).status_code,
            200,
        )

        response = self.pay(pnr)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'payment_not_allowed')

    def test_paying_needs_an_account(self):
        pnr = self.book().json()['pnr']
        del self.client.defaults['HTTP_AUTHORIZATION']

        self.assertEqual(self.pay(pnr).status_code, 401)

    def test_another_account_cannot_pay_for_my_booking(self):
        pnr = self.book().json()['pnr']
        other = AppUser.objects.create(
            full_name='Someone Else', email='demo+other@gmail.com',
            phone='9000000002', password_hash=make_password('a-good-password'),
        )

        response = self.pay(pnr, token=issue_token(other))
        # 404, not 403: a 403 would confirm the reference exists.
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')

    def test_an_unknown_mode_is_a_404(self):
        response = self.pay('SBZZZZZZ', mode='boat')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'unknown_booking_mode')

    def test_a_lowercase_reference_still_pays(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr.lower()).status_code, 200)


# ---------------------------------------------------------------------------
# Instruments
# ---------------------------------------------------------------------------

class InstrumentTests(PaymentsTestCase):

    def test_a_upi_id_has_to_look_like_one(self):
        pnr = self.book().json()['pnr']

        for bad in ('rider', 'rider@', '@okhdfcbank', 'a@b', ''):
            with self.subTest(upi=bad):
                response = self.pay(pnr, {'method': 'upi', 'upiId': bad})
                self.assertEqual(response.status_code, 400)
                self.assertIn('upiId', response.json()['error']['detail'])

        # Nothing was attempted, so nothing was recorded.
        self.assertEqual(Payment.objects.count(), 0)

    def test_a_upi_id_is_stored_lowercased(self):
        pnr = self.book().json()['pnr']
        body = self.pay(pnr, {'method': 'upi', 'upiId': 'Rider@OkHDFCBank'}).json()
        self.assertEqual(body['payment']['instrument'], 'rider@okhdfcbank')

    def test_a_card_is_checked_before_the_bank_is_asked(self):
        pnr = self.book().json()['pnr']

        cases = {
            'number': card(number='4242 4242 4242 4241'),   # fails Luhn
            'expiry': card(expiry='13/30'),
            'cvv': card(cvv='12'),
            'name': card(name='   '),
        }
        for field, payload in cases.items():
            with self.subTest(field=field):
                response = self.pay(pnr, payload)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()['error']['detail']['card'])

        response = self.pay(pnr, {'method': 'card'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('card', response.json()['error']['detail'])

        self.assertEqual(Payment.objects.count(), 0)

    def test_only_a_masked_card_is_ever_stored(self):
        pnr = self.book().json()['pnr']

        body = self.pay(pnr, CARD).json()
        self.assertEqual(body['payment']['instrument'], 'Visa •••• 4242')

        payment = Payment.objects.get()
        self.assertEqual(payment.instrument, 'Visa •••• 4242')
        self.assertNotIn('4242 4242', payment.instrument)
        self.assertNotIn('123', payment.instrument)

    def test_the_sandbox_cards_are_declined_as_documented(self):
        for number, reason in gateway.DECLINED_CARDS.items():
            with self.subTest(number=number):
                pnr = self.book(seat_ids=('L3',)).json()['pnr']
                response = self.pay(pnr, card(number=number))

                self.assertEqual(response.status_code, 402)
                self.assertEqual(response.json()['error']['message'], reason)
                Booking.objects.filter(reference=pnr).delete()

    def test_an_expired_card_is_declined(self):
        pnr = self.book().json()['pnr']

        response = self.pay(pnr, card(expiry='01/20'))
        self.assertEqual(response.status_code, 402)
        self.assertIn('expired', response.json()['error']['message'])

    def test_card_brands_are_recognised(self):
        self.assertEqual(gateway.card_brand('4242424242424242'), 'Visa')
        self.assertEqual(gateway.card_brand('5555555555554444'), 'Mastercard')
        self.assertEqual(gateway.card_brand('2223003122003222'), 'Mastercard')
        self.assertEqual(gateway.card_brand('378282246310005'), 'American Express')
        self.assertEqual(gateway.card_brand('6076810000000000'), 'RuPay')
        self.assertEqual(gateway.card_brand('3566002020360505'), 'JCB')

    def test_netbanking_needs_a_bank_from_the_list(self):
        pnr = self.book().json()['pnr']

        response = self.pay(pnr, {'method': 'netbanking', 'bank': 'Bank of Nowhere'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('bank', response.json()['error']['detail'])

        response = self.pay(pnr, {'method': 'netbanking'})
        self.assertEqual(response.status_code, 400)

        response = self.pay(pnr, {'method': 'netbanking', 'bank': 'HDFC Bank'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['payment']['instrument'], 'HDFC Bank')
        self.assertEqual(response.json()['payment']['method'], 'netbanking')

    def test_a_wallet_needs_a_wallet_from_the_list(self):
        pnr = self.book().json()['pnr']

        response = self.pay(pnr, {'method': 'wallet', 'wallet': 'CoinPurse'})
        self.assertEqual(response.status_code, 400)

        response = self.pay(pnr, {'method': 'wallet', 'wallet': 'Paytm'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['payment']['instrument'], 'Paytm')

    def test_an_unknown_method_is_rejected(self):
        pnr = self.book().json()['pnr']
        response = self.pay(pnr, {'method': 'cheque'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('method', response.json()['error']['detail'])

    def test_the_fields_of_other_methods_are_ignored(self):
        pnr = self.book().json()['pnr']
        response = self.pay(pnr, {**UPI, 'bank': 'Bank of Nowhere', 'card': {}})
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Transactions and receipts
# ---------------------------------------------------------------------------

class TransactionTests(PaymentsTestCase):

    def test_the_list_shows_every_attempt_newest_first(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr, DECLINED_UPI).status_code, 402)
        self.assertEqual(self.pay(pnr, CARD).status_code, 200)

        response = self.transactions()
        self.assertEqual(response.status_code, 200)

        rows = response.json()['transactions']
        self.assertEqual([row['status'] for row in rows], ['success', 'failed'])
        self.assertEqual(rows[0]['instrument'], 'Visa •••• 4242')
        self.assertEqual(rows[1]['instrument'], 'failure@upi')
        self.assertEqual(rows[0]['booking']['reference'], pnr)
        self.assertEqual(rows[0]['booking']['mode'], 'bus')
        self.assertEqual(rows[0]['booking']['status'], 'confirmed')
        self.assertEqual(rows[0]['booking']['totalAmount'], 2168)

    def test_the_list_needs_an_account_and_shows_only_mine(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr).status_code, 200)

        other = AppUser.objects.create(
            full_name='Someone Else', email='demo+other@gmail.com',
            phone='9000000002', password_hash=make_password('a-good-password'),
        )
        self.assertEqual(
            self.transactions(issue_token(other)).json()['transactions'], [],
        )

        del self.client.defaults['HTTP_AUTHORIZATION']
        self.assertEqual(self.transactions().status_code, 401)

    def test_a_receipt_carries_the_fare_lines(self):
        pnr = self.book().json()['pnr']
        ref = self.pay(pnr).json()['payment']['transactionRef']

        response = self.receipt(ref)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['transactionRef'], ref)
        self.assertEqual(body['amount'], 2168)
        self.assertEqual(body['booking']['reference'], pnr)
        self.assertEqual(body['booking']['contactEmail'], 'demo@gmail.com')
        self.assertEqual(
            [(line['label'], line['amount']) for line in body['fareLines']],
            [('Seat fare', 2040), ('Service fee', 25), ('GST', 103)],
        )

    def test_a_receipt_is_only_readable_by_its_owner(self):
        pnr = self.book().json()['pnr']
        ref = self.pay(pnr).json()['payment']['transactionRef']

        other = AppUser.objects.create(
            full_name='Someone Else', email='demo+other@gmail.com',
            phone='9000000002', password_hash=make_password('a-good-password'),
        )
        response = self.client.get(
            reverse('payments:transaction-detail', args=[ref]),
            HTTP_AUTHORIZATION=f'Bearer {issue_token(other)}',
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'transaction_not_found')

    def test_a_cancellation_shows_as_a_refund(self):
        pnr = self.book().json()['pnr']
        ref = self.pay(pnr).json()['payment']['transactionRef']

        response = self.client.post(
            reverse('accounts:cancel-booking', args=['bus', pnr])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['refundAmount'], '2168.00')

        body = self.receipt(ref).json()
        self.assertEqual(body['status'], 'refunded')
        self.assertEqual(body['booking']['status'], 'cancelled')
        self.assertIsNotNone(body['booking']['cancelledAt'])

    def test_the_ticket_prints_the_payment_that_went_through(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr, DECLINED_UPI).status_code, 402)
        self.assertEqual(self.pay(pnr).status_code, 200)

        ticket = self.client.get(
            reverse('bus:booking-detail', args=[pnr])
        ).json()
        self.assertEqual(ticket['status'], 'confirmed')
        self.assertEqual(ticket['paymentMethod'], 'rider@okhdfcbank')
        self.assertEqual(ticket['payment']['status'], 'success')

    def test_a_ticket_with_only_a_failed_attempt_prints_no_method(self):
        pnr = self.book().json()['pnr']
        self.assertEqual(self.pay(pnr, DECLINED_UPI).status_code, 402)

        ticket = self.client.get(
            reverse('bus:booking-detail', args=[pnr])
        ).json()
        self.assertEqual(ticket['status'], 'pending')
        self.assertEqual(ticket['paymentMethod'], '')
        self.assertEqual(ticket['payment']['status'], 'failed')
        self.assertIsNotNone(ticket['holdExpiresAt'])


# ---------------------------------------------------------------------------
# The sweep that rides on ordinary traffic
# ---------------------------------------------------------------------------

@override_settings(PAYMENT_SWEEP_INTERVAL_SECONDS=0)
class SweepMiddlewareTests(PaymentsTestCase):

    def test_a_search_frees_a_seat_whose_hold_ran_out(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']
        self.backdate(pnr, minutes=20)

        # Anybody's request will do - here, someone looking at the seat map.
        del self.client.defaults['HTTP_AUTHORIZATION']
        self.assertEqual(self.seat_status('L1'), 'available')
        self.assertEqual(Booking.objects.get(reference=pnr).status, 'failed')

    def test_paying_for_a_swept_booking_says_it_expired(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']
        self.backdate(pnr, minutes=20)
        self.seat_status('L1')      # the sweep runs here

        response = self.pay(pnr)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'payment_expired')
