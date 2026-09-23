"""
HTTP layer for the support assistant.

    POST /api/chat/   ask a question, get an answer

One endpoint, no models, no table. A message is matched against the scripted
intents first and handed to Claude only when nothing fits; the conversation
itself is never stored — the browser sends its own history back each time.

Open to anyone, like the contact form: somebody who cannot sign in is exactly
who most needs to ask a question. Signing in only changes what can be answered,
never whether the assistant responds.
"""
import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from chat import assistant, knowledge
from chat.exceptions import api_exception_handler
from chat.serializers import ChatRequestSerializer

logger = logging.getLogger(__name__)


class ChatThrottle(AnonRateThrottle):
    """
    Per IP address, at the rate `CHAT_RATE_LIMIT` sets.

    Worth limiting for the same reason the contact form is, only more so: a
    message that falls through to the model costs real money, and a script
    that discovers this endpoint can spend it a lot faster than a person can
    type.
    """

    scope = 'chat'


class Context:
    """
    Who is asking, and what can be looked up about them.

    The bookings are fetched lazily and cached for the request: most intents
    never need them, and the ones that do often need them twice.
    """

    def __init__(self, request):
        self.request = request
        self.signed_in = bool(request.user and request.user.is_authenticated)
        self._bookings = None

    @property
    def first_name(self):
        if not self.signed_in:
            return ''
        full = (getattr(self.request.user, 'full_name', '') or '').strip()
        return full.split(' ')[0] if full else ''

    def bookings(self):
        """
        Every ticket this account holds, in the account page's own shape.

        Goes through each travel module's services exactly as
        `accounts.MyBookingsView` does — same dependency direction, same
        reason. Imported inside the method so a chat that never asks about a
        booking never pulls the travel apps in.
        """
        if self._bookings is not None:
            return self._bookings

        if not self.signed_in:
            self._bookings = []
            return self._bookings

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

        sources = (
            (bus_services, bus_serializers),
            (train_services, train_serializers),
            (plane_services, plane_serializers),
            (hotel_services, hotel_serializers),
            (cab_services, cab_serializers),
        )

        try:
            rows = [
                serializers.serialise_booking_summary(row)
                for services, serializers in sources
                for row in services.list_bookings(self.request.user.pk)
            ]
        except Exception:
            # A chat that cannot read the bookings still answers; it just
            # answers the general version of the question.
            logger.exception('The assistant could not read the account bookings')
            rows = []

        rows.sort(key=lambda entry: entry['bookedAt'], reverse=True)
        self._bookings = rows
        return rows


class ChatView(APIView):
    """
    Answer one message.

    The order is the whole point: script first, model second, honest fallback
    third. It keeps the common questions instant and free, and leaves the
    model for the sentences nobody anticipated.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ChatThrottle]

    def get_exception_handler(self):
        return api_exception_handler

    def get(self, request):
        """
        What this assistant can do, for the widget's opening message.

        `ai` is reported so the greeting can be honest about it: with the
        model off, the bot is a menu, and inviting free-text questions it
        cannot parse only wastes the traveller's time.
        """
        context = Context(request)
        greeting = knowledge.match('hello', context)[0]

        return Response({
            'ai': assistant.available(),
            'signedIn': context.signed_in,
            **greeting.as_dict(),
        })

    def post(self, request):
        payload = ChatRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        context = Context(request)
        message = data['message']

        scripted, intent_id = knowledge.match(message, context)
        if scripted is not None:
            return Response(
                {'source': 'scripted', 'intent': intent_id, **scripted.as_dict()},
                status=status.HTTP_200_OK,
            )

        if assistant.available():
            reply = assistant.answer(message, data['history'], context)
            if reply:
                return Response(
                    {
                        'source': 'ai',
                        'intent': '',
                        'reply': reply,
                        'quickReplies': list(knowledge.GREETING_REPLIES),
                        'action': None,
                    },
                    status=status.HTTP_200_OK,
                )
            fallback = knowledge.nothing_matched(context, ai_tried=True)
        else:
            fallback = knowledge.nothing_matched(context, ai_tried=False)

        return Response(
            {'source': 'fallback', 'intent': '', **fallback.as_dict()},
            status=status.HTTP_200_OK,
        )
