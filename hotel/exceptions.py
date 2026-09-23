"""
Errors the hotel endpoints raise, and the handler that turns them into JSON.

Same envelope as every other module, so a caller can read `error.code` without
checking which endpoint it came from:

    {"error": {"code": "rooms_unavailable", "message": "...", "detail": {...}}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class HotelAPIError(APIException):
    """Base for the hotel module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'hotel_error'
    default_detail = 'The request could not be completed.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class PropertyNotFound(HotelAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'property_not_found'
    default_detail = 'That stay is no longer available.'


class BookingNotFound(HotelAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'booking_not_found'
    default_detail = 'No booking was found for that id.'


class InvalidSelection(HotelAPIError):
    """A room, rate plan or date range that does not fit the property."""

    default_code = 'invalid_selection'
    default_detail = 'That selection is not valid for this stay.'


class RoomsUnavailable(HotelAPIError):
    """
    The rooms went, or there were never enough for the whole stay. 409 rather
    than 400: the request was well formed, the inventory moved underneath it.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'rooms_unavailable'
    default_detail = 'That room is no longer available for those dates.'


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

    if isinstance(exc, HotelAPIError):
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
