"""
Errors the accounts endpoints raise, and the handler that turns them into JSON.

Same envelope as every other module, so a caller can read `error.code` without
caring which part of the API answered:

    {"error": {"code": "invalid_credentials", "message": "..."}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class AccountsAPIError(APIException):
    """Base for the accounts module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'accounts_error'
    default_detail = 'The request could not be completed.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class InvalidCredentials(AccountsAPIError):
    """
    The account is real and the password is wrong, or it is deactivated.

    An email or mobile nobody has registered raises AccountNotFound instead,
    so the sign-in box can offer sign-up rather than another try at a password
    that was never set.
    """

    status_code = status.HTTP_401_UNAUTHORIZED
    default_code = 'invalid_credentials'
    default_detail = 'That password is not right. Please try again.'


class AccountNotFound(AccountsAPIError):
    """
    Nothing is registered under that email or mobile number.

    Split out from InvalidCredentials on purpose: someone who never signed up
    should be told to sign up, not left retyping a password they never set.

    The trade is deliberate and worth stating plainly - this reply confirms
    which emails and mobile numbers hold an account, which is what account
    enumeration is. Everything under /api/auth/ is unthrottled today, so a
    script can walk a list of addresses through it and keep the hits. If that
    matters later, rate-limit this endpoint rather than blurring the message
    back into InvalidCredentials.
    """

    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'account_not_found'
    default_detail = (
        'No account is registered with those details. Please sign up first, '
        'then log in.'
    )


class AccountExists(AccountsAPIError):
    """
    The email or phone is already registered.

    409 rather than 400: the request was well formed, it collided with
    something already there.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'account_exists'
    default_detail = 'An account already exists with those details.'


class BookingNotFound(AccountsAPIError):
    """
    No booking of that mode and reference belongs to this account.

    Deliberately the same answer whether the reference does not exist at all
    or belongs to somebody else: telling the two apart would let a signed-in
    account discover other people's references by trying them.
    """

    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'booking_not_found'
    default_detail = 'No booking was found for that reference.'


class CancellationNotAllowed(AccountsAPIError):
    """
    The booking is real but cannot be cancelled: already cancelled, already
    completed, or the journey is in the past.

    409 rather than 400 - the request was well formed, the booking's state is
    what refuses it.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'cancellation_not_allowed'
    default_detail = 'That booking can no longer be cancelled.'


class InvalidResetLink(AccountsAPIError):
    """
    A password reset link that cannot be used: expired, already used, for a
    deactivated account, or never issued by us.

    One answer for all of them, deliberately. Whichever it was, the way on is
    the same - ask for a new link - and naming the reason would only help
    somebody forging them.
    """

    default_code = 'invalid_reset_link'
    default_detail = (
        'This reset link has expired or has already been used. Ask for a new '
        'one from the sign-in screen.'
    )


class TooManyResetRequests(AccountsAPIError):
    """
    The reset endpoints' own rate limit, in words a traveller can act on.

    DRF's stock 429 reads "Expected available in 3412 seconds"; this says
    minutes, and carries the wait in `detail.retryAfterSeconds` for a client
    that wants to count down.
    """

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = 'too_many_requests'
    default_detail = 'Too many attempts. Please wait a while and try again.'


class UnknownBookingMode(AccountsAPIError):
    """The URL named something this app does not book."""

    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'unknown_booking_mode'
    default_detail = 'That is not a kind of booking this app makes.'


def api_exception_handler(exc, context):
    """
    Wraps DRF's handler so every error body has the same envelope.

    DRF's own output differs by exception - a dict of field errors for
    validation, `{"detail": "..."}` for the rest. Both are folded into
    `error.detail` here so the front end has one path to read.
    """
    response = drf_exception_handler(exc, context)
    if response is None:
        # Not a DRF exception: let Django's own 500 handling deal with it, so
        # the traceback still reaches the logs rather than being swallowed.
        return None

    if isinstance(exc, AccountsAPIError):
        body = {'code': exc.default_code, 'message': exc.message}
        if exc.extra:
            body['detail'] = exc.extra
    else:
        data = response.data
        message = data.get('detail') if isinstance(data, dict) else None
        body = {
            'code': getattr(exc, 'default_code', 'error'),
            'message': str(message) if message else 'The request was rejected.',
        }
        # Field-level validation errors: keep them, the form needs them.
        if isinstance(data, dict) and 'detail' not in data:
            body['detail'] = data

    response.data = {'error': body}
    return response
