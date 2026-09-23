"""
Errors the cab endpoints raise, and the handler that turns them into JSON.

Same envelope as every other module, so a caller can read `error.code` without
checking which endpoint it came from:

    {"error": {"code": "no_rate_card", "message": "...", "detail": {...}}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class CabAPIError(APIException):
    """Base for the cab module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'cab_error'
    default_detail = 'The request could not be completed.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class CategoryNotFound(CabAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'category_not_found'
    default_detail = 'That cab type is not available.'


class BookingNotFound(CabAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'booking_not_found'
    default_detail = 'No booking was found for that id.'


class InvalidSelection(CabAPIError):
    """An extra, trip time or address that does not make a bookable trip."""

    default_code = 'invalid_selection'
    default_detail = 'That selection is not valid for this trip.'


class NoRateCard(CabAPIError):
    """
    Nothing priced for this category and journey on this date.

    409 rather than 404: the cab type exists and the route is fine, but there
    is no card in force to quote from - an operational gap, not a bad request.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'no_rate_card'
    default_detail = 'That cab is not priced for this journey on that date.'


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

    if isinstance(exc, CabAPIError):
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
