"""
Tests for the train API.

The models are `managed = False`, so the test database has no tables for them:
`migrate` skips unmanaged models by design. `TrainApiTestCase` builds them with
the schema editor instead, which means these run against SQLite without a
MySQL server - the point being to pin the *behaviour* (availability by date and
quota, the fare formula, chart allotment, the booking transaction) rather than
the storage.

What that deliberately does not cover: the CHECK constraints and
uq_train_availability come from schema.sql and only exist in MySQL, so the
"class ran out" test proves the service layer's own check, not the constraint
standing behind it.
"""
import json
import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.db import connection
from django.test import TransactionTestCase
from django.urls import reverse

from django.utils import timezone

from accounts.authentication import issue_token

from train.models import (
    AppUser,
    Booking,
    BookingFareLine,
    City,
    Offer,
    Payment,
    Train,
    TrainAvailability,
    TrainBoardingStation,
    TrainBooking,
    TrainClass,
    TrainPassenger,
    TrainQuota,
    TrainStation,
)

# Dependency order: each table's foreign keys point at one already created.
SCHEMA_MODELS = [
    City, AppUser, Offer,
    TrainStation, TrainClass, TrainQuota, Train,
    TrainBoardingStation, TrainAvailability,
    Booking, BookingFareLine, Payment, TrainBooking, TrainPassenger,
]


