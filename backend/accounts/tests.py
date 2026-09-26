"""
Tests for the accounts API and the sign-in gate on booking.

`app_user` is `managed = False` like everything else here, so the table is
built with the schema editor rather than by a migration - see the note in
config/test_settings.py about what that does and does not cover.

The gate itself is checked against the bus module. It is enforced by DRF's own
`IsAuthenticated` on each booking view, so proving it once proves the
mechanism; each module's own suite covers that its views carry it.
"""
import json
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.db import connection
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone

from accounts.authentication import TOKEN_SALT, issue_token, read_token
from accounts.models import AppUser, SavedTraveller

SCHEMA_MODELS = [AppUser, SavedTraveller]


class AccountsTestCase(TransactionTestCase):

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

    # -- helpers ------------------------------------------------------------

    def register(self, **overrides):
        payload = {
            'fullName': 'A Traveller',
            'email': 'demo@gmail.com',
            'phone': '9876543210',
            'password': 'a-good-password',
        }
        payload.update(overrides)
        return self.client.post(
            reverse('accounts:register'),
            data=json.dumps(payload), content_type='application/json',
        )

    def login(self, **overrides):
        payload = {
            'identifier': 'demo@gmail.com',
            'password': 'a-good-password',
        }
        payload.update(overrides)
        return self.client.post(
            reverse('accounts:login'),
            data=json.dumps(payload), content_type='application/json',
        )


class RegisterTests(AccountsTestCase):

    def test_registering_creates_the_account_and_signs_it_in(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)

        body = response.json()
        self.assertTrue(body['token'])
        self.assertGreater(body['expiresIn'], 0)
        self.assertEqual(body['user']['fullName'], 'A Traveller')
        self.assertEqual(body['user']['email'], 'demo@gmail.com')
        self.assertEqual(body['user']['phone'], '9876543210')

        user = AppUser.objects.get(email='demo@gmail.com')
        self.assertIs(user.is_active, True)
        self.assertIsNotNone(user.last_login_at)

    def test_the_password_is_stored_as_a_hash(self):
        self.register()
        user = AppUser.objects.get()

        self.assertNotEqual(user.password_hash, 'a-good-password')
        self.assertNotIn('a-good-password', user.password_hash)
        self.assertTrue(check_password('a-good-password', user.password_hash))

    def test_the_hash_never_leaves_the_server(self):
        body = self.register().json()
        self.assertNotIn('password_hash', json.dumps(body))
        self.assertNotIn('passwordHash', json.dumps(body))

    def test_the_email_is_stored_lowercased(self):
        self.register(email='Demo@Gmail.COM')
        self.assertEqual(AppUser.objects.get().email, 'demo@gmail.com')

    def test_a_duplicate_email_is_a_409(self):
        self.register()
        response = self.register(phone='9000000002')

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['code'], 'account_exists')
        self.assertEqual(AppUser.objects.count(), 1)

    def test_a_duplicate_phone_is_a_409(self):
        self.register()
        response = self.register(email='demo+other@gmail.com')

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error']['detail']['field'], 'phone')

    def test_a_weak_password_is_rejected(self):
        response = self.register(password='12345678')
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.json()['error']['detail'])
        self.assertEqual(AppUser.objects.count(), 0)

    def test_a_short_password_is_rejected(self):
        self.assertEqual(self.register(password='abc').status_code, 400)

    def test_a_bad_phone_number_is_rejected(self):
        response = self.register(phone='12345')
        self.assertEqual(response.status_code, 400)
        self.assertIn('phone', response.json()['error']['detail'])

    def test_a_bad_email_is_rejected(self):
        self.assertEqual(self.register(email='not-an-email').status_code, 400)


