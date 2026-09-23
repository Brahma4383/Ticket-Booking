"""
Errors the train endpoints raise, and the handler that turns them into JSON.

Same envelope as every other module, so a caller can read `error.code`
without checking which endpoint it came from:

    {"error": {"code": "class_unavailable", "message": "...", "detail": {...}}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class TrainAPIError(APIException):
    """Base for the train module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'train_error'
    default_detail = 'The request could not be completed.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class TrainNotFound(TrainAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'train_not_found'
    default_detail = 'That train is no longer available.'


class BookingNotFound(TrainAPIError):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = 'booking_not_found'
    default_detail = 'No booking was found for that PNR.'


class InvalidSelection(TrainAPIError):
    """A class, quota, boarding station or date that does not fit the train."""

    default_code = 'invalid_selection'
    default_detail = 'That selection is not valid for this train.'


class ClassUnavailable(TrainAPIError):
    """
    The class closed, or no longer holds enough seats. 409 rather than 400:
    the request was well formed, the availability moved underneath it.
    """

    status_code = status.HTTP_409_CONFLICT
    default_code = 'class_unavailable'
    default_detail = 'That class is no longer available for this journey.'


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

    if isinstance(exc, TrainAPIError):
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
