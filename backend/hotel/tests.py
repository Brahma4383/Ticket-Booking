"""
Tests for the hotel API.

The models are `managed = False`, so the test database has no tables for them:
`migrate` skips unmanaged models by design. `HotelApiTestCase` builds them with
the schema editor instead, which means these run against SQLite without a
MySQL server - the point being to pin the *behaviour* (nightly inventory across
a stay, the tax slab, the booking transaction) rather than the storage.

What that deliberately does not cover: the CHECK constraints come from
schema.sql and only exist in MySQL, so the date and room-count tests prove the
serializer's and service layer's own rules, not the constraints behind them.
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

from hotel.models import (
    AppUser,
    Booking,
    BookingFareLine,
    City,
    HotelAmenity,
    HotelBooking,
    HotelGuest,
    Offer,
    Payment,
    Property,
    PropertyAmenity,
    RatePlan,
    RoomInventory,
    RoomType,
    RoomTypeAmenity,
)

# Dependency order: each table's foreign keys point at one already created.
SCHEMA_MODELS = [
    City, AppUser, Offer,
    HotelAmenity, Property, PropertyAmenity,
    RoomType, RoomTypeAmenity, RatePlan, RoomInventory,
    Booking, BookingFareLine, Payment, HotelBooking, HotelGuest,
]


class HotelApiTestCase(TransactionTestCase):
    """
    Base class: creates the unmanaged tables, then a Goa resort with two rooms.

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

        self.check_in = timezone.localdate() + timedelta(days=21)
        self.check_out = self.check_in + timedelta(days=3)  # three nights

        self.goa = City.objects.create(name='Goa', state='Goa')
        self.pune = City.objects.create(name='Pune', state='Maharashtra')

        self.wifi = HotelAmenity.objects.create(name='Free Wi-Fi')
        self.pool = HotelAmenity.objects.create(name='Swimming pool')
        self.ac = HotelAmenity.objects.create(name='Air conditioning')
        self.gym = HotelAmenity.objects.create(name='Fitness centre')

        self.stay = Property.objects.create(
            name='Silver Sands Goa', property_type='Resort', star_rating=4,
            locality='Beach Road', city=self.goa,
            address='Candolim, North Goa',
            distance_km=Decimal('3.4'),
            review_score=Decimal('8.6'), review_count=1420,
            checkin_time='14:00', checkout_time='11:00',
        )
        PropertyAmenity.objects.create(property=self.stay, amenity=self.wifi)
        PropertyAmenity.objects.create(property=self.stay, amenity=self.pool)

        self.standard = RoomType.objects.create(
            property=self.stay, name='Standard Room', size_sqft=200,
            bed_type='Queen', max_guests=2, rooms_total=12,
        )
        RoomTypeAmenity.objects.create(room_type=self.standard, amenity=self.ac)

        self.suite = RoomType.objects.create(
            property=self.stay, name='Executive Suite', size_sqft=420,
            bed_type='King', max_guests=4, rooms_total=3,
        )

        self.room_only = RatePlan.objects.create(
            room_type=self.standard, code='room-only', name='Room only',
            price_per_night=Decimal('4000.00'),
            breakfast_included=False, free_cancellation=False,
            cancellation_note='Non-refundable', pay_at_hotel=False,
        )
        self.flexible = RatePlan.objects.create(
            room_type=self.standard, code='flexible',
            name='Breakfast + free cancellation',
            price_per_night=Decimal('5280.00'),
            breakfast_included=True, free_cancellation=True,
            cancellation_note='Free cancellation up to 24 hours before check-in',
            pay_at_hotel=True,
        )
        # Above the Rs 7,500 slab, so this one is taxed at 18%.
        self.suite_plan = RatePlan.objects.create(
            room_type=self.suite, code='breakfast', name='With breakfast',
            price_per_night=Decimal('9000.00'),
            breakfast_included=True, free_cancellation=False,
            cancellation_note='Cancellation fee applies', pay_at_hotel=False,
        )

        self.open_inventory(self.standard, 5)
        self.open_inventory(self.suite, 2)

    def open_inventory(self, room, count, check_in=None, nights=None):
        """Load `count` rooms free on every night of the stay."""
        start = check_in or self.check_in
        span = nights if nights is not None else (self.check_out - start).days
        for offset in range(span):
            RoomInventory.objects.update_or_create(
                room_type=room, stay_date=start + timedelta(days=offset),
                defaults={'rooms_available': count},
            )

    # -- helpers ------------------------------------------------------------

    def search(self, city='Goa', check_in=None, check_out=None, **extra):
        params = {
            'city': city,
            'checkIn': (check_in or self.check_in).isoformat(),
            'checkOut': (check_out or self.check_out).isoformat(),
        }
        params.update(extra)
        return self.client.get(reverse('hotel:stay-list'), params)

    def booking_payload(self, **overrides):
        payload = {
            'propertyId': self.stay.pk,
            'roomTypeId': self.standard.pk,
            'ratePlanCode': 'room-only',
            'checkIn': self.check_in.isoformat(),
            'checkOut': self.check_out.isoformat(),
            'rooms': 1,
            'guests': 2,
            'guest': {
                'name': 'A Guest',
                'email': 'demo@gmail.com',
                'phone': '9876543210',
                'requests': 'High floor if possible',
                'arrival': 'After 18:00',
            },
        }
        payload.update(overrides)
        return payload

    def book(self, **kwargs):
        return self.client.post(
            reverse('hotel:booking-create'),
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
            reverse('payments:pay', args=['hotel', reference]),
            data=json.dumps(
                payment or {'method': 'netbanking', 'bank': 'HDFC Bank'}
            ),
            content_type='application/json',
        )


