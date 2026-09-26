"""
Tests for the cab API.

The models are `managed = False`, so the test database has no tables for them:
`migrate` skips unmanaged models by design. `CabApiTestCase` builds them with
the schema editor instead, which means these run against SQLite without a
MySQL server - the point being to pin the *behaviour* (trip classification,
rate-card selection, the fare split) rather than the storage.

What that deliberately does not cover: the CHECK constraints come from
schema.sql and only exist in MySQL, so the trip-type and extra-code tests
prove this module's own rules, not the constraints behind them.
"""
import json
import math
from datetime import date as date_cls, time as time_cls, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.db import connection
from django.test import TransactionTestCase
from django.urls import reverse

from django.utils import timezone

from accounts.authentication import issue_token

from cab.models import (
    AppUser,
    Booking,
    BookingFareLine,
    CabBooking,
    CabBookingExtra,
    CabCategory,
    CabExtra,
    CabRateCard,
    City,
    Offer,
    Payment,
)

def js_round(value):
    """
    `Math.round`, which rounds a half away from zero.

    Python's own `round` uses banker's rounding, so `round(150.5)` is 150
    where JavaScript gives 151 - and the server deliberately matches the front
    end. Using the wrong one here would fail a correct implementation.
    """
    return math.floor(value + 0.5)


# Dependency order: each table's foreign keys point at one already created.
SCHEMA_MODELS = [
    City, AppUser, Offer,
    CabCategory, CabRateCard, CabExtra,
    Booking, BookingFareLine, Payment, CabBooking, CabBookingExtra,
]


