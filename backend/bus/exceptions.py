"""
Errors the bus endpoints raise, and the handler that turns them into JSON.

Every failure reaches the front end in one shape, so a caller can read
`error.code` without checking which endpoint it came from:

    {"error": {"code": "seat_unavailable", "message": "...", "detail": {...}}}
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.exceptions import APIException


class BusAPIError(APIException):
    """Base for the bus module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'bus_error'
    default_detail = 'The request could not be completed.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class TripNotFound(BusAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'trip_not_found'
    default_detail = 'That bus service is no longer available.'


class BookingNotFound(BusAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'booking_not_found'
    default_detail = 'No booking was found for that reference.'


class InvalidSeatSelection(BusAPIError):
    default_code = 'invalid_seat_selection'
    default_detail = 'Those seats are not valid for this bus.'


class SeatUnavailable(BusAPIError):
    """
    Someone else took a seat first. 409 rather than 400: the request was
    well formed, the inventory moved underneath it.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'seat_unavailable'
    default_detail = 'One or more of those seats has just been booked.'


def api_exception_handler(exc, context):
    """
    Wraps DRF's handler so every error body has the same envelope.

    DRF's own output differs by exception - a dict of field errors for
    validation, `{"detail": "..."}` for the rest. Both are folded into
    `error.detail` here so the front end has one path to read.
    """
    response = drf_exception_handler(exc, context)
    if response is None:
        # Not a DRF exception: let Django's own 500 handling deal with it,
        # so the traceback still reaches the logs rather than being swallowed.
        return None

    if isinstance(exc, BusAPIError):
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
