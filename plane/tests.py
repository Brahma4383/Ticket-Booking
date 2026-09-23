"""
Tests for the plane API.

The models are `managed = False`, so the test database has no tables for them:
`migrate` skips unmanaged models by design. `PlaneApiTestCase` builds them with
the schema editor instead, which means these run against SQLite without a
MySQL server - the point being to pin the *behaviour* (seat occupancy by date,
the cabin grid, the fare formula, the booking transaction) rather than the
storage.

What that deliberately does not cover: the CHECK constraints come from
schema.sql and only exist in MySQL, so the infant-with-a-seat and
date-of-birth tests prove the serializer's own rules, not the constraints
standing behind them.
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

from plane.models import (
    Airline,
    Airport,
    AppUser,
    Booking,
    BookingFareLine,
    City,
    FareBrand,
    Flight,
    FlightAddon,
    FlightBooking,
    FlightBookingAddon,
    FlightSeat,
    FlightStop,
    FlightTraveller,
    Offer,
    Payment,
)

# Dependency order: each table's foreign keys point at one already created.
SCHEMA_MODELS = [
    City, AppUser, Offer,
    Airline, Airport, Flight, FlightStop, FareBrand, FlightSeat, FlightAddon,
    Booking, BookingFareLine, Payment,
    FlightBooking, FlightTraveller, FlightBookingAddon,
]


class PlaneApiTestCase(TransactionTestCase):
    """
    Base class: creates the unmanaged tables, then a Mumbai to Delhi non-stop.

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
            full_name='A Traveller', email='traveller@example.com',
            phone='9000000001', password_hash=make_password('a-good-password'),
            is_active=True,
        )
        self.client.defaults['HTTP_AUTHORIZATION'] = (
            f'Bearer {issue_token(self.account)}'
        )

        self.travel_date = timezone.localdate() + timedelta(days=14)

        self.mumbai = City.objects.create(name='Mumbai', state='Maharashtra')
        self.delhi = City.objects.create(name='Delhi', state='Delhi')
        self.goa = City.objects.create(name='Goa', state='Goa')

        self.bom = Airport.objects.create(
            code='BOM', name='Chhatrapati Shivaji Maharaj International',
            city=self.mumbai,
        )
        self.del_airport = Airport.objects.create(
            code='DEL', name='Indira Gandhi International', city=self.delhi,
        )
        self.goi = Airport.objects.create(
            code='GOI', name='Goa International', city=self.goa,
        )

        self.indigo = Airline.objects.create(code='6E', name='IndiGo')

        self.flight = Flight.objects.create(
            airline=self.indigo, flight_number='2134',
            aircraft='Airbus A320neo',
            origin_airport=self.bom, origin_terminal='T2',
            destination_airport=self.del_airport, destination_terminal='T3',
            departure_time='08:20', arrival_time='10:35',
            duration_minutes=135, days_to_arrive=0,
            cabin_class='economy', on_time_percent=88,
        )

        self.saver = FareBrand.objects.create(
            flight=self.flight, code='saver', name='Saver',
            price=Decimal('5400.00'),
            cabin_baggage_kg=7, checkin_baggage_kg=15,
            cancellation_note='Cancellation fee applies', cancellation_tier='fee',
            date_change_note='Date change fee applies', date_change_tier='fee',
            free_seat_selection=False, meal_included=False,
        )
        self.flexi = FareBrand.objects.create(
            flight=self.flight, code='flexi', name='Flexi',
            price=Decimal('7900.00'),
            cabin_baggage_kg=10, checkin_baggage_kg=25,
            cancellation_note='Free cancellation up to 24h before departure',
            cancellation_tier='free',
            date_change_note='Free date change up to 24h before departure',
            date_change_tier='free',
            free_seat_selection=True, meal_included=True,
        )

        # A small 3-3 cabin: columns A B C | D E F, three rows, row 2 is an
        # exit row. Six seats a row keeps the expected counts readable.
        self.seats = {}
        for row in (1, 2, 3):
            for column in ('A', 'B', 'C', 'D', 'E', 'F'):
                is_window = column in ('A', 'F')
                is_aisle = column in ('C', 'D')
                seat = FlightSeat.objects.create(
                    flight=self.flight,
                    seat_code=f'{row}{column}',
                    row_no=row, seat_column=column,
                    zone='extra-legroom' if row == 2 else (
                        'front' if row == 1 else 'standard'
                    ),
                    price=(
                        Decimal('600.00') if is_window or is_aisle
                        else Decimal('0.00')
                    ),
                    is_window=is_window, is_aisle=is_aisle,
                    is_exit_row=(row == 2),
                )
                self.seats[seat.seat_code] = seat

        self.meal = FlightAddon.objects.create(
            code='meal', label='Pre-book a meal',
            description='Hot vegetarian or non-vegetarian meal.',
            price=Decimal('400.00'),
        )
        self.baggage = FlightAddon.objects.create(
            code='baggage', label='Extra 5 kg check-in baggage',
            description='Cheaper now than at the airport counter.',
            price=Decimal('750.00'),
        )
        self.priority = FlightAddon.objects.create(
            code='priority', label='Priority check-in and boarding',
            price=Decimal('300.00'), is_active=False,
        )

    # -- helpers ------------------------------------------------------------

    def search(self, origin='Mumbai', destination='Delhi', date=None, **extra):
        params = {
            'from': origin,
            'to': destination,
            'date': (date or self.travel_date).isoformat(),
        }
        params.update(extra)
        return self.client.get(reverse('plane:flight-list'), params)

    def booking_payload(self, seats=('1A', '1B'), **overrides):
        travellers = [
            {
                'id': f't{index + 1}',
                'type': 'adult',
                'title': 'Mr',
                'firstName': f'First{index + 1}',
                'lastName': 'Rider',
            }
            for index in range(len(seats))
        ]
        payload = {
            'flightId': self.flight.pk,
            'date': self.travel_date.isoformat(),
            'fareBrandCode': 'saver',
            'travellers': travellers,
            'seatByTraveller': {
                traveller['id']: seat
                for traveller, seat in zip(travellers, seats)
            },
            'addOns': ['meal'],
            'contact': {'email': 'rider@example.com', 'phone': '9876543210'},
            'paymentMethod': 'HDFC Bank',
            'paymentMethodId': 'netbanking',
        }
        payload.update(overrides)
        return payload

    def book(self, **kwargs):
        return self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(self.booking_payload(**kwargs)),
            content_type='application/json',
        )