class StaySearchTests(HotelApiTestCase):

    def test_returns_the_property_in_the_shape_the_front_end_expects(self):
        response = self.search()
        self.assertEqual(response.status_code, 200)

        (stay,) = response.json()
        self.assertEqual(stay['id'], str(self.stay.pk))
        self.assertEqual(stay['name'], 'Silver Sands Goa')
        self.assertEqual(stay['type'], 'Resort')
        self.assertEqual(stay['starRating'], 4)
        self.assertEqual(stay['locality'], 'Beach Road')
        self.assertEqual(stay['city'], 'Goa')
        self.assertEqual(stay['distanceKm'], 3.4)
        self.assertEqual(stay['reviewScore'], 8.6)
        self.assertEqual(stay['reviewCount'], 1420)
        self.assertCountEqual(stay['amenities'], ['Free Wi-Fi', 'Swimming pool'])
        self.assertEqual(stay['checkInTime'], '14:00')
        self.assertEqual(stay['checkOutTime'], '11:00')

    def test_every_property_gets_a_stable_image_accent(self):
        first = self.search().json()[0]['imageAccent']
        second = self.search().json()[0]['imageAccent']

        self.assertEqual(first, second)
        self.assertTrue(first.startswith('from-'))

    def test_rooms_and_their_plans_are_nested(self):
        (stay,) = self.search().json()

        self.assertEqual([room['name'] for room in stay['rooms']],
                         ['Standard Room', 'Executive Suite'])

        standard = stay['rooms'][0]
        self.assertEqual(standard['id'], str(self.standard.pk))
        self.assertEqual(standard['bed'], 'Queen')
        self.assertEqual(standard['maxGuests'], 2)
        self.assertEqual(standard['sizeSqft'], 200)
        self.assertEqual(standard['amenities'], ['Air conditioning'])
        self.assertEqual([plan['id'] for plan in standard['ratePlans']],
                         ['room-only', 'flexible'])
        self.assertEqual(standard['ratePlans'][0], {
            'id': 'room-only', 'name': 'Room only', 'pricePerNight': 4000,
            'breakfastIncluded': False, 'freeCancellation': False,
            'cancellationNote': 'Non-refundable', 'payAtHotel': False,
        })

    def test_from_price_is_the_cheapest_bookable_plan(self):
        (stay,) = self.search().json()
        self.assertEqual(stay['fromPricePerNight'], 4000)

    def test_rooms_left_is_the_tightest_night_of_the_stay(self):
        # Plenty on two nights, one on the third.
        RoomInventory.objects.filter(
            room_type=self.standard,
            stay_date=self.check_in + timedelta(days=2),
        ).update(rooms_available=1)

        (stay,) = self.search().json()
        self.assertEqual(stay['rooms'][0]['roomsLeft'], 1)

    def test_a_night_with_no_inventory_row_means_nothing_is_bookable(self):
        RoomInventory.objects.filter(
            room_type=self.standard,
            stay_date=self.check_in + timedelta(days=1),
        ).delete()

        (stay,) = self.search().json()
        self.assertEqual(stay['rooms'][0]['roomsLeft'], 0)
        # The suite still has inventory, so the property stays listed.
        self.assertEqual(stay['rooms'][1]['roomsLeft'], 2)

    def test_a_property_with_nothing_free_is_left_out(self):
        RoomInventory.objects.all().update(rooms_available=0)
        self.assertEqual(self.search().json(), [])

    def test_a_room_too_small_for_the_party_is_still_listed(self):
        # StepRooms marks these rather than hiding them, so the API keeps them.
        (stay,) = self.search(guests=4).json()
        self.assertEqual([room['maxGuests'] for room in stay['rooms']], [2, 4])

    def test_city_names_match_case_insensitively(self):
        self.assertEqual(len(self.search(city='goa').json()), 1)

    def test_another_city_returns_nothing(self):
        self.assertEqual(self.search(city='Pune').json(), [])

    def test_check_out_must_be_after_check_in(self):
        response = self.search(check_out=self.check_in)
        self.assertEqual(response.status_code, 400)
        self.assertIn('checkOut', response.json()['error']['detail'])

    def test_missing_dates_are_rejected(self):
        response = self.client.get(reverse('hotel:stay-list'), {'city': 'Goa'})
        self.assertEqual(response.status_code, 400)


