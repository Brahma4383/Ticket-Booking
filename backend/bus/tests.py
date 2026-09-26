"""
Tests for the bus API.

The models are `managed = False`, so the test database has no tables for them:
`migrate` skips unmanaged models by design. `BusApiTestCase` builds them with
the schema editor instead, which means these run against SQLite without a
MySQL server - the point being to pin the *behaviour* (availability by date,
the fare formula, the seat locking) rather than the storage.

What that deliberately does not cover: the CHECK constraints and
uq_bus_seat_per_date come from schema.sql and only exist in MySQL. The
double-booking test therefore proves the service layer's own check, not the
constraint standing behind it.
"""
import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.db import connection
from django.test import TransactionTestCase
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

# Dependency order: each table's foreign keys point at one already created.
SCHEMA_MODELS = [
    City, AppUser, Offer,
    BusOperator, BusAmenity, BusTrip, BusTripAmenity, BusStopPoint, BusSeat,
    Booking, BookingFareLine, Payment, BusBooking, BusBookingSeat,
]


class BusApiTestCase(TransactionTestCase):
    """
    Base class: creates the unmanaged tables, then a Mumbai to Pune sleeper.

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

        self.travel_date = timezone.localdate() + timedelta(days=7)

        self.mumbai = City.objects.create(name='Mumbai', state='Maharashtra')
        self.pune = City.objects.create(name='Pune', state='Maharashtra')
        self.nashik = City.objects.create(name='Nashik', state='Maharashtra')

        self.operator = BusOperator.objects.create(
            name='Sharma Travels', rating=Decimal('4.3'), rating_count=1204,
        )
        self.wifi = BusAmenity.objects.create(name='Wi-Fi')
        self.charging = BusAmenity.objects.create(name='Charging point')

        self.trip = BusTrip.objects.create(
            operator=self.operator,
            coach_name='Volvo 9600 Multi-Axle',
            seat_kind='sleeper',
            is_air_conditioned=True,
            layout='2+1',
            origin_city=self.mumbai,
            destination_city=self.pune,
            departure_time='22:00',
            arrival_time='05:30',
            duration_minutes=450,
            arrives_next_day=True,
            base_fare=Decimal('900.00'),
            cancellation_policy='Free cancellation up to 12 hours before departure.',
            has_live_tracking=True,
        )
        BusTripAmenity.objects.create(trip=self.trip, amenity=self.wifi)
        BusTripAmenity.objects.create(trip=self.trip, amenity=self.charging)

        self.boarding = BusStopPoint.objects.create(
            trip=self.trip, kind=BusStopPoint.BOARDING,
            name='Mumbai Central Bus Stand',
            landmark='Platform 3, near the enquiry desk',
            stop_time='21:40', sort_order=0,
        )
        self.dropping = BusStopPoint.objects.create(
            trip=self.trip, kind=BusStopPoint.DROPPING,
            name='Pune Bus Terminal', landmark='Arrival bay 1',
            stop_time='05:45', sort_order=0,
        )

        # A 2+1 sleeper: columns 1, 2, aisle, 4 - two rows on each deck.
        self.seats = {}
        for deck, prefix, price in (('lower', 'L', '1020.00'),
                                    ('upper', 'U', '900.00')):
            counter = 1
            for row in (1, 2):
                for column in (1, 2, 4):
                    seat = BusSeat.objects.create(
                        trip=self.trip,
                        seat_code=f'{prefix}{counter}',
                        deck=deck, row_no=row, column_no=column,
                        seat_kind='sleeper',
                        status='available',
                        price=Decimal(price),
                    )
                    self.seats[seat.seat_code] = seat
                    counter += 1

        # One ladies seat and one withdrawn from sale, to exercise both paths.
        self.ladies_seat = self.seats['L3']
        self.ladies_seat.status = BusSeat.LADIES
        self.ladies_seat.save(update_fields=['status'])

        self.blocked_seat = self.seats['U6']
        self.blocked_seat.status = BusSeat.BLOCKED
        self.blocked_seat.save(update_fields=['status'])

    # -- helpers ------------------------------------------------------------

    def search(self, origin='Mumbai', destination='Pune', date=None):
        return self.client.get(reverse('bus:trip-list'), {
            'from': origin,
            'to': destination,
            'date': (date or self.travel_date).isoformat(),
        })

    def booking_payload(self, seat_ids=('L1', 'L2'), **overrides):
        payload = {
            'tripId': self.trip.pk,
            'date': self.travel_date.isoformat(),
            'seatIds': list(seat_ids),
            'passengers': [
                {
                    'seatId': seat_id,
                    'name': f'Traveller {index + 1}',
                    'age': '29',
                    'gender': 'male',
                }
                for index, seat_id in enumerate(seat_ids)
            ],
            'contact': {'email': 'demo@gmail.com', 'phone': '9876543210'},
            'boardingPointId': self.boarding.pk,
            'droppingPointId': self.dropping.pk,
        }
        payload.update(overrides)
        return payload

    def book(self, **kwargs):
        return self.client.post(
            reverse('bus:booking-create'),
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
            reverse('payments:pay', args=['bus', reference]),
            data=json.dumps(
                payment or {'method': 'netbanking', 'bank': 'HDFC Bank'}
            ),
            content_type='application/json',
        )


class TripSearchTests(BusApiTestCase):

    def test_returns_the_trip_in_the_shape_the_front_end_expects(self):
        response = self.search()
        self.assertEqual(response.status_code, 200)

        (trip,) = response.json()
        self.assertEqual(trip['id'], str(self.trip.pk))
        self.assertEqual(trip['operator'], 'Sharma Travels')
        self.assertEqual(trip['coach'], 'Volvo 9600 Multi-Axle')
        self.assertEqual(trip['kind'], 'sleeper')
        self.assertIs(trip['airConditioned'], True)
        self.assertEqual(trip['departure'], '22:00')
        self.assertEqual(trip['durationMinutes'], 450)
        self.assertIs(trip['arrivesNextDay'], True)
        self.assertEqual(trip['rating'], 4.3)
        self.assertEqual(trip['ratingCount'], 1204)
        self.assertCountEqual(trip['amenities'], ['Wi-Fi', 'Charging point'])
        self.assertEqual(trip['boardingPoints'][0]['name'],
                         'Mumbai Central Bus Stand')
        self.assertEqual(trip['droppingPoints'][0]['time'], '05:45')
        self.assertIs(trip['liveTracking'], True)

    def test_fare_from_and_seats_left_ignore_seats_not_on_sale(self):
        response = self.search()
        (trip,) = response.json()

        # 12 seats, one of them blocked.
        self.assertEqual(trip['seatsLeft'], 11)
        # The cheapest seat still on sale is an upper berth at 900.
        self.assertEqual(trip['fareFrom'], 900)

    def test_availability_drops_once_seats_are_sold(self):
        self.assertEqual(self.book().status_code, 201)

        (trip,) = self.search().json()
        self.assertEqual(trip['seatsLeft'], 9)

    def test_a_sale_on_one_date_leaves_other_dates_alone(self):
        self.assertEqual(self.book().status_code, 201)

        (trip,) = self.search(date=self.travel_date + timedelta(days=1)).json()
        self.assertEqual(trip['seatsLeft'], 11)

    def test_city_names_match_case_insensitively(self):
        self.assertEqual(len(self.search(origin='mumbai').json()), 1)

    def test_another_route_returns_nothing(self):
        self.assertEqual(self.search(destination='Nashik').json(), [])

    def test_the_same_city_twice_is_rejected(self):
        response = self.search(destination='Mumbai')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid')

    def test_a_missing_date_is_rejected(self):
        response = self.client.get(reverse('bus:trip-list'),
                                   {'from': 'Mumbai', 'to': 'Pune'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('date', response.json()['error']['detail'])


class SeatMapTests(BusApiTestCase):

    def get_decks(self, date=None):
        response = self.client.get(
            reverse('bus:trip-seats', args=[self.trip.pk]),
            {'date': (date or self.travel_date).isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_decks_come_back_lower_first_with_the_aisle_derived(self):
        lower, upper = self.get_decks()

        self.assertEqual(lower['name'], 'lower')
        self.assertEqual(upper['name'], 'upper')
        self.assertEqual(lower['rows'], 2)
        self.assertEqual(lower['columns'], 4)
        # Column 3 holds no seats, so it is the aisle.
        self.assertEqual(lower['aisles'], [3])
        self.assertEqual(len(lower['seats']), 6)

    def test_seat_fields_match_the_seat_type(self):
        lower, _ = self.get_decks()
        seat = next(s for s in lower['seats'] if s['id'] == 'L1')

        self.assertEqual(seat, {
            'id': 'L1', 'deck': 'lower', 'row': 1, 'column': 1,
            'kind': 'sleeper', 'status': 'available', 'price': 1020,
        })

    def test_a_ladies_seat_keeps_its_own_status(self):
        lower, _ = self.get_decks()
        seat = next(s for s in lower['seats'] if s['id'] == 'L3')
        self.assertEqual(seat['status'], 'ladies')

    def test_a_withdrawn_seat_reads_as_booked(self):
        _, upper = self.get_decks()
        seat = next(s for s in upper['seats'] if s['id'] == 'U6')
        self.assertEqual(seat['status'], 'booked')

    def test_a_sold_seat_reads_as_booked_on_that_date_only(self):
        self.assertEqual(self.book(seat_ids=('L1',)).status_code, 201)

        lower, _ = self.get_decks()
        self.assertEqual(
            next(s for s in lower['seats'] if s['id'] == 'L1')['status'],
            'booked',
        )

        lower_next_day, _ = self.get_decks(date=self.travel_date + timedelta(days=1))
        self.assertEqual(
            next(s for s in lower_next_day['seats'] if s['id'] == 'L1')['status'],
            'available',
        )

    def test_an_unknown_trip_is_a_404(self):
        response = self.client.get(
            reverse('bus:trip-seats', args=[99999]),
            {'date': self.travel_date.isoformat()},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'trip_not_found')


class QuoteTests(BusApiTestCase):

    def quote(self, seat_ids):
        return self.client.post(
            reverse('bus:quote'),
            data=json.dumps({
                'tripId': self.trip.pk,
                'date': self.travel_date.isoformat(),
                'seatIds': list(seat_ids),
            }),
            content_type='application/json',
        )

    def test_matches_the_formula_the_fare_summary_uses(self):
        fare = self.quote(['L1', 'L2']).json()

        # 1020 + 1020 = 2040, + 25 service fee, GST 5% of 2065 = 103 (rounded).
        self.assertEqual(fare['seatTotal'], 2040)
        self.assertEqual(fare['serviceFee'], 25)
        self.assertEqual(fare['gst'], 103)
        self.assertEqual(fare['total'], 2168)

    def test_no_seats_means_no_service_fee(self):
        fare = self.quote([]).json()
        self.assertEqual(fare, {
            'seatTotal': 0, 'serviceFee': 0, 'gst': 0, 'total': 0,
            'unavailableSeatIds': [],
        })

    def test_flags_seats_that_went_while_the_traveller_was_deciding(self):
        self.assertEqual(self.book(seat_ids=('L1',)).status_code, 201)

        fare = self.quote(['L1', 'L2']).json()
        self.assertEqual(fare['unavailableSeatIds'], ['L1'])

    def test_a_seat_from_another_bus_is_rejected(self):
        response = self.quote(['Z9'])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'],
                         'invalid_seat_selection')


class BookingTests(BusApiTestCase):

    def test_a_booking_returns_the_confirmation_the_ticket_renders(self):
        response = self.book(seat_ids=('L1', 'L2'))
        self.assertEqual(response.status_code, 201)

        body = response.json()
        self.assertRegex(body['pnr'], r'^SB[A-Z2-9]{6}$')
        self.assertEqual(body['status'], 'pending')
        self.assertEqual(body['trip']['id'], str(self.trip.pk))
        self.assertEqual(body['query'], {
            'from': 'Mumbai', 'to': 'Pune',
            'date': self.travel_date.isoformat(),
        })
        self.assertEqual([seat['id'] for seat in body['seats']], ['L1', 'L2'])
        self.assertTrue(all(seat['status'] == 'booked' for seat in body['seats']))
        self.assertEqual([p['seatId'] for p in body['passengers']], ['L1', 'L2'])
        self.assertEqual(body['passengers'][0]['age'], '29')
        self.assertEqual(body['contact']['phone'], '9876543210')
        self.assertEqual(body['boardingPoint']['id'], str(self.boarding.pk))
        self.assertEqual(body['fare']['total'], 2168)
        # Nothing has been paid yet: the payments module does that next.
        self.assertEqual(body['paymentMethod'], '')
        self.assertIsNone(body['payment'])
        self.assertIsNotNone(body['holdExpiresAt'])

    def test_a_booking_writes_every_row_the_schema_expects(self):
        pnr = self.book(seat_ids=('L1', 'L2')).json()['pnr']
        self.assertEqual(self.pay(pnr).status_code, 200)

        booking = Booking.objects.get(reference=pnr)
        self.assertEqual(booking.mode, 'bus')
        self.assertEqual(booking.status, 'confirmed')
        # The account comes from the token, not the payload.
        self.assertEqual(booking.user_id, self.account.pk)
        self.assertEqual(booking.total_amount, Decimal('2168.00'))

        bus_booking = BusBooking.objects.get(pk=booking.pk)
        self.assertEqual(bus_booking.travel_date, self.travel_date)
        self.assertEqual(bus_booking.seat_total, Decimal('2040.00'))
        self.assertEqual(bus_booking.service_fee, Decimal('25.00'))
        self.assertEqual(bus_booking.gst, Decimal('103.00'))

        self.assertEqual(bus_booking.booked_seats.count(), 2)
        self.assertEqual(
            [line.label for line in booking.fare_lines.all()],
            ['Seat fare', 'Service fee', 'GST'],
        )

        payment = booking.payments.get()
        self.assertEqual(payment.method, 'netbanking')
        self.assertEqual(payment.instrument, 'HDFC Bank')
        self.assertEqual(payment.status, 'success')
        self.assertEqual(payment.amount, Decimal('2168.00'))
        self.assertIsNotNone(payment.paid_at)

    def test_the_same_seat_cannot_be_sold_twice_on_one_date(self):
        self.assertEqual(self.book(seat_ids=('L1',)).status_code, 201)

        response = self.book(seat_ids=('L1',))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'seat_unavailable')
        self.assertEqual(response.json()['error']['detail']['seatIds'], ['L1'])

        # The rejected attempt left nothing behind.
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(BusBookingSeat.objects.count(), 1)

    def test_the_same_seat_on_another_date_is_fine(self):
        self.assertEqual(self.book(seat_ids=('L1',)).status_code, 201)

        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(self.booking_payload(
                seat_ids=('L1',),
                date=(self.travel_date + timedelta(days=1)).isoformat(),
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)

    def test_a_ladies_seat_needs_a_female_passenger(self):
        payload = self.booking_payload(seat_ids=('L3',))
        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'],
                         'invalid_seat_selection')
        self.assertEqual(Booking.objects.count(), 0)

        payload['passengers'][0]['gender'] = 'female'
        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)

    def test_a_seat_withdrawn_from_sale_cannot_be_booked(self):
        response = self.book(seat_ids=('U6',))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'seat_unavailable')

    def test_a_passenger_is_required_for_every_seat(self):
        payload = self.booking_payload(seat_ids=('L1', 'L2'))
        payload['passengers'] = payload['passengers'][:1]

        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_a_date_in_the_past_is_rejected(self):
        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(self.booking_payload(
                date=(timezone.localdate() - timedelta(days=1)).isoformat(),
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'],
                         'invalid_seat_selection')

    def test_a_stop_point_from_another_route_is_rejected(self):
        other_trip = BusTrip.objects.create(
            operator=self.operator, coach_name='Scania Metrolink',
            seat_kind='seater', layout='2+2',
            origin_city=self.mumbai, destination_city=self.nashik,
            departure_time='07:00', arrival_time='11:00',
            duration_minutes=240, base_fare=Decimal('500.00'),
        )
        stray = BusStopPoint.objects.create(
            trip=other_trip, kind=BusStopPoint.BOARDING,
            name='Elsewhere', stop_time='06:45',
        )

        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(self.booking_payload(boardingPointId=stray.pk)),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['detail']['boardingPointId'],
                         stray.pk)

    def test_more_than_six_seats_is_rejected(self):
        response = self.book(seat_ids=('L1', 'L2', 'L4', 'L5', 'L6', 'U1', 'U2'))
        self.assertEqual(response.status_code, 400)

    def test_a_bad_phone_number_is_rejected(self):
        response = self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(self.booking_payload(
                contact={'email': 'demo@gmail.com', 'phone': '12345'},
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('contact', response.json()['error']['detail'])


class PaymentTests(BusApiTestCase):
    """The hand-off to the payments module, seen from this side."""

    def test_a_new_booking_waits_for_payment(self):
        body = self.book().json()

        self.assertEqual(body['status'], 'pending')
        self.assertIsNone(body['payment'])
        self.assertIsNotNone(body['holdExpiresAt'])
        self.assertEqual(
            Booking.objects.get(reference=body['pnr']).payments.count(), 0,
        )

    def test_paying_confirms_the_booking_and_prints_the_payment(self):
        created = self.book().json()

        response = self.pay(created['pnr'])
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['booking']['pnr'], created['pnr'])
        self.assertEqual(body['booking']['status'], 'confirmed')
        self.assertEqual(body['booking']['paymentMethod'], 'HDFC Bank')
        self.assertIsNone(body['booking']['holdExpiresAt'])
        self.assertEqual(body['booking']['payment'], body['payment'])

        self.assertEqual(body['payment']['status'], 'success')
        self.assertEqual(body['payment']['method'], 'netbanking')
        self.assertEqual(body['payment']['instrument'], 'HDFC Bank')
        self.assertTrue(body['payment']['transactionRef'].startswith('TXN'))
        self.assertIsNotNone(body['payment']['paidAt'])
        # The whole fare is taken online.
        self.assertEqual(body['payment']['amount'], created['fare']['total'])


class BookingLookupTests(BusApiTestCase):

    def test_a_ticket_can_be_fetched_back_by_pnr(self):
        created = self.book(seat_ids=('L1', 'L2')).json()

        response = self.client.get(
            reverse('bus:booking-detail', args=[created['pnr']])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), created)

    def test_a_lowercase_reference_still_resolves(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']

        response = self.client.get(
            reverse('bus:booking-detail', args=[pnr.lower()])
        )
        self.assertEqual(response.status_code, 200)

    def test_an_unknown_reference_is_a_404(self):
        response = self.client.get(
            reverse('bus:booking-detail', args=['SBZZZZZZ'])
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')

    def test_a_ticket_still_reads_after_the_service_is_withdrawn(self):
        pnr = self.book(seat_ids=('L1',)).json()['pnr']

        self.trip.is_active = False
        self.trip.save(update_fields=['is_active'])

        response = self.client.get(reverse('bus:booking-detail', args=[pnr]))
        self.assertEqual(response.status_code, 200)

class BookingSummaryTests(BusApiTestCase):
    """
    The row `GET /api/auth/me/bookings/` shows for a bus ticket.

    Asserting that `title` and `detail` are strings is not idle: the first
    version of the bus summary handed back a model instance for `detail`,
    which only surfaced as a JSON encoder error at the aggregate endpoint.
    """

    def test_a_booking_summarises_for_the_account_ticket_list(self):
        from bus import services
        from bus.serializers import serialise_booking_summary

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
        self.assertEqual(summary['mode'], 'bus')
        self.assertIsInstance(summary['title'], str)
        self.assertIsInstance(summary['detail'], str)
        self.assertTrue(summary['title'])
        self.assertTrue(summary['detail'])
        self.assertIsInstance(summary['travelDate'], str)
        self.assertIsInstance(summary['amount'], (int, float))
        self.assertEqual(summary['currency'], 'INR')
        self.assertIsNone(summary["endDate"])

    def test_the_list_is_scoped_to_the_account(self):
        from bus import services

        self.assertEqual(self.book().status_code, 201)

        stranger = AppUser.objects.create(
            full_name='Someone Else', email='demo+summary@gmail.com',
            phone='9000009199', password_hash='x',
        )
        self.assertEqual(list(services.list_bookings(stranger.pk)), [])
        self.assertEqual(len(services.list_bookings(self.account.pk)), 1)
