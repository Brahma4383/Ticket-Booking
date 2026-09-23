"""
HTTP layer for the accounts module.

    POST /api/auth/register/    create an account and sign in
    POST /api/auth/login/       sign in
    GET  /api/auth/me/          who the token belongs to
    GET  /api/auth/me/bookings/ every ticket this account holds
    POST /api/auth/me/bookings/<mode>/<reference>/cancel/  cancel one

There is no logout endpoint. The token is signed rather than stored, so
there is nothing on the server to delete - signing out is the client dropping
it. What the server *can* do is invalidate every token an account holds, and
that happens when its password changes.
"""
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import issue_token, token_lifetime_seconds
from accounts.exceptions import (
    AccountExists,
    AccountNotFound,
    InvalidCredentials,
    UnknownBookingMode,
    api_exception_handler,
)
from accounts.models import AppUser
from accounts.serializers import (
    LoginSerializer,
    RegisterSerializer,
    serialise_session,
    serialise_user,
)


class AccountsAPIView(APIView):
    """
    Base for every view in this module.

    Names the accounts module's own exception handler rather than reading
    `settings.EXCEPTION_HANDLER`, so this app keeps its error envelope without
    depending on a global another app set.
    """

    def get_exception_handler(self):
        return api_exception_handler


class RegisterView(AccountsAPIView):
    """
    Create an account and sign in with it.

    Registering signs you in: a traveller who has just filled in the form to
    reach a booking should not have to fill in a second one.
    """

    def post(self, request):
        payload = RegisterSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        # Checked before the insert for the sake of a useful message, and
        # again by the unique keys below, which is what actually decides.
        clash = AppUser.objects.filter(
            Q(email__iexact=data['email']) | Q(phone=data['phone'])
        ).first()
        if clash is not None:
            raise AccountExists(
                'An account already exists with that email or mobile number. '
                'Try signing in instead.',
                detail={
                    'field': 'email'
                    if clash.email.lower() == data['email'] else 'phone',
                },
            )

        try:
            with transaction.atomic():
                user = AppUser.objects.create(
                    full_name=data['fullName'].strip(),
                    email=data['email'],
                    phone=data['phone'],
                    # Django's hasher, not the password. `check_password`
                    # reads it back.
                    password_hash=make_password(data['password']),
                    is_active=True,
                    last_login_at=timezone.now(),
                )
        except IntegrityError:
            # Two sign-ups for the same email raced; the unique key won.
            raise AccountExists()

        return Response(
            serialise_session(user, issue_token(user), token_lifetime_seconds()),
            status=status.HTTP_201_CREATED,
        )


class LoginView(AccountsAPIView):
    """
    Sign in with an email or a mobile number.

    Answers 404 `account_not_found` when nothing is registered under the
    identifier, and 401 `invalid_credentials` when the password is wrong, so
    the sign-in box can offer sign-up instead of a pointless retry.
    """

    def post(self, request):
        payload = LoginSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        identifier = data['identifier']

        user = AppUser.objects.filter(
            Q(email__iexact=identifier) | Q(phone=identifier)
        ).first()

        # Two different answers on purpose: someone with no account is told to
        # sign up, where a wrong password is told the password is wrong. It is
        # the difference between a dead end and a retry for a traveller who
        # has simply never registered.
        #
        # This is why the constant-time dummy hash that used to sit here is
        # gone. It existed only to hide which emails were registered, and the
        # reply below now says so outright - see AccountNotFound for what that
        # costs and what to do about it.
        if user is None:
            raise AccountNotFound()

        if not check_password(data['password'], user.password_hash):
            raise InvalidCredentials()

        if not user.is_active:
            raise InvalidCredentials('That account has been deactivated.')

        user.last_login_at = timezone.now()
        user.save(update_fields=['last_login_at'])

        return Response(
            serialise_session(user, issue_token(user), token_lifetime_seconds())
        )


class MeView(AccountsAPIView):
    """
    The account a token belongs to.

    The front end calls this on load to turn a stored token back into a signed
    -in session, and gets a 401 if the token has expired - which is the signal
    to clear it and show the sign-in.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(serialise_user(request.user))


class MyBookingsView(AccountsAPIView):
    """
    Every ticket this account holds, newest booking first.

    One endpoint rather than five, and it lives here rather than in the travel
    modules for two reasons. The page wants a single list sorted across all of
    them, which five separate calls cannot produce without the client doing the
    merge; and `bookings/<reference>/` in each module would shadow any
    `bookings/mine/` added beside it.

    This is the one place the dependency runs accounts -> modules. It stays
    safe because it imports their *services*, never their models or views, and
    nothing in those modules imports back from here at module scope. Each
    module keeps deciding what a summary of its own booking looks like.

    Ordering is done in Python, not the database: the five querysets are
    separate, and a UNION across them would have to be written against the
    shared `booking` table, reaching past the services that own it.
    """

    permission_classes = [IsAuthenticated]

    #: Each module's (list, serialise) pair. Import inside the module body
    #: rather than at the top of the file so the travel apps are only pulled
    #: in when this view is actually built.
    def _sources(self):
        from bus import serializers as bus_serializers, services as bus_services
        from cab import serializers as cab_serializers, services as cab_services
        from hotel import (
            serializers as hotel_serializers, services as hotel_services,
        )
        from plane import (
            serializers as plane_serializers, services as plane_services,
        )
        from train import (
            serializers as train_serializers, services as train_services,
        )

        return (
            (bus_services, bus_serializers),
            (train_services, train_serializers),
            (plane_services, plane_serializers),
            (hotel_services, hotel_serializers),
            (cab_services, cab_serializers),
        )

    def get(self, request):
        bookings = [
            serializers.serialise_booking_summary(row)
            for services, serializers in self._sources()
            for row in services.list_bookings(request.user.pk)
        ]

        # `bookedAt` is ISO 8601 with a fixed offset, so a string sort is a
        # chronological one.
        bookings.sort(key=lambda entry: entry['bookedAt'], reverse=True)

        return Response({'bookings': bookings})


class CancelBookingView(AccountsAPIView):
    """
    Cancel one ticket this account holds.

    POST rather than DELETE: the booking is not removed. It keeps its row, its
    reference and its passengers, and moves to `cancelled` - a traveller still
    has to be able to show what they booked and what was refunded.

    The work itself belongs to the travel module that sold the ticket, because
    only it knows what to give back: a bus deletes its seat rows, a train
    restores its availability, a stay returns its room nights. This view finds
    the right module and hands over, exactly as the list above does.
    """

    permission_classes = [IsAuthenticated]

    def _service(self, mode):
        """The module that owns `mode`, imported only when it is asked for."""
        if mode == 'bus':
            from bus import services
            return services
        if mode == 'train':
            from train import services
            return services
        if mode == 'plane':
            from plane import services
            return services
        if mode == 'hotel':
            from hotel import services
            return services
        if mode == 'cab':
            from cab import services
            return services

        raise UnknownBookingMode(
            f'There is nothing booked under "{mode}".',
            detail={'mode': mode},
        )

    def post(self, request, mode, reference):
        services = self._service(mode)
        row = services.cancel_booking(request.user.pk, reference)

        # The same summary shape the list returns, so the page can swap the
        # row it holds for this one rather than refetching everything.
        from importlib import import_module
        serialisers = import_module(f'{mode}.serializers')

        return Response({
            'booking': serialisers.serialise_booking_summary(row),
            'refundAmount': str(row.booking.total_amount),
            'currency': row.booking.currency,
        })