class AmenityListTests(HotelApiTestCase):

    def test_every_amenity_is_listed_without_a_city(self):
        response = self.client.get(reverse('hotel:amenity-list'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            ['Air conditioning', 'Fitness centre', 'Free Wi-Fi', 'Swimming pool'],
        )

    def test_a_city_narrows_it_to_what_is_actually_offered(self):
        response = self.client.get(reverse('hotel:amenity-list'), {'city': 'Goa'})
        self.assertEqual(response.json(), ['Free Wi-Fi', 'Swimming pool'])

    def test_a_city_with_no_stays_has_no_facets(self):
        response = self.client.get(reverse('hotel:amenity-list'), {'city': 'Pune'})
        self.assertEqual(response.json(), [])


class QuoteTests(HotelApiTestCase):

    def quote(self, **overrides):
        payload = {
            'roomTypeId': self.standard.pk,
            'ratePlanCode': 'room-only',
            'checkIn': self.check_in.isoformat(),
            'checkOut': self.check_out.isoformat(),
            'rooms': 1,
        }
        payload.update(overrides)
        return self.client.post(
            reverse('hotel:quote'),
            data=json.dumps(payload), content_type='application/json',
        )

    def test_matches_the_formula_the_fare_summary_uses(self):
        fare = self.quote().json()

        # 4000 x 3 nights x 1 room = 12000. Under Rs 7,500 a night, so 12%
        # = 1440. Property fee 99 x 3 x 1 = 297.
        self.assertEqual(fare['nights'], 3)
        self.assertEqual(fare['rooms'], 1)
        self.assertEqual(fare['roomTotal'], 12000)
        self.assertEqual(fare['taxRatePercent'], 12)
        self.assertEqual(fare['taxes'], 1440)
        self.assertEqual(fare['propertyFee'], 297)
        self.assertEqual(fare['total'], 13737)

    def test_the_higher_tax_slab_applies_at_seven_thousand_five_hundred(self):
        fare = self.quote(
            roomTypeId=self.suite.pk, ratePlanCode='breakfast',
        ).json()

        # 9000 a night is at or above the slab, so 18%.
        self.assertEqual(fare['taxRatePercent'], 18)
        self.assertEqual(fare['roomTotal'], 27000)
        self.assertEqual(fare['taxes'], 4860)

    def test_the_slab_follows_the_nightly_rate_not_the_total(self):
        # Three nights at 4000 is 12000 in total, well over the threshold,
        # but the nightly rate is what decides the band.
        fare = self.quote().json()
        self.assertEqual(fare['roomTotal'], 12000)
        self.assertEqual(fare['taxRatePercent'], 12)

    def test_more_rooms_scale_every_line(self):
        one = self.quote(rooms=1).json()
        two = self.quote(rooms=2).json()

        self.assertEqual(two['roomTotal'], one['roomTotal'] * 2)
        self.assertEqual(two['propertyFee'], one['propertyFee'] * 2)
        self.assertEqual(two['taxes'], one['taxes'] * 2)

    def test_the_quote_says_whether_it_is_still_bookable(self):
        fare = self.quote(rooms=5).json()
        self.assertEqual(fare['roomsLeft'], 5)
        self.assertIs(fare['bookable'], True)

        RoomInventory.objects.filter(
            room_type=self.standard, stay_date=self.check_in,
        ).update(rooms_available=1)

        fare = self.quote(rooms=5).json()
        self.assertEqual(fare['roomsLeft'], 1)
        self.assertIs(fare['bookable'], False)

    def test_a_plan_from_another_room_is_rejected(self):
        response = self.quote(ratePlanCode='breakfast')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_an_unknown_room_is_rejected(self):
        response = self.quote(roomTypeId=99999)
        self.assertEqual(response.status_code, 400)

    def test_more_than_five_rooms_is_rejected(self):
        self.assertEqual(self.quote(rooms=6).status_code, 400)


class BookingTests(HotelApiTestCase):

    def test_a_booking_returns_the_confirmation_the_voucher_renders(self):
        response = self.book()
        self.assertEqual(response.status_code, 201)

        body = response.json()
        self.assertRegex(body['bookingId'], r'^HT[A-Z2-9]{6}$')
        self.assertEqual(body['status'], 'pending')
        self.assertEqual(body['property']['id'], str(self.stay.pk))
        self.assertEqual(body['room']['id'], str(self.standard.pk))
        self.assertEqual(body['ratePlan']['id'], 'room-only')
        self.assertEqual(body['query'], {
            'city': 'Goa',
            'checkIn': self.check_in.isoformat(),
            'checkOut': self.check_out.isoformat(),
            'guests': 2,
        })
        self.assertEqual(body['rooms'], 1)
        self.assertEqual(body['guest'], {
            'name': 'A Guest', 'email': 'demo@gmail.com',
            'phone': '9876543210', 'requests': 'High floor if possible',
            'arrival': 'After 18:00',
        })
        self.assertEqual(body['fare']['total'], 13737)
        # Nothing has been paid yet: the payments module does that next.
        self.assertEqual(body['paymentMethod'], '')
        self.assertIsNone(body['payment'])
        self.assertIsNotNone(body['holdExpiresAt'])

    def test_a_booking_writes_every_row_the_schema_expects(self):
        booking_id = self.book().json()['bookingId']
        self.assertEqual(self.pay(booking_id).status_code, 200)

        booking = Booking.objects.get(reference=booking_id)
        self.assertEqual(booking.mode, 'hotel')
        self.assertEqual(booking.status, 'confirmed')
        # The account comes from the token, not the payload.
        self.assertEqual(booking.user_id, self.account.pk)
        self.assertEqual(booking.total_amount, Decimal('13737.00'))
        self.assertEqual(booking.contact_email, 'demo@gmail.com')

        hotel_booking = HotelBooking.objects.get(pk=booking.pk)
        self.assertEqual(hotel_booking.nights, 3)
        self.assertEqual(hotel_booking.rooms, 1)
        self.assertEqual(hotel_booking.guests, 2)
        self.assertEqual(hotel_booking.room_total, Decimal('12000.00'))
        self.assertEqual(hotel_booking.tax_rate_percent, Decimal('12.00'))
        self.assertEqual(hotel_booking.taxes, Decimal('1440.00'))
        self.assertEqual(hotel_booking.property_fee, Decimal('297.00'))
        self.assertEqual(hotel_booking.arrival_window, 'After 18:00')
        self.assertEqual(
            hotel_booking.special_requests, 'High floor if possible',
        )

        lead = hotel_booking.party.get()
        self.assertEqual(lead.full_name, 'A Guest')
        self.assertIs(lead.is_lead, True)

        self.assertEqual(
            [line.label for line in booking.fare_lines.all()],
            ['3 night(s) x 1 room(s)', 'Taxes and fees (12%)', 'Property fee'],
        )

        payment = booking.payments.get()
        self.assertEqual(payment.method, 'netbanking')
        self.assertEqual(payment.instrument, 'HDFC Bank')
        self.assertEqual(payment.status, 'success')

    def test_a_booking_takes_a_room_off_every_night_of_the_stay(self):
        self.assertEqual(self.book(rooms=2).status_code, 201)

        counts = list(
            RoomInventory.objects
            .filter(room_type=self.standard)
            .order_by('stay_date')
            .values_list('rooms_available', flat=True)
        )
        self.assertEqual(counts, [3, 3, 3])

    def test_a_booking_leaves_other_nights_alone(self):
        later = self.check_out + timedelta(days=1)
        self.open_inventory(self.standard, 5, check_in=later, nights=1)

        self.assertEqual(self.book().status_code, 201)

        self.assertEqual(
            RoomInventory.objects.get(
                room_type=self.standard, stay_date=later,
            ).rooms_available,
            5,
        )

    def test_a_stay_is_all_or_nothing(self):
        # Only one room free on the middle night.
        RoomInventory.objects.filter(
            room_type=self.standard,
            stay_date=self.check_in + timedelta(days=1),
        ).update(rooms_available=1)

        response = self.book(rooms=3)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'rooms_unavailable')
        self.assertEqual(
            response.json()['error']['detail']['nights'],
            [(self.check_in + timedelta(days=1)).isoformat()],
        )

        # Nothing was taken from the nights that did have room.
        counts = set(
            RoomInventory.objects
            .filter(room_type=self.standard, stay_date=self.check_in)
            .values_list('rooms_available', flat=True)
        )
        self.assertEqual(counts, {5})
        self.assertEqual(Booking.objects.count(), 0)

    def test_booking_the_last_rooms_closes_the_stay(self):
        self.assertEqual(self.book(rooms=5).status_code, 201)

        (stay,) = self.search().json()
        self.assertEqual(stay['rooms'][0]['roomsLeft'], 0)

        response = self.book(rooms=1)
        self.assertEqual(response.status_code, 409)

    def test_a_night_with_no_inventory_cannot_be_booked(self):
        RoomInventory.objects.filter(
            room_type=self.standard,
            stay_date=self.check_in + timedelta(days=2),
        ).delete()

        response = self.book()
        self.assertEqual(response.status_code, 409)

    def test_a_room_from_another_property_is_rejected(self):
        other = Property.objects.create(
            name='Lake View Pune', property_type='Hotel', star_rating=3,
            city=self.pune,
        )
        stray = RoomType.objects.create(
            property=other, name='Standard Room', max_guests=2,
        )

        response = self.book(roomTypeId=stray.pk)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')
        self.assertEqual(Booking.objects.count(), 0)

    def test_a_plan_from_another_room_is_rejected(self):
        response = self.book(ratePlanCode='breakfast')
        self.assertEqual(response.status_code, 400)

    def test_a_party_too_large_for_the_rooms_is_rejected(self):
        response = self.book(rooms=1, guests=4)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['detail']['maxGuests'], 2)

    def test_two_rooms_hold_twice_the_party(self):
        self.assertEqual(self.book(rooms=2, guests=4).status_code, 201)

    def test_a_check_in_in_the_past_is_rejected(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        response = self.client.post(
            reverse('hotel:booking-create'),
            data=json.dumps(self.booking_payload(
                checkIn=yesterday.isoformat(),
                checkOut=(yesterday + timedelta(days=2)).isoformat(),
            )),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_selection')

    def test_check_out_must_be_after_check_in(self):
        response = self.book(checkOut=self.check_in.isoformat())
        self.assertEqual(response.status_code, 400)

    def test_a_bad_phone_number_is_rejected(self):
        payload = self.booking_payload()
        payload['guest']['phone'] = '12345'

        response = self.client.post(
            reverse('hotel:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('guest', response.json()['error']['detail'])

    def test_requests_and_arrival_are_optional(self):
        payload = self.booking_payload()
        del payload['guest']['requests']
        del payload['guest']['arrival']

        response = self.client.post(
            reverse('hotel:booking-create'),
            data=json.dumps(payload), content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['guest']['requests'], '')


class PaymentTests(HotelApiTestCase):
    """The hand-off to the payments module, seen from this side."""

    def test_a_pay_at_hotel_plan_charges_nothing_online(self):
        created = self.book(ratePlanCode='flexible').json()
        self.assertGreater(created['fare']['total'], 0)

        response = self.pay(created['bookingId'])
        self.assertEqual(response.status_code, 200)

        body = response.json()
        # Confirmed on the strength of the guarantee; settled at the property.
        self.assertEqual(body['booking']['status'], 'confirmed')
        self.assertEqual(body['payment']['amount'], 0)
        self.assertEqual(body['payment']['status'], 'success')

        # And cancelling it refunds the nothing that was taken.
        cancelled = self.client.post(
            reverse('accounts:cancel-booking', args=['hotel', created['bookingId']])
        ).json()
        self.assertEqual(cancelled['refundAmount'], '0.00')

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
        # The whole fare is taken online.
        self.assertEqual(body['payment']['amount'], created['fare']['total'])


class BookingLookupTests(HotelApiTestCase):

    def test_a_voucher_can_be_fetched_back_by_booking_id(self):
        created = self.book().json()

        response = self.client.get(
            reverse('hotel:booking-detail', args=[created['bookingId']])
        )
        self.assertEqual(response.status_code, 200)

        fetched = response.json()
        self.assertEqual(fetched['fare'], created['fare'])
        self.assertEqual(fetched['guest'], created['guest'])
        self.assertEqual(fetched['ratePlan'], created['ratePlan'])
        self.assertEqual(fetched['query'], created['query'])

    def test_a_lowercase_booking_id_still_resolves(self):
        booking_id = self.book().json()['bookingId']

        response = self.client.get(
            reverse('hotel:booking-detail', args=[booking_id.lower()])
        )
        self.assertEqual(response.status_code, 200)

    def test_the_fare_on_a_voucher_is_the_one_that_was_paid(self):
        created = self.book().json()

        self.room_only.price_per_night = Decimal('9000.00')
        self.room_only.save(update_fields=['price_per_night'])

        fetched = self.client.get(
            reverse('hotel:booking-detail', args=[created['bookingId']])
        ).json()
        self.assertEqual(fetched['fare']['roomTotal'], 12000)
        self.assertEqual(fetched['fare']['total'], 13737)

    def test_an_unknown_booking_id_is_a_404(self):
        response = self.client.get(
            reverse('hotel:booking-detail', args=['HTZZZZZZ'])
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')

    def test_a_voucher_still_reads_after_the_stay_is_delisted(self):
        booking_id = self.book().json()['bookingId']

        self.stay.is_active = False
        self.stay.save(update_fields=['is_active'])

        response = self.client.get(
            reverse('hotel:booking-detail', args=[booking_id])
        )
        self.assertEqual(response.status_code, 200)

class BookingSummaryTests(HotelApiTestCase):
    """
    The row `GET /api/auth/me/bookings/` shows for a stay ticket.

    Asserting that `title` and `detail` are strings is not idle: the first
    version of the bus summary handed back a model instance for `detail`,
    which only surfaced as a JSON encoder error at the aggregate endpoint.
    """

    def test_a_booking_summarises_for_the_account_ticket_list(self):
        from hotel import services
        from hotel.serializers import serialise_booking_summary

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
        self.assertEqual(summary['mode'], 'hotel')
        self.assertIsInstance(summary['title'], str)
        self.assertIsInstance(summary['detail'], str)
        self.assertTrue(summary['title'])
        self.assertTrue(summary['detail'])
        self.assertIsInstance(summary['travelDate'], str)
        self.assertIsInstance(summary['amount'], (int, float))
        self.assertEqual(summary['currency'], 'INR')
        self.assertIsInstance(summary["endDate"], str)

    def test_the_list_is_scoped_to_the_account(self):
        from hotel import services

        self.assertEqual(self.book().status_code, 201)

        stranger = AppUser.objects.create(
            full_name='Someone Else', email='demo+summary@gmail.com',
            phone='9000009499', password_hash='x',
        )
        self.assertEqual(list(services.list_bookings(stranger.pk)), [])
        self.assertEqual(len(services.list_bookings(self.account.pk)), 1)