class TrainApiTestCase(TransactionTestCase):
    """
    Base class: creates the unmanaged tables, then a Mumbai to Pune express.

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

        # A Wednesday, so the running-day tests have a known weekday.
        today = timezone.localdate()
        self.travel_date = today + timedelta(days=(2 - today.weekday()) % 7 or 7)
        self.assertEqual(self.travel_date.weekday(), 2)

        self.mumbai = City.objects.create(name='Mumbai', state='Maharashtra')
        self.pune = City.objects.create(name='Pune', state='Maharashtra')
        self.nashik = City.objects.create(name='Nashik', state='Maharashtra')

        self.cstm = TrainStation.objects.create(
            code='CSTM', name='Mumbai CSMT', city=self.mumbai,
        )
        self.dadar = TrainStation.objects.create(
            code='DR', name='Dadar', city=self.mumbai,
        )
        self.pune_jn = TrainStation.objects.create(
            code='PUNE', name='Pune Junction', city=self.pune,
        )
        self.nashik_rd = TrainStation.objects.create(
            code='NK', name='Nashik Road', city=self.nashik,
        )

        # 3A is air-conditioned and so attracts GST; SL does not.
        self.ac3 = TrainClass.objects.create(
            code='3A', label='AC 3 Tier (3A)', is_air_conditioned=True,
            reservation_charge=Decimal('40.00'), sort_order=3,
        )
        self.sleeper = TrainClass.objects.create(
            code='SL', label='Sleeper (SL)', is_air_conditioned=False,
            reservation_charge=Decimal('20.00'), sort_order=6,
        )
        self.first_ac = TrainClass.objects.create(
            code='1A', label='AC First Class (1A)', is_air_conditioned=True,
            reservation_charge=Decimal('60.00'), sort_order=1,
        )

        self.general = TrainQuota.objects.create(
            code='general', label='General',
            note='Standard booking, opens 60 days before departure.',
            surcharge_percent=Decimal('0.00'),
        )
        self.tatkal = TrainQuota.objects.create(
            code='tatkal', label='Tatkal',
            note='Opens one day before departure.',
            surcharge_percent=Decimal('30.00'),
        )
        self.ladies = TrainQuota.objects.create(
            code='ladies', label='Ladies', surcharge_percent=Decimal('0.00'),
        )

        self.train = Train.objects.create(
            number='12123', name='Deccan Queen',
            origin_station=self.cstm, destination_station=self.pune_jn,
            departure_time='17:10', arrival_time='20:25',
            duration_minutes=195, days_to_arrive=0,
            has_pantry=True, rating=Decimal('4.4'),
            cancellation_policy='Free cancellation up to 48 hours before departure.',
        )
        self.boarding_row = TrainBoardingStation.objects.create(
            train=self.train, station=self.dadar,
            departure_time='17:28', day_offset=0, sort_order=0,
        )

        self.ac3_availability = TrainAvailability.objects.create(
            train=self.train, train_class=self.ac3, quota=self.general,
            travel_date=self.travel_date, fare=Decimal('1200.00'),
            availability_kind=TrainAvailability.AVAILABLE,
            availability_count=42, availability_label='AVAILABLE-0042',
            confirm_chance=100,
        )
        self.sleeper_availability = TrainAvailability.objects.create(
            train=self.train, train_class=self.sleeper, quota=self.general,
            travel_date=self.travel_date, fare=Decimal('400.00'),
            availability_kind=TrainAvailability.AVAILABLE,
            availability_count=120, availability_label='AVAILABLE-0120',
            confirm_chance=100,
        )
        # The same class under Tatkal: dearer, and only RAC left.
        self.tatkal_availability = TrainAvailability.objects.create(
            train=self.train, train_class=self.ac3, quota=self.tatkal,
            travel_date=self.travel_date, fare=Decimal('1200.00'),
            availability_kind=TrainAvailability.RAC,
            availability_count=7, availability_label='RAC 7',
            confirm_chance=82,
        )

    # -- helpers ------------------------------------------------------------

    def search(self, origin='Mumbai', destination='Pune', date=None, quota=None):
        params = {
            'from': origin,
            'to': destination,
            'date': (date or self.travel_date).isoformat(),
        }
        if quota:
            params['quota'] = quota
        return self.client.get(reverse('train:train-list'), params)

    def booking_payload(self, passenger_count=2, **overrides):
        payload = {
            'trainId': self.train.pk,
            'date': self.travel_date.isoformat(),
            'classCode': '3A',
            'quota': 'general',
            'boardingStationCode': 'CSTM',
            'passengers': [
                {
                    'name': f'Traveller {index + 1}',
                    'age': '34',
                    'gender': 'male',
                    'berth': 'lower' if index == 0 else 'no-preference',
                }
                for index in range(passenger_count)
            ],
            'contact': {'email': 'demo@gmail.com', 'phone': '9876543210'},
            'insured': True,
        }
        payload.update(overrides)
        return payload

    def book(self, **kwargs):
        return self.client.post(
            reverse('train:booking-create'),
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
            reverse('payments:pay', args=['train', reference]),
            data=json.dumps(
                payment or {'method': 'netbanking', 'bank': 'HDFC Bank'}
            ),
            content_type='application/json',
        )


class TrainSearchTests(TrainApiTestCase):

    def test_returns_the_train_in_the_shape_the_front_end_expects(self):
        response = self.search()
        self.assertEqual(response.status_code, 200)

        (trip,) = response.json()
        self.assertEqual(trip['id'], str(self.train.pk))
        self.assertEqual(trip['number'], '12123')
        self.assertEqual(trip['name'], 'Deccan Queen')
        self.assertEqual(trip['from'], {'code': 'CSTM', 'name': 'Mumbai CSMT'})
        self.assertEqual(trip['to'], {'code': 'PUNE', 'name': 'Pune Junction'})
        self.assertEqual(trip['departure'], '17:10')
        self.assertEqual(trip['durationMinutes'], 195)
        self.assertEqual(trip['daysToArrive'], 0)
        self.assertEqual(trip['runsOn'], [True] * 7)
        self.assertIs(trip['pantry'], True)
        self.assertEqual(trip['rating'], 4.4)
        self.assertIn('48 hours', trip['cancellationPolicy'])

    def test_classes_come_back_in_class_sort_order_with_their_availability(self):
        (trip,) = self.search().json()

        self.assertEqual([c['code'] for c in trip['classes']], ['3A', 'SL'])
        self.assertEqual(trip['classes'][0], {
            'code': '3A',
            'label': 'AC 3 Tier (3A)',
            'fare': 1200,
            'availability': {
                'kind': 'available', 'count': 42,
                'label': 'AVAILABLE-0042', 'confirmChance': 100,
            },
        })

    def test_the_origin_leads_the_boarding_list(self):
        (trip,) = self.search().json()

        self.assertEqual(trip['boardingStations'], [
            {'code': 'CSTM', 'name': 'Mumbai CSMT', 'time': '17:10', 'dayOffset': 0},
            {'code': 'DR', 'name': 'Dadar', 'time': '17:28', 'dayOffset': 0},
        ])

    def test_quota_selects_its_own_fares_and_availability(self):
        (trip,) = self.search(quota='tatkal').json()

        self.assertEqual([c['code'] for c in trip['classes']], ['3A'])
        self.assertEqual(trip['classes'][0]['availability'], {
            'kind': 'rac', 'count': 7, 'label': 'RAC 7', 'confirmChance': 82,
        })

    def test_a_station_name_or_code_works_as_well_as_a_city(self):
        self.assertEqual(len(self.search(origin='Mumbai CSMT').json()), 1)
        self.assertEqual(len(self.search(origin='CSTM').json()), 1)
        self.assertEqual(len(self.search(origin='mumbai').json()), 1)

    def test_a_train_with_no_availability_for_that_date_is_left_out(self):
        self.assertEqual(
            self.search(date=self.travel_date + timedelta(days=1)).json(), [],
        )

    def test_a_train_that_does_not_run_that_day_is_left_out(self):
        self.train.runs_wed = False
        self.train.save(update_fields=['runs_wed'])

        self.assertEqual(self.search().json(), [])

    def test_another_route_returns_nothing(self):
        self.assertEqual(self.search(destination='Nashik').json(), [])

    def test_an_unknown_quota_is_rejected(self):
        response = self.search(quota='premium')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_the_same_place_twice_is_rejected(self):
        response = self.search(destination='Mumbai')
        self.assertEqual(response.status_code, 400)

    def test_a_missing_date_is_rejected(self):
        response = self.client.get(reverse('train:train-list'),
                                   {'from': 'Mumbai', 'to': 'Pune'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('date', response.json()['error']['detail'])


class QuotaListTests(TrainApiTestCase):

    def test_quotas_publish_their_label_note_and_premium(self):
        response = self.client.get(reverse('train:quota-list'))
        self.assertEqual(response.status_code, 200)

        by_id = {quota['id']: quota for quota in response.json()}
        self.assertEqual(by_id['general']['surchargePercent'], 0)
        self.assertEqual(by_id['tatkal']['surchargePercent'], 30)
        self.assertEqual(by_id['tatkal']['label'], 'Tatkal')
        self.assertIn('one day before', by_id['tatkal']['note'])


class QuoteTests(TrainApiTestCase):

    def quote(self, **overrides):
        payload = {
            'trainId': self.train.pk,
            'date': self.travel_date.isoformat(),
            'classCode': '3A',
            'quota': 'general',
            'passengerCount': 2,
            'insured': True,
        }
        payload.update(overrides)
        return self.client.post(
            reverse('train:quote'),
            data=json.dumps(payload), content_type='application/json',
        )

    def test_an_ac_class_is_priced_the_way_the_fare_summary_prices_it(self):
        fare = self.quote().json()

        # 1200 x 2 = 2400 base, no surcharge, 40 x 2 = 80 reservation.
        # GST 5% of 2480 = 124. Insurance 0.45 x 2 = 0.90.
        self.assertEqual(fare['baseFare'], 2400)
        self.assertEqual(fare['quotaSurcharge'], 0)
        self.assertEqual(fare['reservationCharge'], 80)
        self.assertEqual(fare['insurance'], 0.9)
        self.assertEqual(fare['gst'], 124)
        self.assertEqual(fare['total'], 2604.9)

    def test_a_non_ac_class_pays_no_gst(self):
        fare = self.quote(classCode='SL', insured=False).json()

        # 400 x 2 = 800 base, 20 x 2 = 40 reservation, no GST, no insurance.
        self.assertEqual(fare['baseFare'], 800)
        self.assertEqual(fare['gst'], 0)
        self.assertEqual(fare['insurance'], 0)
        self.assertEqual(fare['total'], 840)

    def test_tatkal_adds_its_premium_from_the_quota_row(self):
        fare = self.quote(quota='tatkal', insured=False).json()

        # 2400 base + 30% = 720 surcharge, + 80 reservation = 3200 taxable,
        # GST 5% = 160.
        self.assertEqual(fare['baseFare'], 2400)
        self.assertEqual(fare['quotaSurcharge'], 720)
        self.assertEqual(fare['gst'], 160)
        self.assertEqual(fare['total'], 3360)

    def test_no_passengers_means_no_fare(self):
        fare = self.quote(passengerCount=0).json()
        self.assertEqual(fare['total'], 0)
        self.assertEqual(fare['baseFare'], 0)

    def test_the_quote_carries_the_live_availability(self):
        fare = self.quote().json()
        self.assertEqual(fare['availability']['label'], 'AVAILABLE-0042')

    def test_a_class_not_sold_on_this_train_is_rejected(self):
        response = self.quote(classCode='1A')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_an_unknown_class_code_is_rejected(self):
        response = self.quote(classCode='ZZ')
        self.assertEqual(response.status_code, 400)


class BookingTests(TrainApiTestCase):

    def test_a_booking_returns_the_confirmation_the_ticket_renders(self):
        response = self.book(passenger_count=2)
        self.assertEqual(response.status_code, 201)

        body = response.json()
        self.assertRegex(body['pnr'], r'^[2-8]\d{9}$')
        self.assertEqual(body['status'], 'pending')
        self.assertEqual(body['trip']['id'], str(self.train.pk))
        self.assertEqual(body['query'], {
            'from': 'Mumbai CSMT', 'to': 'Pune Junction',
            'date': self.travel_date.isoformat(),
        })
        self.assertEqual(body['classOption']['code'], '3A')
        self.assertEqual(body['quota'], 'general')
        self.assertEqual(body['boardingStation'], {
            'code': 'CSTM', 'name': 'Mumbai CSMT', 'time': '17:10', 'dayOffset': 0,
        })
        self.assertEqual(body['contact']['phone'], '9876543210')
        self.assertEqual(body['fare']['total'], 2604.9)
        # Nothing has been paid yet: the payments module does that next.
        self.assertEqual(body['paymentMethod'], '')
        self.assertIsNone(body['payment'])
        self.assertIsNotNone(body['holdExpiresAt'])
        self.assertIs(body['insured'], True)
        self.assertIn('confirmed', body['chartStatus'])

    def test_the_ticket_shows_the_availability_it_was_sold_at(self):
        body = self.book(passenger_count=2).json()

        # Not AVAILABLE-0040, which is what is left afterwards.
        self.assertEqual(
            body['classOption']['availability']['label'], 'AVAILABLE-0042',
        )

    def test_a_confirmed_class_allots_a_coach_and_berth(self):
        body = self.book(passenger_count=2).json()

        first, second = body['passengers']
        self.assertEqual(first['status'], 'CNF')
        self.assertEqual(first['berth'], 'lower')
        # The preference is honoured in the allotment text.
        self.assertRegex(first['allottedBerth'], r'^B\d / \d+ / Lower$')
        self.assertEqual(first['coach'], second['coach'])
        self.assertEqual(second['berth'], 'no-preference')
        self.assertRegex(
            second['allottedBerth'],
            r'^B\d / \d+ / (Lower|Middle|Upper|Side Lower|Side Upper)$',
        )

    def test_an_rac_class_gives_queue_positions_instead_of_berths(self):
        body = self.book(passenger_count=2, quota='tatkal').json()

        first, second = body['passengers']
        self.assertEqual(first['status'], 'RAC 7')
        self.assertEqual(second['status'], 'RAC 8')
        self.assertRegex(first['allottedBerth'], r'^B\d / RAC 7$')
        self.assertIn('closer to departure', body['chartStatus'])

    def test_a_waitlisted_class_allots_nothing(self):
        self.ac3_availability.availability_kind = TrainAvailability.WAITLIST
        self.ac3_availability.availability_count = 12
        self.ac3_availability.availability_label = 'GNWL 12'
        self.ac3_availability.save()

        body = self.book(passenger_count=1).json()
        (passenger,) = body['passengers']

        self.assertEqual(passenger['status'], 'WL 12')
        self.assertEqual(passenger['coach'], '—')
        self.assertEqual(passenger['allottedBerth'], 'Not allotted yet')

    def test_a_booking_writes_every_row_the_schema_expects(self):
        pnr = self.book(passenger_count=2).json()['pnr']
        self.assertEqual(self.pay(pnr).status_code, 200)

        booking = Booking.objects.get(reference=pnr)
        self.assertEqual(booking.mode, 'train')
        self.assertEqual(booking.status, 'confirmed')
        # The account comes from the token, not the payload.
        self.assertEqual(booking.user_id, self.account.pk)
        self.assertEqual(booking.total_amount, Decimal('2604.90'))

        train_booking = TrainBooking.objects.get(pk=booking.pk)
        self.assertEqual(train_booking.travel_date, self.travel_date)
        self.assertEqual(train_booking.base_fare, Decimal('2400.00'))
        self.assertEqual(train_booking.reservation_charge, Decimal('80.00'))
        self.assertEqual(train_booking.gst, Decimal('124.00'))
        self.assertEqual(train_booking.insurance, Decimal('0.90'))
        self.assertIs(train_booking.is_insured, True)
        self.assertEqual(train_booking.boarding_station_id, self.cstm.pk)

        self.assertEqual(train_booking.passengers.count(), 2)
        self.assertEqual(
            [line.label for line in booking.fare_lines.all()],
            ['Base fare', 'Reservation charge', 'Travel insurance', 'GST'],
        )

        payment = booking.payments.get()
        self.assertEqual(payment.method, 'netbanking')
        self.assertEqual(payment.instrument, 'HDFC Bank')
        self.assertEqual(payment.status, 'success')
        self.assertEqual(payment.amount, Decimal('2604.90'))

    def test_a_fare_line_is_only_written_when_it_is_charged(self):
        pnr = self.book(
            passenger_count=1, classCode='SL', insured=False,
        ).json()['pnr']

        booking = Booking.objects.get(reference=pnr)
        # Sleeper: no GST, no insurance, no Tatkal surcharge.
        self.assertEqual(
            [line.label for line in booking.fare_lines.all()],
            ['Base fare', 'Reservation charge'],
        )

    def test_a_confirmed_sale_takes_berths_off_the_count(self):
        self.assertEqual(self.book(passenger_count=2).status_code, 201)

        self.ac3_availability.refresh_from_db()
        self.assertEqual(self.ac3_availability.availability_count, 40)
        self.assertEqual(self.ac3_availability.availability_label, 'AVAILABLE-0040')
        self.assertEqual(self.ac3_availability.availability_kind, 'available')

    def test_selling_the_last_berths_closes_the_class(self):
        self.ac3_availability.availability_count = 2
        self.ac3_availability.availability_label = 'AVAILABLE-0002'
        self.ac3_availability.save()

        self.assertEqual(self.book(passenger_count=2).status_code, 201)

        self.ac3_availability.refresh_from_db()
        self.assertEqual(self.ac3_availability.availability_kind, 'unavailable')
        self.assertEqual(self.ac3_availability.availability_label, 'NOT AVAILABLE')
        self.assertEqual(self.ac3_availability.availability_count, 0)

    def test_an_rac_sale_lengthens_the_queue(self):
        self.assertEqual(
            self.book(passenger_count=2, quota='tatkal').status_code, 201,
        )

        self.tatkal_availability.refresh_from_db()
        self.assertEqual(self.tatkal_availability.availability_count, 9)
        self.assertEqual(self.tatkal_availability.availability_label, 'RAC 9')

    def test_a_class_that_ran_short_is_a_409(self):
        self.ac3_availability.availability_count = 1
        self.ac3_availability.save()

        response = self.book(passenger_count=2)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'class_unavailable')
        self.assertEqual(response.json()['error']['detail']['available'], 1)

        # The rejected attempt left nothing behind.
        self.assertEqual(Booking.objects.count(), 0)
        self.assertEqual(TrainPassenger.objects.count(), 0)

    def test_a_closed_class_is_a_409(self):
        self.ac3_availability.availability_kind = TrainAvailability.UNAVAILABLE
        self.ac3_availability.availability_count = 0
        self.ac3_availability.save()

        response = self.book(passenger_count=1)
        self.assertEqual(response.status_code, 409)

    def test_an_intermediate_boarding_station_is_accepted(self):
        body = self.book(passenger_count=1, boardingStationCode='DR').json()

        self.assertEqual(body['boardingStation'], {
            'code': 'DR', 'name': 'Dadar', 'time': '17:28', 'dayOffset': 0,
        })

    def test_a_station_off_this_route_is_rejected(self):
        response = self.book(passenger_count=1, boardingStationCode='NK')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')
        self.assertEqual(Booking.objects.count(), 0)

    def test_a_date_the_train_does_not_run_is_rejected(self):
        self.train.runs_wed = False
        self.train.save(update_fields=['runs_wed'])

        response = self.book(passenger_count=1)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_a_date_in_the_past_is_rejected(self):
        response = self.client.post(
            reverse('train:booking-create'),
            data=json.dumps(self.booking_payload(
                date=(timezone.localdate() - timedelta(days=1)).isoformat(),
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_the_ladies_quota_is_women_only(self):
        TrainAvailability.objects.create(
            train=self.train, train_class=self.ac3, quota=self.ladies,
            travel_date=self.travel_date, fare=Decimal('1200.00'),
            availability_kind=TrainAvailability.AVAILABLE,
            availability_count=10, availability_label='AVAILABLE-0010',
            confirm_chance=100,
        )

        payload = self.booking_payload(passenger_count=1, quota='ladies')
        response = self.client.post(
            reverse('train:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

        payload['passengers'][0]['gender'] = 'female'
        response = self.client.post(
            reverse('train:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)

    def test_more_than_six_passengers_is_rejected(self):
        response = self.book(passenger_count=7)
        self.assertEqual(response.status_code, 400)

    def test_at_least_one_passenger_is_required(self):
        response = self.book(passenger_count=0)
        self.assertEqual(response.status_code, 400)

    def test_a_bad_phone_number_is_rejected(self):
        response = self.client.post(
            reverse('train:booking-create'),
            data=json.dumps(self.booking_payload(
                contact={'email': 'demo@gmail.com', 'phone': '12345'},
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('contact', response.json()['error']['detail'])


class PaymentTests(TrainApiTestCase):
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


class BookingLookupTests(TrainApiTestCase):

    def test_a_ticket_can_be_fetched_back_by_pnr(self):
        created = self.book(passenger_count=2).json()

        response = self.client.get(
            reverse('train:booking-detail', args=[created['pnr']])
        )
        self.assertEqual(response.status_code, 200)

        fetched = response.json()
        self.assertEqual(fetched['pnr'], created['pnr'])
        self.assertEqual(fetched['passengers'], created['passengers'])
        self.assertEqual(fetched['fare'], created['fare'])
        self.assertEqual(fetched['boardingStation'], created['boardingStation'])
        self.assertEqual(fetched['chartStatus'], created['chartStatus'])

    def test_the_fare_on_a_ticket_is_the_one_that_was_paid(self):
        created = self.book(passenger_count=2).json()

        # The fare moves after the sale; the ticket must not.
        self.ac3_availability.refresh_from_db()
        self.ac3_availability.fare = Decimal('1800.00')
        self.ac3_availability.save(update_fields=['fare'])

        fetched = self.client.get(
            reverse('train:booking-detail', args=[created['pnr']])
        ).json()
        self.assertEqual(fetched['fare']['baseFare'], 2400)
        self.assertEqual(fetched['fare']['total'], 2604.9)

    def test_an_unknown_pnr_is_a_404(self):
        response = self.client.get(
            reverse('train:booking-detail', args=['2000000000'])
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')

    def test_a_ticket_still_reads_after_the_train_is_withdrawn(self):
        pnr = self.book(passenger_count=1).json()['pnr']

        self.train.is_active = False
        self.train.save(update_fields=['is_active'])

        response = self.client.get(reverse('train:booking-detail', args=[pnr]))
        self.assertEqual(response.status_code, 200)


class AllotmentUnitTests(TrainApiTestCase):
    """The chart is random, so it is pinned here with a seeded generator."""

    def test_a_named_preference_is_carried_into_the_berth(self):
        from train.services import allot

        allotments = allot(
            [{'berth': 'side-upper'}], self.ac3_availability,
            rng=random.Random(7),
        )
        self.assertTrue(allotments[0]['berth'].endswith('Side Upper'))
        self.assertEqual(allotments[0]['status'], 'CNF')

    def test_no_preference_still_gets_a_real_berth(self):
        from train.services import allot

        allotments = allot(
            [{'berth': 'no-preference'}], self.ac3_availability,
            rng=random.Random(3),
        )
        self.assertRegex(
            allotments[0]['berth'],
            r'^B\d / \d+ / (Lower|Middle|Upper|Side Lower|Side Upper)$',
        )

class BookingSummaryTests(TrainApiTestCase):
    """
    The row `GET /api/auth/me/bookings/` shows for a train ticket.

    Asserting that `title` and `detail` are strings is not idle: the first
    version of the bus summary handed back a model instance for `detail`,
    which only surfaced as a JSON encoder error at the aggregate endpoint.
    """

    def test_a_booking_summarises_for_the_account_ticket_list(self):
        from train import services
        from train.serializers import serialise_booking_summary

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
        self.assertEqual(summary['mode'], 'train')
        self.assertIsInstance(summary['title'], str)
        self.assertIsInstance(summary['detail'], str)
        self.assertTrue(summary['title'])
        self.assertTrue(summary['detail'])
        self.assertIsInstance(summary['travelDate'], str)
        self.assertIsInstance(summary['amount'], (int, float))
        self.assertEqual(summary['currency'], 'INR')
        self.assertIsNone(summary["endDate"])

    def test_the_list_is_scoped_to_the_account(self):
        from train import services

        self.assertEqual(self.book().status_code, 201)

        stranger = AppUser.objects.create(
            full_name='Someone Else', email='demo+summary@gmail.com',
            phone='9000009299', password_hash='x',
        )
        self.assertEqual(list(services.list_bookings(stranger.pk)), [])
        self.assertEqual(len(services.list_bookings(self.account.pk)), 1)
