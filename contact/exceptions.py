"""
Errors the contact endpoint raises, in the same envelope as every other app:

    {"error": {"code": "message_not_sent", "message": "..."}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class ContactAPIError(APIException):
    """Base for the contact module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'contact_error'
    default_detail = 'The message could not be sent.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class MessageNotSent(ContactAPIError):
    """
    The mail server refused the message or could not be reached.

    502 rather than 500: this server did its part, the one it hands mail to
    did not. The sender is told to use the phone number instead, which is the
    only thing that helps them.
    """

    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = 'message_not_sent'
    default_detail = (
        'Your message could not be sent just now. Please call the support '
        'number instead, or try again in a few minutes.'
    )


def api_exception_handler(exc, context):
    """Wraps DRF's handler so every error body has the same envelope."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ContactAPIError):
        body = {'code': exc.default_code, 'message': exc.message}
        if exc.extra:
            body['detail'] = exc.extra
        response.data = {'error': body}
        return response

    detail = response.data
    code = getattr(exc, 'default_code', 'error')

    if isinstance(detail, dict) and 'detail' in detail:
        message = str(detail['detail'])
        body = {'code': code, 'message': message}
    elif isinstance(detail, dict):
        # A serializer's field errors: the first one is the message, the whole
        # map goes in `detail` so the form can mark the field.
        first = next(iter(detail.values()), ['That request was not valid.'])
        message = str(first[0]) if isinstance(first, list) else str(first)
        body = {'code': 'invalid_message', 'message': message, 'detail': detail}
    else:
        body = {'code': code, 'message': str(detail)}

    response.data = {'error': body}
    return response