class FlightSearchTests(PlaneApiTestCase):

    def test_returns_the_flight_in_the_shape_the_front_end_expects(self):
        response = self.search()
        self.assertEqual(response.status_code, 200)

        (trip,) = response.json()
        self.assertEqual(trip['id'], str(self.flight.pk))
        self.assertEqual(trip['airline'], 'IndiGo')
        self.assertEqual(trip['airlineCode'], '6E')
        self.assertEqual(trip['flightNumber'], '2134')
        self.assertEqual(trip['aircraft'], 'Airbus A320neo')
        self.assertEqual(trip['from'], {
            'code': 'BOM', 'city': 'Mumbai',
            'name': 'Chhatrapati Shivaji Maharaj International',
            'terminal': 'T2',
        })
        self.assertEqual(trip['to']['terminal'], 'T3')
        self.assertEqual(trip['departure'], '08:20')
        self.assertEqual(trip['durationMinutes'], 135)
        self.assertEqual(trip['daysToArrive'], 0)
        self.assertEqual(trip['cabin'], 'economy')
        self.assertEqual(trip['onTime'], 88)

    def test_a_non_stop_flight_has_an_empty_stops_list(self):
        (trip,) = self.search().json()
        self.assertEqual(trip['stops'], [])

    def test_a_stop_reports_where_and_for_how_long(self):
        FlightStop.objects.create(
            flight=self.flight, airport=self.goi,
            layover_minutes=75, sort_order=0,
        )

        (trip,) = self.search().json()
        self.assertEqual(trip['stops'], [
            {'code': 'GOI', 'city': 'Goa', 'layoverMinutes': 75},
        ])

    def test_fares_come_back_cheapest_first_with_their_rules(self):
        (trip,) = self.search().json()

        self.assertEqual([fare['id'] for fare in trip['fares']],
                         ['saver', 'flexi'])
        self.assertEqual(trip['fares'][1], {
            'id': 'flexi', 'name': 'Flexi', 'price': 7900,
            'cabinBaggageKg': 10, 'checkInBaggageKg': 25,
            'cancellation': 'Free cancellation up to 24h before departure',
            'cancellationTier': 'free',
            'dateChange': 'Free date change up to 24h before departure',
            'dateChangeTier': 'free',
            'freeSeat': True, 'mealIncluded': True,
        })

    def test_seats_left_counts_the_whole_cabin_before_any_sale(self):
        (trip,) = self.search().json()
        self.assertEqual(trip['seatsLeft'], 18)

    def test_seats_left_drops_once_seats_are_taken(self):
        self.assertEqual(self.book(seats=('1A', '1B')).status_code, 201)

        (trip,) = self.search().json()
        self.assertEqual(trip['seatsLeft'], 16)

    def test_a_sale_on_one_date_leaves_other_dates_alone(self):
        self.assertEqual(self.book(seats=('1A', '1B')).status_code, 201)

        (trip,) = self.search(date=self.travel_date + timedelta(days=1)).json()
        self.assertEqual(trip['seatsLeft'], 18)

    def test_an_iata_code_or_airport_name_works_as_well_as_a_city(self):
        self.assertEqual(len(self.search(origin='BOM').json()), 1)
        self.assertEqual(len(self.search(origin='mumbai').json()), 1)
        self.assertEqual(
            len(self.search(
                origin='Chhatrapati Shivaji Maharaj International'
            ).json()),
            1,
        )

    def test_another_route_returns_nothing(self):
        self.assertEqual(self.search(destination='Goa').json(), [])

    def test_the_same_place_twice_is_rejected(self):
        response = self.search(destination='Mumbai')
        self.assertEqual(response.status_code, 400)

    def test_a_party_larger_than_the_cap_is_rejected(self):
        response = self.search(travellers=10)
        self.assertEqual(response.status_code, 400)
        self.assertIn('travellers', response.json()['error']['detail'])

    def test_a_missing_date_is_rejected(self):
        response = self.client.get(reverse('plane:flight-list'),
                                   {'from': 'Mumbai', 'to': 'Delhi'})
        self.assertEqual(response.status_code, 400)


