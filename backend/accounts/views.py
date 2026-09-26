"""
HTTP layer for the accounts module.

    POST /api/auth/register/    create an account and sign in
    POST /api/auth/login/       sign in
    GET  /api/auth/me/          who the token belongs to
    GET  /api/auth/me/bookings/ every ticket this account holds
    POST /api/auth/me/bookings/<mode>/<reference>/cancel/  cancel one
    POST /api/auth/password/forgot/        email a reset link
    POST /api/auth/password/reset/check/   is this reset link still good?
    POST /api/auth/password/reset/         choose a new password, and sign in

There is no logout endpoint. The token is signed rather than stored, so
there is nothing on the server to delete - signing out is the client dropping
it. What the server *can* do is invalidate every token an account holds, and
that happens when its password changes.
"""
import hashlib
import math

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from accounts.authentication import issue_token, token_lifetime_seconds
from accounts.cancellation import refund_total
from accounts.exceptions import (
    AccountExists,
    AccountNotFound,
    InvalidCredentials,
    InvalidResetLink,
    TooManyResetRequests,
    UnknownBookingMode,
    api_exception_handler,
)
from accounts.models import AppUser
from accounts.password_reset import (
    find_account,
    first_name,
    link_lifetime_minutes,
    mask_email,
    reset_tokens,
    send_password_changed_email,
    send_reset_email,
    user_for_link,
)
from accounts.serializers import (
    ForgotPasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    ResetLinkSerializer,
    ResetPasswordSerializer,
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
        # A booking is `pending` from the moment its inventory is held until
        # it is paid for. Close any of this account's whose payment window
        # has run out first, so the list never shows a hold that is already
        # gone. Imported here for the same reason `_sources` imports lazily.
        from payments.services import expire_stale
        expire_stale(request.user.pk)

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
            # What was actually paid, which is not always the total: a cab
            # took only its advance, and an unpaid booking took nothing.
            'refundAmount': str(refund_total(row.booking)),
            'currency': row.booking.currency,
        })


# ---------------------------------------------------------------------------
# Forgotten passwords
#
# Three calls, one per screen: the request form in the sign-in dialog, the
# reset page checking its link as it opens, and that page's form. How the link
# is made and why it needs no table is in accounts/password_reset.py.
# ---------------------------------------------------------------------------

class _ResetThrottle(SimpleRateThrottle):
    """
    Counted per client address whether or not a token was sent.

    DRF's AnonRateThrottle skips signed-in requests; a reset is something a
    signed-out traveller does, but nothing stops a script from sending a
    token along to slip past it.
    """

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope, 'ident': self.get_ident(request),
        }


class PasswordResetThrottle(_ResetThrottle):
    """Reset mails one address may ask for: `PASSWORD_RESET_RATE_LIMIT`."""

    scope = 'password_reset'


class PasswordResetTargetThrottle(SimpleRateThrottle):
    """
    Reset mails one account may be sent, whoever asks.

    The per-address limit alone would let a handful of machines fill a
    stranger's inbox. Keyed on a hash of the identifier, so the cache never
    holds the email address or phone number itself.
    """

    scope = 'password_reset_target'

    def get_cache_key(self, request, view):
        raw = str(request.data.get('identifier', '')).strip().lower()
        if not raw:
            return None
        if '@' not in raw:
            raw = ''.join(ch for ch in raw if ch.isdigit())[-10:]
        digest = hashlib.sha256(raw.encode()).hexdigest()
        return self.cache_format % {'scope': self.scope, 'ident': digest}


class PasswordResetConfirmThrottle(_ResetThrottle):
    """Link checks and new passwords one address may submit."""

    scope = 'password_reset_confirm'


class ResetAPIView(AccountsAPIView):
    """Base for the three reset views: open to anyone, rate limited."""

    def throttled(self, request, wait):
        minutes = max(1, math.ceil((wait or 60) / 60))
        raise TooManyResetRequests(
            'Too many attempts from here. Please try again in '
            f'{minutes} minute{"s" if minutes != 1 else ""}.',
            detail={'retryAfterSeconds': math.ceil(wait or 60)},
        )


class ForgotPasswordView(ResetAPIView):
    """
    Email a reset link to the account behind an email or mobile number.

    Answers **202 with the same body whether or not an account exists**, and
    sends nothing when none does. The sign-in box does say "no account with
    those details" - see AccountNotFound for that trade - but a reset request
    is the classic place to probe for addresses, so this one does not add a
    second way in. A mobile number finds the account and the link goes to the
    email on it: there is no SMS gateway.

    A mail server failure is logged and answered the same way too, for the
    same reason - see `password_reset._send`.
    """

    throttle_classes = [PasswordResetThrottle, PasswordResetTargetThrottle]

    def post(self, request):
        payload = ForgotPasswordSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        user = find_account(payload.validated_data['identifier'])
        if user is not None:
            send_reset_email(user)

        return Response(
            {'sent': True, 'expiresInMinutes': link_lifetime_minutes()},
            status=status.HTTP_202_ACCEPTED,
        )


class ResetPasswordCheckView(ResetAPIView):
    """
    Whether a reset link can still be used, asked as the reset page opens.

    So a traveller with an old link is told before they have typed a new
    password twice, not after. Answers with a masked email - enough to tell
    which account it is, since someone holding the link has the inbox anyway.
    """

    throttle_classes = [PasswordResetConfirmThrottle]

    def post(self, request):
        payload = ResetLinkSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        user = user_for_link(data['uid'], data['token'])
        if user is None:
            raise InvalidResetLink()

        return Response({
            'valid': True,
            'email': mask_email(user.email),
            'firstName': first_name(user),
        })


class ResetPasswordView(ResetAPIView):
    """
    Set a new password from a reset link, and sign in with it.

    Signing in is the point of the exercise - the traveller was on their way
    somewhere when they found they could not - and holding the link already
    proves as much as a password would. The new hash retires the link and
    every token issued before it, so each other device is signed out.

    The link is checked a second time under a row lock, so two tabs submitting
    the same link cannot both succeed.
    """

    throttle_classes = [PasswordResetConfirmThrottle]

    def post(self, request):
        payload = ResetPasswordSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        user = user_for_link(data['uid'], data['token'])
        if user is None:
            raise InvalidResetLink()

        # Django's own validators, now that the account is known - including
        # the one that refuses a password too close to the email address.
        try:
            validate_password(data['password'], user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)})

        if check_password(data['password'], user.password_hash):
            raise serializers.ValidationError({
                'password': ['That is your current password. Choose a new one.'],
            })

        with transaction.atomic():
            user = AppUser.objects.select_for_update().get(pk=user.pk)
            if not reset_tokens.check_token(user, data['token']):
                raise InvalidResetLink()

            user.password_hash = make_password(data['password'])
            user.last_login_at = timezone.now()
            user.save(update_fields=['password_hash', 'last_login_at'])

        send_password_changed_email(user)

        return Response(
            serialise_session(user, issue_token(user), token_lifetime_seconds())
        )