class CabApiTestCase(TransactionTestCase):
    """
    Base class: creates the unmanaged tables, then four cab types with cards
    for all three kinds of journey.

    TransactionTestCase rather than TestCase because `create_booking` manages
    its own transaction, and the per-test atomic block TestCase wraps around
    everything would hide a rollback rather than let it happen.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in SCHEMA_MODELS:
                editor.create_model(model)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in reversed(SCHEMA_MODELS):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        # TransactionTestCase flushes between tests by asking the introspection
        # layer for Django's table names, and unmanaged models are not in that
        # list - so these tables have to be emptied by hand.
        for model in reversed(SCHEMA_MODELS):
            model.objects.all().delete()

        # Booking requires an account, so every test signs one in. Search and
        # quote stay open to an anonymous visitor and are exercised that way in
        # the sign-in tests at the bottom of this file.
        self.account = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9000000001', password_hash=make_password('a-good-password'),
            is_active=True,
        )
        self.client.defaults['HTTP_AUTHORIZATION'] = (
            f'Bearer {issue_token(self.account)}'
        )

        self.travel_date = timezone.localdate() + timedelta(days=5)

        self.hatchback = CabCategory.objects.create(
            code='hatchback', name='Hatchback',
            vehicle_models='Swift, WagonR or similar',
            seats=4, luggage=2, rating=Decimal('4.2'),
        )
        self.sedan = CabCategory.objects.create(
            code='sedan', name='Sedan', vehicle_models='Dzire, Etios or similar',
            seats=4, luggage=3, rating=Decimal('4.4'),
        )
        self.suv = CabCategory.objects.create(
            code='suv', name='SUV', vehicle_models='Ertiga, Marazzo or similar',
            seats=6, luggage=4, rating=Decimal('4.5'),
        )
        self.retired = CabCategory.objects.create(
            code='premium', name='Premium SUV',
            vehicle_models='Innova Crysta or similar',
            seats=6, luggage=4, is_active=False,
        )

        # Outstation cards for the three active types. The SUV is dearest.
        for category, per_km in (
            (self.hatchback, '12.00'), (self.sedan, '14.00'), (self.suv, '18.00'),
        ):
            CabRateCard.objects.create(
                category=category, trip_type='outstation',
                per_km_rate=Decimal(per_km), minimum_km=100,
                extra_km_rate=Decimal(per_km),
                driver_allowance=Decimal('300.00'),
                night_charge=Decimal('250.00'),
                cancellation_note='Free cancellation up to 2 hours before pickup',
            )

        # Only the sedan is priced for airport runs, on a lower minimum.
        self.airport_card = CabRateCard.objects.create(
            category=self.sedan, trip_type='airport',
            per_km_rate=Decimal('20.00'), minimum_km=20,
            extra_km_rate=Decimal('22.00'),
            driver_allowance=Decimal('0.00'), night_charge=Decimal('150.00'),
            cancellation_note='Free cancellation up to 1 hour before pickup',
        )

        self.carrier = CabExtra.objects.create(
            code='carrier', label='Roof carrier',
            description='For bulky luggage that will not fit in the boot.',
            price=Decimal('300.00'),
        )
        self.child_seat = CabExtra.objects.create(
            code='childSeat', label='Child seat',
            description='Rear-facing seat for children under four.',
            price=Decimal('250.00'),
        )
        self.withdrawn = CabExtra.objects.create(
            code='extraStop', label='One extra stop',
            price=Decimal('200.00'), is_active=False,
        )

    # -- helpers ------------------------------------------------------------

    def cabs(self, pickup='Mumbai', drop='Pune', date=None, time='09:00'):
        return self.client.get(reverse('cab:cab-list'), {
            'pickup': pickup, 'drop': drop,
            'date': (date or self.travel_date).isoformat(), 'time': time,
        })

    def estimate(self, pickup='Mumbai', drop='Pune', time='09:00'):
        return self.client.get(reverse('cab:estimate'), {
            'pickup': pickup, 'drop': drop,
            'date': self.travel_date.isoformat(), 'time': time,
        })

    def booking_payload(self, **overrides):
        payload = {
            'categoryCode': 'sedan',
            'date': self.travel_date.isoformat(),
            'time': '09:00',
            'details': {
                'pickupAddress': 'Mumbai',
                'dropAddress': 'Pune',
                'name': 'A Passenger',
                'phone': '9876543210',
                'email': 'demo@gmail.com',
            },
            'extras': ['carrier'],
        }
        payload.update(overrides)
        return payload

    def book(self, **kwargs):
        return self.client.post(
            reverse('cab:booking-create'),
            data=json.dumps(self.booking_payload(**kwargs)),
            content_type='application/json',
        )

    def pay(self, reference, **payment):
        """
        Pay for a booking through the payments module - by netbanking unless
        the test says otherwise. Booking only holds the inventory now; this
        is what turns a `pending` booking into a `confirmed` one.
        """
        return self.client.post(
            reverse('payments:pay', args=['cab', reference]),
            data=json.dumps(
                payment or {'method': 'netbanking', 'bank': 'HDFC Bank'}
            ),
            content_type='application/json',
        )


class EstimateTests(CabApiTestCase):

    def test_two_different_places_read_as_an_outstation_run(self):
        estimate = self.estimate().json()

        self.assertEqual(estimate['tripType'], 'outstation')
        self.assertGreaterEqual(estimate['distanceKm'], 60)
        self.assertLessEqual(estimate['distanceKm'], 520)
        self.assertIs(estimate['nightTrip'], False)

    def test_the_same_place_at_both_ends_is_a_local_trip(self):
        estimate = self.estimate(pickup='Pune', drop='pune ').json()

        self.assertEqual(estimate['tripType'], 'local')
        self.assertLessEqual(estimate['distanceKm'], 30)

    def test_an_airport_at_either_end_is_an_airport_transfer(self):
        self.assertEqual(
            self.estimate(drop='Mumbai Airport T2').json()['tripType'],
            'airport',
        )
        self.assertEqual(
            self.estimate(pickup='Terminal 1', drop='Andheri').json()['tripType'],
            'airport',
        )

    def test_duration_follows_the_distance(self):
        estimate = self.estimate().json()
        self.assertEqual(
            estimate['durationMinutes'],
            round(estimate['distanceKm'] / 45 * 60),
        )

    def test_the_same_route_always_estimates_the_same_trip(self):
        first = self.estimate().json()
        second = self.estimate().json()
        self.assertEqual(first, second)

    def test_a_late_pickup_is_a_night_trip(self):
        self.assertIs(self.estimate(time='23:30').json()['nightTrip'], True)
        self.assertIs(self.estimate(time='05:45').json()['nightTrip'], True)
        self.assertIs(self.estimate(time='06:00').json()['nightTrip'], False)
        self.assertIs(self.estimate(time='21:59').json()['nightTrip'], False)

    def test_a_missing_time_is_rejected(self):
        response = self.client.get(reverse('cab:estimate'), {
            'pickup': 'Mumbai', 'drop': 'Pune',
            'date': self.travel_date.isoformat(),
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('time', response.json()['error']['detail'])


class CabSearchTests(CabApiTestCase):

    def test_returns_the_options_in_the_shape_the_front_end_expects(self):
        response = self.cabs()
        self.assertEqual(response.status_code, 200)

        options = response.json()
        self.assertEqual([option['category'] for option in options],
                         ['hatchback', 'sedan', 'suv'])

        first = options[0]
        self.assertEqual(first['id'], str(self.hatchback.pk))
        self.assertEqual(first['name'], 'Hatchback')
        self.assertEqual(first['models'], 'Swift, WagonR or similar')
        self.assertEqual(first['seats'], 4)
        self.assertEqual(first['luggage'], 2)
        self.assertIs(first['airConditioned'], True)
        self.assertEqual(first['rating'], 4.2)
        self.assertEqual(first['extraKmRate'], 12)
        self.assertIn('Free cancellation', first['cancellation'])
        self.assertGreater(first['etaMinutes'], 0)

    def test_options_come_back_cheapest_first(self):
        fares = [option['baseFare'] for option in self.cabs().json()]
        self.assertEqual(fares, sorted(fares))

    def test_the_base_fare_covers_the_included_kilometres(self):
        distance = self.estimate().json()['distanceKm']
        (hatchback, *_) = self.cabs().json()

        self.assertEqual(hatchback['includedKm'], max(distance, 100))
        # 12 a km, rounded to the nearest ten.
        self.assertEqual(
            hatchback['baseFare'],
            js_round(hatchback['includedKm'] * 12 / 10) * 10,
        )

    def test_a_short_run_still_pays_the_minimum(self):
        # An airport transfer is well under 100 km, and the airport card's
        # minimum is 20.
        (sedan,) = self.cabs(drop='Mumbai Airport T2').json()
        distance = self.estimate(drop='Mumbai Airport T2').json()['distanceKm']

        self.assertEqual(sedan['includedKm'], max(distance, 20))

    def test_inclusions_name_the_included_distance_and_the_trip_type(self):
        (hatchback, sedan, _) = self.cabs().json()

        self.assertIn(f'{hatchback["includedKm"]} km included',
                      hatchback['inclusions'])
        self.assertIn('AC cab', hatchback['inclusions'])
        self.assertIn('AC cab with charging point', sedan['inclusions'])
        # Outstation only.
        self.assertIn('One way drop, no return fare', hatchback['inclusions'])

    def test_a_local_trip_does_not_promise_a_one_way_drop(self):
        # No local cards are loaded, so nothing is priced for it.
        self.assertEqual(self.cabs(pickup='Pune', drop='Pune').json(), [])

    def test_only_categories_priced_for_the_journey_are_offered(self):
        options = self.cabs(drop='Mumbai Airport T2').json()
        self.assertEqual([option['category'] for option in options], ['sedan'])

    def test_a_withdrawn_category_is_never_offered(self):
        CabRateCard.objects.create(
            category=self.retired, trip_type='outstation',
            per_km_rate=Decimal('25.00'), minimum_km=100,
            extra_km_rate=Decimal('25.00'),
        )

        codes = [option['category'] for option in self.cabs().json()]
        self.assertNotIn('premium', codes)

    def test_a_card_that_has_expired_is_not_used(self):
        CabRateCard.objects.filter(trip_type='outstation').update(
            valid_to=self.travel_date - timedelta(days=1),
        )
        self.assertEqual(self.cabs().json(), [])

    def test_the_most_recently_started_card_wins(self):
        CabRateCard.objects.create(
            category=self.hatchback, trip_type='outstation',
            per_km_rate=Decimal('20.00'), minimum_km=100,
            extra_km_rate=Decimal('20.00'),
            valid_from=self.travel_date - timedelta(days=1),
        )

        hatchback = next(
            option for option in self.cabs().json()
            if option['category'] == 'hatchback'
        )
        self.assertEqual(hatchback['extraKmRate'], 20)


class ExtraListTests(CabApiTestCase):

    def test_only_the_extras_on_sale_are_published(self):
        response = self.client.get(reverse('cab:extra-list'))
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual([extra['id'] for extra in body],
                         ['carrier', 'childSeat'])
        self.assertEqual(body[0], {
            'id': 'carrier', 'label': 'Roof carrier',
            'description': 'For bulky luggage that will not fit in the boot.',
            'price': 300,
        })


class QuoteTests(CabApiTestCase):

    def quote(self, **overrides):
        payload = {
            'categoryCode': 'sedan',
            'pickup': 'Mumbai',
            'drop': 'Pune',
            'date': self.travel_date.isoformat(),
            'time': '09:00',
            'extras': ['carrier'],
        }
        payload.update(overrides)
        return self.client.post(
            reverse('cab:quote'),
            data=json.dumps(payload), content_type='application/json',
        )

    def test_matches_the_formula_the_fare_summary_uses(self):
        fare = self.quote().json()
        estimate = fare['estimate']
        distance = estimate['distanceKm']

        included = max(distance, 100)
        base = js_round(included * 14 / 10) * 10
        tolls = js_round(distance * 2.4 / 10) * 10
        allowance = 300 if distance > 250 else 0
        taxable = base + 300 + allowance + tolls
        gst = js_round(taxable * 0.05)

        self.assertEqual(fare['baseFare'], base)
        self.assertEqual(fare['extras'], 300)
        self.assertEqual(fare['driverAllowance'], allowance)
        self.assertEqual(fare['tollsAndStateTax'], tolls)
        self.assertEqual(fare['nightCharge'], 0)
        self.assertEqual(fare['gst'], gst)
        self.assertEqual(fare['total'], taxable + gst)

    def test_the_advance_is_a_fifth_rounded_to_tens(self):
        fare = self.quote().json()

        self.assertEqual(fare['payNow'], js_round(fare['total'] * 0.2 / 10) * 10)
        self.assertEqual(fare['payToDriver'], fare['total'] - fare['payNow'])

    def test_a_night_pickup_adds_the_card_s_night_charge(self):
        day = self.quote(time='09:00').json()
        night = self.quote(time='23:30').json()

        self.assertEqual(day['nightCharge'], 0)
        self.assertEqual(night['nightCharge'], 250)

    def test_an_airport_transfer_has_no_tolls_or_allowance(self):
        fare = self.quote(drop='Mumbai Airport T2').json()

        self.assertEqual(fare['tollsAndStateTax'], 0)
        self.assertEqual(fare['driverAllowance'], 0)

    def test_extras_add_up_and_are_charged_once_for_the_trip(self):
        none = self.quote(extras=[]).json()
        one = self.quote(extras=['carrier']).json()
        two = self.quote(extras=['carrier', 'childSeat']).json()

        self.assertEqual(none['extras'], 0)
        self.assertEqual(one['extras'], 300)
        self.assertEqual(two['extras'], 550)

    def test_a_withdrawn_extra_is_rejected(self):
        response = self.quote(extras=['extraStop'])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_a_category_with_no_card_for_this_journey_is_a_409(self):
        response = self.quote(categoryCode='hatchback', drop='Mumbai Airport T2')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'no_rate_card')
        self.assertEqual(response.json()['error']['detail']['tripType'], 'airport')

    def test_a_withdrawn_category_is_a_404(self):
        response = self.quote(categoryCode='premium')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'category_not_found')


class BookingTests(CabApiTestCase):

    def test_a_booking_returns_the_confirmation_the_voucher_renders(self):
        response = self.book()
        self.assertEqual(response.status_code, 201)

        body = response.json()
        self.assertRegex(body['bookingId'], r'^CB[A-Z2-9]{6}$')
        self.assertEqual(body['status'], 'pending')
        self.assertEqual(body['option']['category'], 'sedan')
        self.assertEqual(body['query'], {
            'pickup': 'Mumbai', 'drop': 'Pune',
            'date': self.travel_date.isoformat(), 'time': '09:00',
        })
        self.assertEqual(body['estimate']['tripType'], 'outstation')
        self.assertEqual(body['details'], {
            'pickupAddress': 'Mumbai', 'dropAddress': 'Pune',
            'date': self.travel_date.isoformat(), 'time': '09:00',
            'name': 'A Passenger', 'phone': '9876543210',
            'email': 'demo@gmail.com',
        })
        self.assertEqual(body['extras'], ['carrier'])
        # Nothing has been paid yet: the payments module does that next.
        self.assertEqual(body['paymentMethod'], '')
        self.assertIsNone(body['payment'])
        self.assertIsNotNone(body['holdExpiresAt'])
        # Assigned two hours before pickup, so nothing yet.
        self.assertIsNone(body['driver'])

    def test_the_fare_on_the_voucher_matches_a_quote_for_the_same_trip(self):
        quoted = self.client.post(
            reverse('cab:quote'),
            data=json.dumps({
                'categoryCode': 'sedan', 'pickup': 'Mumbai', 'drop': 'Pune',
                'date': self.travel_date.isoformat(), 'time': '09:00',
                'extras': ['carrier'],
            }),
            content_type='application/json',
        ).json()

        booked = self.book().json()['fare']
        self.assertEqual(booked['total'], quoted['total'])
        self.assertEqual(booked['payNow'], quoted['payNow'])
        self.assertEqual(booked['payToDriver'], quoted['payToDriver'])

    def test_a_booking_writes_every_row_the_schema_expects(self):
        body = self.book().json()
        self.assertEqual(self.pay(body['bookingId']).status_code, 200)

        booking = Booking.objects.get(reference=body['bookingId'])
        self.assertEqual(booking.mode, 'cab')
        self.assertEqual(booking.status, 'confirmed')
        # The account comes from the token, not the payload.
        self.assertEqual(booking.user_id, self.account.pk)
        self.assertEqual(booking.contact_email, 'demo@gmail.com')
        self.assertEqual(
            booking.total_amount, Decimal(str(body['fare']['total'])),
        )

        cab_booking = CabBooking.objects.get(pk=booking.pk)
        self.assertEqual(cab_booking.category_id, self.sedan.pk)
        self.assertIsNotNone(cab_booking.rate_card_id)
        self.assertEqual(cab_booking.trip_type, 'outstation')
        self.assertEqual(cab_booking.pickup_address, 'Mumbai')
        self.assertEqual(cab_booking.passenger_name, 'A Passenger')
        self.assertIs(cab_booking.is_night_trip, False)
        self.assertGreater(cab_booking.distance_km, 0)
        self.assertIsNone(cab_booking.driver_name)

        extra_row = cab_booking.extras.get()
        self.assertEqual(extra_row.extra_id, self.carrier.pk)
        self.assertEqual(extra_row.amount, Decimal('300.00'))

        labels = [line.label for line in booking.fare_lines.all()]
        self.assertIn('Extras', labels)
        self.assertIn('GST', labels)
        self.assertEqual(labels[0], f'{body["option"]["includedKm"]} km base fare')

    def test_only_the_advance_is_taken_online(self):
        body = self.book().json()
        self.assertEqual(self.pay(body['bookingId']).status_code, 200)
        booking = Booking.objects.get(reference=body['bookingId'])

        payment = booking.payments.get()
        self.assertEqual(payment.method, 'netbanking')
        self.assertEqual(payment.status, 'success')
        # The driver collects the rest, so the card is charged pay_now only.
        self.assertEqual(payment.amount, Decimal(str(body['fare']['payNow'])))
        self.assertLess(payment.amount, booking.total_amount)

    def test_the_pickup_time_is_stored_as_one_instant(self):
        body = self.book(time='23:30').json()
        cab_booking = CabBooking.objects.get(
            booking__reference=body['bookingId'],
        )

        local_pickup = timezone.localtime(cab_booking.pickup_at)
        self.assertEqual(local_pickup.date(), self.travel_date)
        self.assertEqual(local_pickup.strftime('%H:%M'), '23:30')
        self.assertIs(cab_booking.is_night_trip, True)

    def test_a_fare_line_is_only_written_when_it_is_charged(self):
        body = self.book(
            categoryCode='sedan', extras=[],
            details={
                'pickupAddress': 'Mumbai Airport T2',
                'dropAddress': 'Andheri',
                'name': 'A Passenger', 'phone': '9876543210',
                'email': 'demo@gmail.com',
            },
        ).json()

        booking = Booking.objects.get(reference=body['bookingId'])
        labels = [line.label for line in booking.fare_lines.all()]
        # An airport run at 09:00 with no extras: no extras, no allowance, no
        # tolls, no night charge.
        self.assertEqual(labels, [
            f'{body["option"]["includedKm"]} km base fare', 'GST',
        ])

    def test_the_estimate_is_taken_from_the_addresses_not_the_client(self):
        # A client cannot understate the distance to pay less: the payload has
        # no distance field at all, and the addresses decide it.
        payload = self.booking_payload()
        payload['estimate'] = {'distanceKm': 1, 'tripType': 'local'}

        body = self.client.post(
            reverse('cab:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        ).json()

        self.assertEqual(body['estimate']['tripType'], 'outstation')
        self.assertGreaterEqual(body['estimate']['distanceKm'], 60)

    def test_a_pickup_in_the_past_is_rejected(self):
        response = self.book(
            date=(timezone.localdate() - timedelta(days=1)).isoformat(),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')
        self.assertEqual(Booking.objects.count(), 0)

    def test_a_category_with_no_card_for_this_journey_is_a_409(self):
        response = self.book(
            categoryCode='hatchback',
            details={
                'pickupAddress': 'Mumbai Airport T2',
                'dropAddress': 'Andheri',
                'name': 'A Passenger', 'phone': '9876543210',
                'email': 'demo@gmail.com',
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'no_rate_card')
        self.assertEqual(Booking.objects.count(), 0)

    def test_a_withdrawn_extra_is_rejected(self):
        response = self.book(extras=['extraStop'])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Booking.objects.count(), 0)

    def test_the_same_extra_twice_is_rejected(self):
        response = self.book(extras=['carrier', 'carrier'])
        self.assertEqual(response.status_code, 400)

    def test_a_bad_phone_number_is_rejected(self):
        payload = self.booking_payload()
        payload['details']['phone'] = '12345'

        response = self.client.post(
            reverse('cab:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('details', response.json()['error']['detail'])


class PaymentTests(CabApiTestCase):
    """The hand-off to the payments module, seen from this side."""

    def test_a_new_booking_waits_for_payment(self):
        body = self.book().json()

        self.assertEqual(body['status'], 'pending')
        self.assertIsNone(body['payment'])
        self.assertIsNotNone(body['holdExpiresAt'])
        self.assertEqual(
            Booking.objects.get(reference=body['bookingId']).payments.count(), 0,
        )

    def test_paying_confirms_the_booking_and_prints_the_payment(self):
        created = self.book().json()

        response = self.pay(created['bookingId'])
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['booking']['bookingId'], created['bookingId'])
        self.assertEqual(body['booking']['status'], 'confirmed')
        self.assertEqual(body['booking']['paymentMethod'], 'HDFC Bank')
        self.assertIsNone(body['booking']['holdExpiresAt'])
        self.assertEqual(body['booking']['payment'], body['payment'])

        self.assertEqual(body['payment']['status'], 'success')
        self.assertEqual(body['payment']['method'], 'netbanking')
        self.assertEqual(body['payment']['instrument'], 'HDFC Bank')
        self.assertTrue(body['payment']['transactionRef'].startswith('TXN'))
        self.assertIsNotNone(body['payment']['paidAt'])
        # Only the advance is taken online; the driver collects the rest.
        self.assertEqual(body['payment']['amount'], created['fare']['payNow'])


class BookingLookupTests(CabApiTestCase):

    def test_a_voucher_can_be_fetched_back_by_booking_id(self):
        created = self.book().json()

        response = self.client.get(
            reverse('cab:booking-detail', args=[created['bookingId']])
        )
        self.assertEqual(response.status_code, 200)

        fetched = response.json()
        self.assertEqual(fetched['fare'], created['fare'])
        self.assertEqual(fetched['details'], created['details'])
        self.assertEqual(fetched['estimate'], created['estimate'])
        self.assertEqual(fetched['extras'], created['extras'])
        self.assertEqual(fetched['option'], created['option'])

    def test_a_lowercase_booking_id_still_resolves(self):
        booking_id = self.book().json()['bookingId']

        response = self.client.get(
            reverse('cab:booking-detail', args=[booking_id.lower()])
        )
        self.assertEqual(response.status_code, 200)

    def test_the_fare_on_a_voucher_is_the_one_that_was_quoted(self):
        created = self.book().json()

        CabRateCard.objects.filter(
            category=self.sedan, trip_type='outstation',
        ).update(per_km_rate=Decimal('30.00'))

        fetched = self.client.get(
            reverse('cab:booking-detail', args=[created['bookingId']])
        ).json()
        self.assertEqual(fetched['fare'], created['fare'])

    def test_the_driver_appears_once_a_vehicle_is_assigned(self):
        created = self.book().json()

        CabBooking.objects.filter(
            booking__reference=created['bookingId'],
        ).update(
            driver_name='R Kumar', driver_phone='9812345678',
            vehicle_number='MH 12 AB 3456',
        )

        fetched = self.client.get(
            reverse('cab:booking-detail', args=[created['bookingId']])
        ).json()
        self.assertEqual(fetched['driver'], {
            'name': 'R Kumar', 'phone': '9812345678',
            'vehicleNumber': 'MH 12 AB 3456',
        })

    def test_an_unknown_booking_id_is_a_404(self):
        response = self.client.get(
            reverse('cab:booking-detail', args=['CBZZZZZZ'])
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')


class TripClassificationUnitTests(CabApiTestCase):
    """The rules the estimate is built on, checked directly."""

    def test_airport_words_are_matched_anywhere_in_the_address(self):
        from cab.services import classify_trip

        self.assertEqual(classify_trip('Flat 4, near T3', 'Gurugram'), 'airport')
        self.assertEqual(classify_trip('Andheri', 'CSMT Airport Road'), 'airport')
        self.assertEqual(classify_trip('Andheri', 'Colaba'), 'outstation')

    def test_the_night_window_runs_from_ten_to_six(self):
        from cab.services import is_night_trip

        self.assertIs(is_night_trip(time_cls(22, 0)), True)
        self.assertIs(is_night_trip(time_cls(0, 30)), True)
        self.assertIs(is_night_trip(time_cls(5, 59)), True)
        self.assertIs(is_night_trip(time_cls(6, 0)), False)
        self.assertIs(is_night_trip(time_cls(21, 59)), False)

    def test_a_card_with_open_ended_validity_always_applies(self):
        from cab.services import active_rate_card

        card = active_rate_card(self.sedan, 'outstation', date_cls(2030, 1, 1))
        self.assertIsNotNone(card)
        self.assertEqual(card.per_km_rate, Decimal('14.00'))

class BookingSummaryTests(CabApiTestCase):
    """
    The row `GET /api/auth/me/bookings/` shows for a cab ticket.

    Asserting that `title` and `detail` are strings is not idle: the first
    version of the bus summary handed back a model instance for `detail`,
    which only surfaced as a JSON encoder error at the aggregate endpoint.
    """

    def test_a_booking_summarises_for_the_account_ticket_list(self):
        from cab import services
        from cab.serializers import serialise_booking_summary

        self.assertEqual(self.book().status_code, 201)

        (row,) = services.list_bookings(self.account.pk)
        summary = serialise_booking_summary(row)

        self.assertEqual(
            set(summary),
            {
                'reference', 'mode', 'status', 'title', 'detail',
                'travelDate', 'endDate', 'amount', 'currency', 'bookedAt',
            },
        )
        self.assertEqual(summary['mode'], 'cab')
        self.assertIsInstance(summary['title'], str)
        self.assertIsInstance(summary['detail'], str)
        self.assertTrue(summary['title'])
        self.assertTrue(summary['detail'])
        self.assertIsInstance(summary['travelDate'], str)
        self.assertIsInstance(summary['amount'], (int, float))
        self.assertEqual(summary['currency'], 'INR')
        self.assertIsNone(summary["endDate"])

    def test_the_list_is_scoped_to_the_account(self):
        from cab import services

        self.assertEqual(self.book().status_code, 201)

        stranger = AppUser.objects.create(
            full_name='Someone Else', email='demo+summary@gmail.com',
            phone='9000009599', password_hash='x',
        )
        self.assertEqual(list(services.list_bookings(stranger.pk)), [])
        self.assertEqual(len(services.list_bookings(self.account.pk)), 1)
