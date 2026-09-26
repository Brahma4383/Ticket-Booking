"""
Errors the payment endpoints raise, and the handler that turns them into JSON.

Same envelope as every other module, so a caller reads `error.code` without
caring which part of the API answered:

    {"error": {"code": "payment_declined", "message": "...", "detail": {...}}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class PaymentsAPIError(APIException):
    """Base for the payments module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'payments_error'
    default_detail = 'The request could not be completed.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class BookingNotFound(PaymentsAPIError):
    """
    No booking of that mode and reference belongs to this account.

    The same answer whether the reference does not exist or belongs to
    someone else, so a signed-in account cannot discover other people's
    references by trying them.
    """

    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'booking_not_found'
    default_detail = 'No booking was found for that reference.'


class TransactionNotFound(PaymentsAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'transaction_not_found'
    default_detail = 'No transaction was found for that reference.'


class UnknownBookingMode(PaymentsAPIError):
    """The URL named something this app does not book."""

    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'unknown_booking_mode'
    default_detail = 'That is not a kind of booking this app makes.'


class InvalidPaymentDetails(PaymentsAPIError):
    """The instrument is malformed: a UPI ID with no handle, a card that
    fails its check digit. `detail` names the field."""

    default_code = 'invalid_payment_details'
    default_detail = 'Those payment details are not valid.'


class PaymentDeclined(PaymentsAPIError):
    """
    The gateway refused the payment.

    402 rather than 400: the request was well formed and the booking is still
    held, it is the money that did not arrive. The failed attempt is on record
    and `detail.transactionRef` names it; the traveller can try again with the
    same or another method until the hold runs out.
    """

    status_code = status.HTTP_402_PAYMENT_REQUIRED
    default_code = 'payment_declined'
    default_detail = 'The payment was declined. Try another way to pay.'


class PaymentExpired(PaymentsAPIError):
    """
    The hold on the booking ran out before it was paid for.

    The inventory it held has been released and the booking is now `failed`.
    Starting again from the search is the only way forward.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'payment_expired'
    default_detail = (
        'The time to pay for this booking has run out and it has been '
        'released. Please book again.'
    )


class PaymentNotAllowed(PaymentsAPIError):
    """A booking that is cancelled, failed or completed cannot be paid for."""

    status_code = status.HTTP_409_CONFLICT
    default_code = 'payment_not_allowed'
    default_detail = 'That booking is not waiting for a payment.'


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

    if isinstance(exc, PaymentsAPIError):
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
