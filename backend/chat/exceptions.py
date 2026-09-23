"""
Errors the chat endpoint raises, in the same envelope as every other app:

    {"error": {"code": "assistant_unavailable", "message": "..."}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class ChatAPIError(APIException):
    """Base for the chat module's own failures."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'chat_error'
    default_detail = 'That message could not be answered.'

    def __init__(self, message=None, detail=None):
        super().__init__(message or self.default_detail)
        self.message = message or self.default_detail
        self.extra = detail or {}


class AssistantUnavailable(ChatAPIError):
    """
    The AI half was configured but the call to it failed.

    Raised only when there is nothing scripted to fall back on, which makes it
    rare: an unanswerable question with no key configured is not an error, it
    is the scripted bot saying what it can do. 502 rather than 500 for the
    same reason the contact form uses it - this server did its part.
    """

    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = 'assistant_unavailable'
    default_detail = (
        'The assistant is not answering just now. Please call the support '
        'number, or try again in a few minutes.'
    )


def api_exception_handler(exc, context):
    """Wraps DRF's handler so every error body has the same envelope."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ChatAPIError):
        body = {'code': exc.default_code, 'message': exc.message}
        if exc.extra:
            body['detail'] = exc.extra
        response.data = {'error': body}
        return response

    detail = response.data
    code = getattr(exc, 'default_code', 'error')

    if isinstance(detail, dict) and 'detail' in detail:
        body = {'code': code, 'message': str(detail['detail'])}
    elif isinstance(detail, dict):
        first = next(iter(detail.values()), ['That request was not valid.'])
        message = str(first[0]) if isinstance(first, list) else str(first)
        body = {'code': 'invalid_message', 'message': message, 'detail': detail}
    else:
        body = {'code': code, 'message': str(detail)}

    response.data = {'error': body}
    return response