class CabinTests(PlaneApiTestCase):

    def get_cabin(self, date=None):
        response = self.client.get(
            reverse('plane:flight-seats', args=[self.flight.pk]),
            {'date': (date or self.travel_date).isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_the_aisle_is_derived_from_the_seat_data(self):
        layout = self.get_cabin()
        self.assertEqual(layout['columns'], ['A', 'B', 'C', None, 'D', 'E', 'F'])

    def test_a_two_by_two_cabin_puts_the_aisle_in_the_middle(self):
        from plane.serializers import cabin_columns

        narrow = Flight.objects.create(
            airline=self.indigo, flight_number='7001',
            origin_airport=self.bom, destination_airport=self.goi,
            departure_time='06:00', arrival_time='07:05',
            duration_minutes=65,
        )
        for column in ('A', 'B', 'C', 'D'):
            FlightSeat.objects.create(
                flight=narrow, seat_code=f'1{column}', row_no=1,
                seat_column=column, is_aisle=column in ('B', 'C'),
            )

        self.assertEqual(
            cabin_columns(list(narrow.seats.all())),
            ['A', 'B', None, 'C', 'D'],
        )

    def test_rows_carry_their_seats_and_exit_flag(self):
        layout = self.get_cabin()

        self.assertEqual([row['number'] for row in layout['rows']], [1, 2, 3])
        self.assertEqual([row['exitRow'] for row in layout['rows']],
                         [False, True, False])
        self.assertEqual(len(layout['rows'][0]['seats']), 6)

    def test_seat_fields_match_the_cabin_seat_type(self):
        layout = self.get_cabin()
        seat = layout['rows'][0]['seats'][0]

        self.assertEqual(seat, {
            'id': '1A', 'row': 1, 'column': 'A', 'zone': 'front',
            'price': 600, 'occupied': False, 'window': True, 'aisle': False,
        })

    def test_a_middle_seat_is_free_to_pick(self):
        layout = self.get_cabin()
        seat = next(s for s in layout['rows'][0]['seats'] if s['id'] == '1B')
        self.assertEqual(seat['price'], 0)

    def test_a_taken_seat_reads_as_occupied_on_that_date_only(self):
        self.assertEqual(self.book(seats=('1A',)).status_code, 201)

        layout = self.get_cabin()
        self.assertIs(
            next(s for s in layout['rows'][0]['seats'] if s['id'] == '1A')['occupied'],
            True,
        )

        next_day = self.get_cabin(date=self.travel_date + timedelta(days=1))
        self.assertIs(
            next(s for s in next_day['rows'][0]['seats'] if s['id'] == '1A')['occupied'],
            False,
        )

    def test_an_unknown_flight_is_a_404(self):
        response = self.client.get(
            reverse('plane:flight-seats', args=[99999]),
            {'date': self.travel_date.isoformat()},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'flight_not_found')


class AddOnListTests(PlaneApiTestCase):

    def test_only_the_add_ons_on_sale_are_published(self):
        response = self.client.get(reverse('plane:addon-list'))
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual([addon['id'] for addon in body], ['meal', 'baggage'])
        self.assertEqual(body[0], {
            'id': 'meal', 'label': 'Pre-book a meal',
            'description': 'Hot vegetarian or non-vegetarian meal.',
            'price': 400,
        })


class QuoteTests(PlaneApiTestCase):

    def quote(self, **overrides):
        payload = {
            'flightId': self.flight.pk,
            'date': self.travel_date.isoformat(),
            'fareBrandCode': 'saver',
            'travellerCount': 2,
            'seatIds': ['1A', '1B'],
            'addOns': ['meal'],
        }
        payload.update(overrides)
        return self.client.post(
            reverse('plane:quote'),
            data=json.dumps(payload), content_type='application/json',
        )

    def test_matches_the_formula_the_fare_summary_uses(self):
        fare = self.quote().json()

        # 5400 x 2 = 10800 base. Taxes 12% = 1296, + 236 x 2 = 1768.
        # Seats 600 + 0. Add-ons 400 x 2 = 800. Convenience 149 x 2 = 298.
        self.assertEqual(fare['baseFare'], 10800)
        self.assertEqual(fare['taxes'], 1768)
        self.assertEqual(fare['seats'], 600)
        self.assertEqual(fare['addOns'], 800)
        self.assertEqual(fare['convenienceFee'], 298)
        self.assertEqual(fare['total'], 14266)

    def test_no_travellers_means_no_fare(self):
        fare = self.quote(travellerCount=0, seatIds=[], addOns=[]).json()
        self.assertEqual(fare['total'], 0)

    def test_add_ons_are_charged_per_traveller(self):
        one = self.quote(travellerCount=1, seatIds=[], addOns=['meal']).json()
        two = self.quote(travellerCount=2, seatIds=[], addOns=['meal']).json()

        self.assertEqual(one['addOns'], 400)
        self.assertEqual(two['addOns'], 800)

    def test_several_add_ons_add_up(self):
        fare = self.quote(seatIds=[], addOns=['meal', 'baggage']).json()
        self.assertEqual(fare['addOns'], (400 + 750) * 2)

    def test_flags_seats_that_went_while_the_traveller_was_deciding(self):
        self.assertEqual(self.book(seats=('1A',)).status_code, 201)

        fare = self.quote().json()
        self.assertEqual(fare['unavailableSeatIds'], ['1A'])

    def test_a_withdrawn_add_on_is_rejected(self):
        response = self.quote(addOns=['priority'])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_a_fare_brand_from_another_flight_is_rejected(self):
        response = self.quote(fareBrandCode='comfort')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_a_seat_from_another_aircraft_is_rejected(self):
        response = self.quote(seatIds=['99Z'])
        self.assertEqual(response.status_code, 400)


class BookingTests(PlaneApiTestCase):

    def test_a_booking_returns_the_confirmation_the_ticket_renders(self):
        response = self.book(seats=('1A', '1B'))
        self.assertEqual(response.status_code, 201)

        body = response.json()
        self.assertRegex(body['reference'], r'^[A-Z0-9]{6}$')
        self.assertEqual(body['status'], 'confirmed')
        self.assertEqual(body['trip']['id'], str(self.flight.pk))
        self.assertEqual(body['query'], {
            'from': 'Mumbai', 'to': 'Delhi',
            'date': self.travel_date.isoformat(), 'travellers': 2,
        })
        self.assertEqual(body['fareBrand']['id'], 'saver')
        self.assertEqual(body['addOns'], ['meal'])
        self.assertEqual(body['contact']['phone'], '9876543210')
        self.assertEqual(body['fare']['total'], 14266)
        self.assertEqual(body['paymentMethod'], 'HDFC Bank')

    def test_each_traveller_gets_a_seat_and_an_e_ticket(self):
        body = self.book(seats=('1A', '1B')).json()

        first, second = body['travellers']
        self.assertEqual(first['seatId'], '1A')
        self.assertEqual(second['seatId'], '1B')
        self.assertEqual(first['firstName'], 'First1')
        self.assertEqual(first['type'], 'adult')
        self.assertRegex(first['eTicket'], r'^6E \d{3}-\d{10}$')
        self.assertNotEqual(first['eTicket'], second['eTicket'])

    def test_a_traveller_without_a_seat_gets_a_null_seat_id(self):
        payload = self.booking_payload(seats=('1A', '1B'))
        del payload['seatByTraveller']['t2']

        body = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        ).json()

        self.assertEqual(body['travellers'][1]['seatId'], None)
        # Only the one seat is charged.
        self.assertEqual(body['fare']['seats'], 600)

    def test_a_booking_writes_every_row_the_schema_expects(self):
        reference = self.book(seats=('1A', '1B')).json()['reference']

        booking = Booking.objects.get(reference=reference)
        self.assertEqual(booking.mode, 'plane')
        self.assertEqual(booking.status, 'confirmed')
        # The account comes from the token, not the payload.
        self.assertEqual(booking.user_id, self.account.pk)
        self.assertEqual(booking.total_amount, Decimal('14266.00'))

        flight_booking = FlightBooking.objects.get(pk=booking.pk)
        self.assertEqual(flight_booking.travel_date, self.travel_date)
        self.assertEqual(flight_booking.base_fare, Decimal('10800.00'))
        self.assertEqual(flight_booking.taxes, Decimal('1768.00'))
        self.assertEqual(flight_booking.seat_total, Decimal('600.00'))
        self.assertEqual(flight_booking.addon_total, Decimal('800.00'))
        self.assertEqual(flight_booking.convenience_fee, Decimal('298.00'))

        self.assertEqual(flight_booking.travellers.count(), 2)

        addon_row = flight_booking.addons.get()
        self.assertEqual(addon_row.addon_id, self.meal.pk)
        self.assertEqual(addon_row.quantity, 2)
        self.assertEqual(addon_row.amount, Decimal('800.00'))

        self.assertEqual(
            [line.label for line in booking.fare_lines.all()],
            ['Base fare', 'Taxes and surcharges', 'Seats', 'Add-ons',
             'Convenience fee'],
        )

        payment = booking.payments.get()
        self.assertEqual(payment.method, 'netbanking')
        self.assertEqual(payment.instrument, 'HDFC Bank')
        self.assertEqual(payment.status, 'success')

    def test_a_fare_line_is_only_written_when_it_is_charged(self):
        payload = self.booking_payload(seats=('1A',), addOns=[])
        payload['seatByTraveller'] = {}

        reference = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        ).json()['reference']

        booking = Booking.objects.get(reference=reference)
        self.assertEqual(
            [line.label for line in booking.fare_lines.all()],
            ['Base fare', 'Taxes and surcharges', 'Convenience fee'],
        )

    def test_the_server_prices_the_seats_it_assigns_not_what_was_sent(self):
        # A client claiming the seats were free changes nothing.
        body = self.book(seats=('1A', '1B'), seatTotal=0).json()
        self.assertEqual(body['fare']['seats'], 600)

    def test_the_same_seat_cannot_be_sold_twice_on_one_date(self):
        self.assertEqual(self.book(seats=('1A',)).status_code, 201)

        response = self.book(seats=('1A',))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'seat_unavailable')
        self.assertEqual(response.json()['error']['detail']['seatIds'], ['1A'])

        # The rejected attempt left nothing behind.
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(FlightTraveller.objects.count(), 1)

    def test_the_same_seat_on_another_date_is_fine(self):
        self.assertEqual(self.book(seats=('1A',)).status_code, 201)

        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(self.booking_payload(
                seats=('1A',),
                date=(self.travel_date + timedelta(days=1)).isoformat(),
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)

    def test_an_infant_cannot_be_given_a_seat(self):
        payload = self.booking_payload(seats=('1A', '1B'))
        payload['travellers'][1]['type'] = 'infant'
        payload['travellers'][1]['dateOfBirth'] = '2025-06-01'

        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('seatByTraveller', response.json()['error']['detail'])

    def test_a_child_needs_a_date_of_birth(self):
        payload = self.booking_payload(seats=('1A',))
        payload['travellers'][0]['type'] = 'child'

        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

        payload['travellers'][0]['dateOfBirth'] = '2018-04-11'
        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)

    def test_two_travellers_cannot_share_a_seat(self):
        payload = self.booking_payload(seats=('1A', '1B'))
        payload['seatByTraveller']['t2'] = '1A'

        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_a_seat_for_a_traveller_who_was_not_sent_is_rejected(self):
        payload = self.booking_payload(seats=('1A',))
        payload['seatByTraveller']['t9'] = '1B'

        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_a_date_in_the_past_is_rejected(self):
        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(self.booking_payload(
                date=(timezone.localdate() - timedelta(days=1)).isoformat(),
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_more_than_nine_travellers_is_rejected(self):
        response = self.book(seats=tuple(f'{r}{c}' for r in (1, 2) for c in 'ABCDE'))
        self.assertEqual(response.status_code, 400)

    def test_a_bad_phone_number_is_rejected(self):
        response = self.client.post(
            reverse('plane:booking-create'),
            data=json.dumps(self.booking_payload(
                contact={'email': 'rider@example.com', 'phone': '12345'},
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('contact', response.json()['error']['detail'])


class BookingLookupTests(PlaneApiTestCase):

    def test_a_ticket_can_be_fetched_back_by_reference(self):
        created = self.book(seats=('1A', '1B')).json()

        response = self.client.get(
            reverse('plane:booking-detail', args=[created['reference']])
        )
        self.assertEqual(response.status_code, 200)

        fetched = response.json()
        self.assertEqual(fetched['travellers'], created['travellers'])
        self.assertEqual(fetched['fare'], created['fare'])
        self.assertEqual(fetched['fareBrand'], created['fareBrand'])
        self.assertEqual(fetched['addOns'], created['addOns'])

    def test_a_lowercase_reference_still_resolves(self):
        reference = self.book(seats=('1A',)).json()['reference']

        response = self.client.get(
            reverse('plane:booking-detail', args=[reference.lower()])
        )
        self.assertEqual(response.status_code, 200)

    def test_the_fare_on_a_ticket_is_the_one_that_was_paid(self):
        created = self.book(seats=('1A',)).json()

        self.saver.price = Decimal('9900.00')
        self.saver.save(update_fields=['price'])

        fetched = self.client.get(
            reverse('plane:booking-detail', args=[created['reference']])
        ).json()
        self.assertEqual(fetched['fare']['total'], created['fare']['total'])

    def test_an_unknown_reference_is_a_404(self):
        response = self.client.get(
            reverse('plane:booking-detail', args=['ZZZZZZ'])
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')

    def test_a_ticket_still_reads_after_the_flight_is_withdrawn(self):
        reference = self.book(seats=('1A',)).json()['reference']

        self.flight.is_active = False
        self.flight.save(update_fields=['is_active'])

        response = self.client.get(
            reverse('plane:booking-detail', args=[reference])
        )
        self.assertEqual(response.status_code, 200)

class BookingSummaryTests(PlaneApiTestCase):
    """
    The row `GET /api/auth/me/bookings/` shows for a flight ticket.

    Asserting that `title` and `detail` are strings is not idle: the first
    version of the bus summary handed back a model instance for `detail`,
    which only surfaced as a JSON encoder error at the aggregate endpoint.
    """

    def test_a_booking_summarises_for_the_account_ticket_list(self):
        from plane import services
        from plane.serializers import serialise_booking_summary

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
        self.assertEqual(summary['mode'], 'plane')
        self.assertIsInstance(summary['title'], str)
        self.assertIsInstance(summary['detail'], str)
        self.assertTrue(summary['title'])
        self.assertTrue(summary['detail'])
        self.assertIsInstance(summary['travelDate'], str)
        self.assertIsInstance(summary['amount'], (int, float))
        self.assertEqual(summary['currency'], 'INR')
        self.assertIsNone(summary["endDate"])

    def test_the_list_is_scoped_to_the_account(self):
        from plane import services

        self.assertEqual(self.book().status_code, 201)

        stranger = AppUser.objects.create(
            full_name='Someone Else', email='other-summary@example.com',
            phone='9000009399', password_hash='x',
        )
        self.assertEqual(list(services.list_bookings(stranger.pk)), [])
        self.assertEqual(len(services.list_bookings(self.account.pk)), 1)