class LoginTests(AccountsTestCase):

    def test_signing_in_with_an_email(self):
        self.register()
        response = self.login()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['token'])
        self.assertEqual(response.json()['user']['email'], 'demo@gmail.com')

    def test_signing_in_with_a_mobile_number(self):
        self.register()
        response = self.login(identifier='9876543210')
        self.assertEqual(response.status_code, 200)

    def test_the_email_is_matched_case_insensitively(self):
        self.register()
        self.assertEqual(self.login(identifier='DEMO@GMAIL.COM').status_code, 200)

    def test_a_wrong_password_is_a_401(self):
        self.register()
        response = self.login(password='not-the-password')

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'invalid_credentials')

    def test_an_unknown_email_is_told_to_register(self):
        self.register()
        response = self.login(identifier='demo+nobody@gmail.com')

        # Deliberately a different answer from a wrong password, which is
        # also how an account list gets enumerated - see AccountNotFound.
        # Someone who never signed up should be sent to sign-up rather than
        # left guessing at a password they never set.
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'account_not_found')

    def test_an_unknown_mobile_is_told_to_register(self):
        self.register()
        response = self.login(identifier='9000000000')

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'account_not_found')

    def test_an_unknown_account_and_a_wrong_password_differ(self):
        self.register()
        unknown = self.login(identifier='demo+nobody@gmail.com')
        wrong = self.login(password='not-the-password')

        self.assertNotEqual(unknown.status_code, wrong.status_code)
        self.assertNotEqual(
            unknown.json()['error']['code'], wrong.json()['error']['code']
        )

    def test_a_deactivated_account_cannot_sign_in(self):
        self.register()
        AppUser.objects.update(is_active=False)

        self.assertEqual(self.login().status_code, 401)

    def test_signing_in_records_the_time(self):
        self.register()
        AppUser.objects.update(last_login_at=None)

        self.login()
        self.assertIsNotNone(AppUser.objects.get().last_login_at)


class TokenTests(AccountsTestCase):

    def setUp(self):
        super().setUp()
        self.user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210',
            password_hash=make_password('a-good-password'),
        )

    def me(self, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.get(reverse('accounts:me'), **headers)

    def test_a_valid_token_names_its_account(self):
        response = self.me(issue_token(self.user))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['email'], 'demo@gmail.com')

    def test_no_token_is_a_401(self):
        response = self.me()
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'not_authenticated')

    def test_a_tampered_token_is_a_401(self):
        token = issue_token(self.user)
        self.assertEqual(self.me(token[:-2] + 'xy').status_code, 401)

    def test_a_token_signed_with_another_salt_is_refused(self):
        forged = signing.dumps({'uid': self.user.pk, 'pw': 'whatever'},
                               salt='some.other.salt')
        self.assertEqual(self.me(forged).status_code, 401)

    def test_changing_the_password_invalidates_older_tokens(self):
        token = issue_token(self.user)
        self.assertEqual(self.me(token).status_code, 200)

        self.user.password_hash = make_password('a-different-password')
        self.user.save(update_fields=['password_hash'])

        self.assertEqual(self.me(token).status_code, 401)
        self.assertIsNone(read_token(token))

    def test_a_deactivated_account_stops_being_readable(self):
        token = issue_token(self.user)
        AppUser.objects.update(is_active=False)

        self.assertIsNone(read_token(token))

    def test_a_token_for_a_deleted_account_is_refused(self):
        token = issue_token(self.user)
        self.user.delete()

        self.assertIsNone(read_token(token))

    def test_a_malformed_authorization_header_is_a_401(self):
        response = self.client.get(
            reverse('accounts:me'), HTTP_AUTHORIZATION='Bearer'
        )
        self.assertEqual(response.status_code, 401)

    def test_a_token_salted_correctly_but_stale_is_refused(self):
        stale = signing.dumps({'uid': self.user.pk, 'pw': 'oldhash1'},
                              salt=TOKEN_SALT)
        self.assertIsNone(read_token(stale))


class BookingGateTests(AccountsTestCase):
    """
    The point of all of this: a visitor cannot book, a signed-in one can.

    Run against the bus module because it needs the least set-up. The gate is
    DRF's own `IsAuthenticated` on each booking view, so it behaves the same
    on all five.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from bus import models as bus_models

        from cab import models as cab_models
        from hotel import models as hotel_models
        from plane import models as plane_models
        from train import models as train_models

        cls.bus_models = [
            bus_models.City, bus_models.Offer, bus_models.BusOperator,
            bus_models.BusAmenity, bus_models.BusTrip,
            bus_models.BusTripAmenity, bus_models.BusStopPoint,
            bus_models.BusSeat, bus_models.Booking,
            bus_models.BookingFareLine, bus_models.Payment,
            bus_models.BusBooking, bus_models.BusBookingSeat,
            # `me/bookings/` reads all five modes, so the other four subtype
            # tables have to exist even when this class only ever fills the
            # bus one. `city`, `booking` and `payment` are shared and are
            # already above - creating them again would collide.
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
            for model in cls.bus_models:
                editor.create_model(model)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in reversed(cls.bus_models):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        from bus.models import (
            BusOperator, BusSeat, BusStopPoint, BusTrip, City,
        )
        from bus.models import Booking as BusBookingRow

        # Bookings before accounts: `booking.user_id` points at `app_user`, so
        # clearing the accounts first trips the foreign key.
        for model in reversed(self.bus_models):
            model.objects.all().delete()
        super().setUp()

        self.travel_date = timezone.localdate() + timedelta(days=7)
        self.booking_model = BusBookingRow

        mumbai = City.objects.create(name='Mumbai', state='Maharashtra')
        pune = City.objects.create(name='Pune', state='Maharashtra')
        operator = BusOperator.objects.create(
            name='Sharma Travels', rating=Decimal('4.3'), rating_count=10,
        )
        self.trip = BusTrip.objects.create(
            operator=operator, coach_name='Volvo 9600', seat_kind='seater',
            layout='2+2', origin_city=mumbai, destination_city=pune,
            departure_time='07:00', arrival_time='10:30',
            duration_minutes=210, base_fare=Decimal('500.00'),
        )
        self.boarding = BusStopPoint.objects.create(
            trip=self.trip, kind=BusStopPoint.BOARDING,
            name='Mumbai Central', stop_time='06:45',
        )
        self.dropping = BusStopPoint.objects.create(
            trip=self.trip, kind=BusStopPoint.DROPPING,
            name='Pune Station', stop_time='10:45',
        )
        BusSeat.objects.create(
            trip=self.trip, seat_code='A1', deck='lower', row_no=1,
            column_no=1, seat_kind='seater', price=Decimal('500.00'),
        )

    def booking_payload(self):
        return {
            'tripId': self.trip.pk,
            'date': self.travel_date.isoformat(),
            'seatIds': ['A1'],
            'passengers': [{
                'seatId': 'A1', 'name': 'A Traveller',
                'age': '30', 'gender': 'male',
            }],
            'contact': {'email': 'demo@gmail.com', 'phone': '9876543210'},
            'boardingPointId': self.boarding.pk,
            'droppingPointId': self.dropping.pk,
        }

    def book(self, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.post(
            reverse('bus:booking-create'),
            data=json.dumps(self.booking_payload()),
            content_type='application/json',
            **headers,
        )

    def pay(self, reference, token=None):
        """Booking only holds the seat; this is what pays for it."""
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.post(
            reverse('payments:pay', args=['bus', reference]),
            data=json.dumps({'method': 'upi', 'upiId': 'rider@okhdfcbank'}),
            content_type='application/json',
            **headers,
        )

    def test_searching_does_not_need_an_account(self):
        response = self.client.get(reverse('bus:trip-list'), {
            'from': 'Mumbai', 'to': 'Pune',
            'date': self.travel_date.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_quoting_does_not_need_an_account(self):
        response = self.client.post(
            reverse('bus:quote'),
            data=json.dumps({
                'tripId': self.trip.pk,
                'date': self.travel_date.isoformat(),
                'seatIds': ['A1'],
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)

    def test_booking_without_an_account_is_refused(self):
        response = self.book()

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'not_authenticated')
        # The header is what tells a browser this is a sign-in, not a refusal.
        self.assertEqual(response['WWW-Authenticate'], 'Bearer')
        self.assertEqual(self.booking_model.objects.count(), 0)

    def test_booking_with_an_expired_session_is_refused(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        token = issue_token(user)

        user.password_hash = make_password('a-different-password')
        user.save(update_fields=['password_hash'])

        self.assertEqual(self.book(token).status_code, 401)
        self.assertEqual(self.booking_model.objects.count(), 0)

    def test_booking_with_an_account_works_and_records_it(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )

        response = self.book(issue_token(user))
        self.assertEqual(response.status_code, 201)

        booking = self.booking_model.objects.get()
        self.assertEqual(booking.user_id, user.pk)

    def my_bookings(self, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.get(reverse('accounts:my-bookings'), **headers)

    def test_the_ticket_list_needs_an_account(self):
        response = self.my_bookings()

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error']['code'], 'not_authenticated')

    def test_a_new_account_has_an_empty_ticket_list(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )

        response = self.my_bookings(issue_token(user))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'bookings': []})

    def test_the_ticket_list_summarises_a_booking(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        token = issue_token(user)
        self.assertEqual(self.book(token).status_code, 201)

        (summary,) = self.my_bookings(token).json()['bookings']

        self.assertEqual(summary['mode'], 'bus')
        self.assertEqual(summary['title'], 'Mumbai → Pune')
        self.assertEqual(summary['detail'], 'Sharma Travels')
        self.assertEqual(summary['travelDate'], self.travel_date.isoformat())
        # Only stays carry a second date.
        self.assertIsNone(summary['endDate'])
        self.assertEqual(summary['currency'], 'INR')
        self.assertEqual(
            summary['reference'], self.booking_model.objects.get().reference,
        )

    def test_the_ticket_list_shows_only_this_accounts_bookings(self):
        mine = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        theirs = AppUser.objects.create(
            full_name='Someone Else', email='demo+other@gmail.com',
            phone='9000000003', password_hash=make_password('a-good-password'),
        )
        self.assertEqual(self.book(issue_token(mine)).status_code, 201)

        # Same ticket in the database, a different account asking.
        self.assertEqual(
            self.my_bookings(issue_token(theirs)).json(), {'bookings': []},
        )
        self.assertEqual(
            len(self.my_bookings(issue_token(mine)).json()['bookings']), 1,
        )

    def test_a_ticket_is_only_readable_by_the_account_that_booked_it(self):
        mine = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        theirs = AppUser.objects.create(
            full_name='Someone Else', email='demo+other@gmail.com',
            phone='9000000002', password_hash=make_password('a-good-password'),
        )

        pnr = self.book(issue_token(mine)).json()['pnr']

        url = reverse('bus:booking-detail', args=[pnr])
        self.assertEqual(
            self.client.get(
                url, HTTP_AUTHORIZATION=f'Bearer {issue_token(mine)}'
            ).status_code,
            200,
        )
        # Same reference, different account: not found rather than forbidden,
        # so the reply does not confirm the booking exists.
        self.assertEqual(
            self.client.get(
                url, HTTP_AUTHORIZATION=f'Bearer {issue_token(theirs)}'
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get(url).status_code, 401)

    # --- cancellation ------------------------------------------------------

    def cancel(self, reference, token=None, mode='bus'):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.client.post(
            reverse('accounts:cancel-booking', args=[mode, reference]),
            **headers,
        )

    def test_cancelling_needs_an_account(self):
        self.assertEqual(self.cancel('SB123456').status_code, 401)

    def test_cancelling_frees_the_seat_and_refunds_the_payment(self):
        from bus.models import BusBookingSeat, Payment

        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        token = issue_token(user)
        pnr = self.book(token).json()['pnr']
        self.assertEqual(self.pay(pnr, token).status_code, 200)

        self.assertEqual(BusBookingSeat.objects.count(), 1)

        response = self.cancel(pnr, token)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['booking']['status'], 'cancelled')
        self.assertEqual(body['booking']['reference'], pnr)
        self.assertEqual(body['currency'], 'INR')

        booking = self.booking_model.objects.get()
        self.assertEqual(booking.status, 'cancelled')
        self.assertIsNotNone(booking.cancelled_at)
        # The refund is what was paid, read off the payment row.
        self.assertEqual(Decimal(body['refundAmount']), booking.total_amount)

        # The seat row *is* the reservation, so the seat is only free once it
        # is gone - and the same seat can be sold again afterwards.
        self.assertEqual(BusBookingSeat.objects.count(), 0)
        self.assertEqual(self.book(token).status_code, 201)

        self.assertEqual(
            list(
                Payment.objects.filter(booking=booking)
                .values_list('status', flat=True)
            ),
            ['refunded'],
        )

    def test_cancelling_an_unpaid_booking_refunds_nothing(self):
        from bus.models import BusBookingSeat

        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        token = issue_token(user)
        # Booked, never paid for: still `pending`, still holding its seat.
        pnr = self.book(token).json()['pnr']
        self.assertEqual(BusBookingSeat.objects.count(), 1)

        response = self.cancel(pnr, token)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['booking']['status'], 'cancelled')
        self.assertEqual(body['refundAmount'], '0.00')
        # The seat goes back on sale all the same.
        self.assertEqual(BusBookingSeat.objects.count(), 0)

    def test_a_booking_cannot_be_cancelled_twice(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        token = issue_token(user)
        pnr = self.book(token).json()['pnr']

        self.assertEqual(self.cancel(pnr, token).status_code, 200)

        second = self.cancel(pnr, token)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(
            second.json()['error']['code'], 'cancellation_not_allowed',
        )

    def test_a_journey_in_the_past_cannot_be_cancelled(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        token = issue_token(user)
        pnr = self.book(token).json()['pnr']

        # Moved back rather than booked in the past, which the booking
        # endpoint refuses outright.
        from bus.models import BusBooking

        BusBooking.objects.filter(booking__reference=pnr).update(
            travel_date=timezone.localdate() - timedelta(days=1),
        )

        response = self.cancel(pnr, token)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()['error']['code'], 'cancellation_not_allowed',
        )
        # Untouched: still waiting for its payment.
        self.assertEqual(self.booking_model.objects.get().status, 'pending')

    def test_one_account_cannot_cancel_another_accounts_booking(self):
        mine = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )
        theirs = AppUser.objects.create(
            full_name='Someone Else', email='demo+other@gmail.com',
            phone='9000000004', password_hash=make_password('a-good-password'),
        )
        pnr = self.book(issue_token(mine)).json()['pnr']

        response = self.cancel(pnr, issue_token(theirs))

        # Not found rather than forbidden, so the reply does not confirm the
        # reference exists.
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error']['code'], 'booking_not_found')
        # Untouched: still waiting for its payment.
        self.assertEqual(self.booking_model.objects.get().status, 'pending')

    def test_cancelling_an_unknown_mode_is_a_404(self):
        user = AppUser.objects.create(
            full_name='A Traveller', email='demo@gmail.com',
            phone='9876543210', password_hash=make_password('a-good-password'),
        )

        response = self.cancel('SB123456', issue_token(user), mode='ferry')

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json()['error']['code'], 'unknown_booking_mode',
        )


# ---------------------------------------------------------------------------
# Forgotten passwords
# ---------------------------------------------------------------------------

import re  # noqa: E402
from unittest import mock  # noqa: E402

from django.core import mail  # noqa: E402
from django.core.cache import cache  # noqa: E402
from django.test import override_settings  # noqa: E402

from accounts import views as account_views  # noqa: E402
from accounts.password_reset import reset_tokens  # noqa: E402

LINK = re.compile(
    r'(http://frontend\.test/reset-password\?uid=([^&\s]+)&token=([^\s"<]+))'
)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='demo@gmail.com',
    FRONTEND_URL='http://frontend.test/',
    PASSWORD_RESET_TIMEOUT=3600,
)
class PasswordResetTests(AccountsTestCase):
    """The whole round trip: ask for a link, check it, use it."""

    def setUp(self):
        super().setUp()
        mail.outbox = []
        # The limits are exercised in PasswordResetThrottleTests; here they
        # would only trip over a class of tests sharing one address.
        for view in (
            account_views.ForgotPasswordView,
            account_views.ResetPasswordCheckView,
            account_views.ResetPasswordView,
        ):
            original = view.throttle_classes
            view.throttle_classes = []
            self.addCleanup(setattr, view, 'throttle_classes', original)

        self.assertEqual(self.register().status_code, 201)
        self.user = AppUser.objects.get()
        mail.outbox = []

    # -- helpers ------------------------------------------------------------

    def post(self, name, **payload):
        return self.client.post(
            reverse(f'accounts:{name}'),
            data=json.dumps(payload), content_type='application/json',
        )

    def forgot(self, identifier='demo@gmail.com'):
        return self.post('password-forgot', identifier=identifier)

    def link(self):
        """(url, uid, token) out of the last reset mail."""
        (message,) = [m for m in mail.outbox if 'Reset your' in m.subject]
        return LINK.search(message.body).groups()

    def reset(self, uid, token, password='a-brand-new-secret'):
        return self.post('password-reset', uid=uid, token=token, password=password)

    # -- asking for a link ----------------------------------------------------

    def test_an_email_gets_a_reset_link_to_the_front_end(self):
        response = self.forgot()

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json(), {'sent': True, 'expiresInMinutes': 60})

        (message,) = mail.outbox
        self.assertEqual(message.to, ['demo@gmail.com'])
        self.assertEqual(message.from_email, 'demo@gmail.com')
        self.assertIn('Reset your SuryaBooker password', message.subject)
        url, _, _ = self.link()
        self.assertTrue(url.startswith('http://frontend.test/reset-password?'))
        # The HTML part carries the same link, as a button.
        html, _ = message.alternatives[0]
        self.assertIn('Choose a new password', html)

    def test_a_mobile_number_finds_the_account_and_mails_its_email(self):
        response = self.forgot('+91 98765 43210')

        self.assertEqual(response.status_code, 202)
        (message,) = mail.outbox
        self.assertEqual(message.to, ['demo@gmail.com'])

    def test_the_email_is_matched_case_insensitively(self):
        self.forgot('Demo@Gmail.COM')
        self.assertEqual(len(mail.outbox), 1)

    def test_an_unknown_account_gets_the_same_answer_and_no_mail(self):
        known = self.forgot()
        mail.outbox = []

        unknown = self.forgot('demo+nobody@gmail.com')

        self.assertEqual(unknown.status_code, known.status_code)
        self.assertEqual(unknown.json(), known.json())
        self.assertEqual(mail.outbox, [])

    def test_a_deactivated_account_is_not_sent_a_link(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])

        self.assertEqual(self.forgot().status_code, 202)
        self.assertEqual(mail.outbox, [])

    def test_something_that_is_neither_an_email_nor_a_mobile_is_a_400(self):
        response = self.forgot('not an address')

        self.assertEqual(response.status_code, 400)
        self.assertIn('identifier', response.json()['error']['detail'])

    def test_a_mail_server_failure_does_not_change_the_answer(self):
        with mock.patch(
            'django.core.mail.EmailMultiAlternatives.send',
            side_effect=OSError('SMTP is down'),
        ), self.assertLogs('accounts.password_reset', level='ERROR') as logs:
            response = self.forgot()

        self.assertEqual(response.status_code, 202)
        # Logged by account id, never by address.
        self.assertIn(f'account {self.user.pk}', logs.output[0])
        self.assertNotIn('demo@gmail.com', logs.output[0])

    # -- checking the link ----------------------------------------------------

    def test_a_fresh_link_checks_out_with_a_masked_email(self):
        self.forgot()
        _, uid, token = self.link()

        response = self.post('password-reset-check', uid=uid, token=token)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            'valid': True,
            'email': 'd•••o@gmail.com',
            'firstName': 'A',
        })

    def test_a_forged_token_or_uid_is_refused(self):
        self.forgot()
        _, uid, token = self.link()

        for bad_uid, bad_token in (
            (uid, token[:-2] + 'zz'),
            ('bm9wZQ', token),
            ('!!!', token),
            (uid, 'no-dash-here'),
        ):
            with self.subTest(uid=bad_uid, token=bad_token):
                response = self.post(
                    'password-reset-check', uid=bad_uid, token=bad_token,
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.json()['error']['code'], 'invalid_reset_link',
                )

    # -- using it -------------------------------------------------------------

    def test_a_new_password_is_set_and_signs_in(self):
        self.forgot()
        _, uid, token = self.link()

        response = self.reset(uid, token)
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertEqual(body['user']['email'], 'demo@gmail.com')
        me = self.client.get(
            reverse('accounts:me'), HTTP_AUTHORIZATION=f"Bearer {body['token']}",
        )
        self.assertEqual(me.status_code, 200)

        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password='a-brand-new-secret').status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(check_password('a-brand-new-secret', self.user.password_hash))

    def test_the_account_holder_is_told_the_password_changed(self):
        self.forgot()
        _, uid, token = self.link()
        self.reset(uid, token)

        changed = [m for m in mail.outbox if 'was changed' in m.subject]
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0].to, ['demo@gmail.com'])

    def test_a_link_works_once(self):
        self.forgot()
        _, uid, token = self.link()
        self.assertEqual(self.reset(uid, token).status_code, 200)

        again = self.reset(uid, token, password='yet-another-secret')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()['error']['code'], 'invalid_reset_link')

    def test_every_other_device_is_signed_out(self):
        old_token = issue_token(self.user)
        self.forgot()
        _, uid, token = self.link()
        self.reset(uid, token)

        self.assertIsNone(read_token(old_token))

    def test_a_link_runs_out(self):
        self.forgot()
        _, uid, token = self.link()

        later = reset_tokens._now() + timedelta(hours=2)
        with mock.patch.object(reset_tokens, '_now', return_value=later):
            response = self.reset(uid, token)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_reset_link')

    def test_signing_in_meanwhile_retires_the_link(self):
        self.forgot()
        _, uid, token = self.link()

        # Remembered the password after all - a second later, so the recorded
        # sign-in time is not the one the link was made with.
        with mock.patch(
            'accounts.views.timezone.now',
            return_value=timezone.now() + timedelta(seconds=5),
        ):
            self.assertEqual(self.login().status_code, 200)

        self.assertEqual(self.reset(uid, token).status_code, 400)

    def test_a_weak_password_is_refused_and_the_link_still_works(self):
        self.forgot()
        _, uid, token = self.link()

        for weak in ('password', '12345678', 'short'):
            with self.subTest(password=weak):
                response = self.reset(uid, token, password=weak)
                self.assertEqual(response.status_code, 400)
                self.assertIn('password', response.json()['error']['detail'])

        self.assertEqual(self.reset(uid, token).status_code, 200)

    def test_the_current_password_is_refused(self):
        self.forgot()
        _, uid, token = self.link()

        response = self.reset(uid, token, password='a-good-password')

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            'current password', response.json()['error']['detail']['password'][0],
        )

    def test_a_deactivated_account_cannot_use_its_link(self):
        self.forgot()
        _, uid, token = self.link()
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])

        self.assertEqual(self.reset(uid, token).status_code, 400)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class PasswordResetThrottleTests(AccountsTestCase):

    def setUp(self):
        super().setUp()
        cache.clear()
        self.addCleanup(cache.clear)
        self.register()

    def forgot(self, identifier):
        return self.client.post(
            reverse('accounts:password-forgot'),
            data=json.dumps({'identifier': identifier}),
            content_type='application/json',
        )

    def test_one_account_cannot_be_flooded(self):
        for _ in range(3):
            self.assertEqual(self.forgot('demo@gmail.com').status_code, 202)

        response = self.forgot('DEMO@gmail.com')
        self.assertEqual(response.status_code, 429)

        error = response.json()['error']
        self.assertEqual(error['code'], 'too_many_requests')
        self.assertIn('minutes', error['message'])
        self.assertGreater(error['detail']['retryAfterSeconds'], 0)

    def test_one_address_cannot_ask_for_many_accounts(self):
        for index in range(5):
            self.assertEqual(
                self.forgot(f'demo+someone{index}@gmail.com').status_code, 202,
            )

        self.assertEqual(self.forgot('demo+someone9@gmail.com').status_code, 429)
