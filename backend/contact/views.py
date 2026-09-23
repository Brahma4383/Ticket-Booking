"""
HTTP layer for the contact form.

    POST /api/contact/   send a message to the support inbox

One endpoint, no models, no table. The message is validated, turned into
mail and handed to the mail server; what is left on this machine afterwards is
a line in the log, nothing else.
"""
import logging

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from contact.exceptions import MessageNotSent, api_exception_handler
from contact.serializers import ContactMessageSerializer, render_message

logger = logging.getLogger(__name__)


class ContactThrottle(AnonRateThrottle):
    """
    Per IP address, at the rate `CONTACT_RATE_LIMIT` sets.

    This is the only open endpoint that makes the server send mail, so it is
    the one worth limiting: without it a single script can empty a day's SMTP
    quota in a minute.
    """

    scope = 'contact'


def client_ip(request):
    """
    The caller's address, trusting `X-Forwarded-For` only for its first entry.

    Behind a proxy, that first entry is the client; everything after it is the
    chain of proxies. With no proxy in front, `REMOTE_ADDR` is the whole
    truth.
    """
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


class ContactView(APIView):
    """
    Take a message from the website and mail it to the support inbox.

    Open to anyone: somebody who cannot sign in is exactly who most needs to
    reach support.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ContactThrottle]

    def get_exception_handler(self):
        return api_exception_handler

    def post(self, request):
        payload = ContactMessageSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        # The honeypot was filled in, so this is a bot. Answered exactly like
        # a success, because telling it otherwise only teaches it to try
        # again without the field.
        if data.get('website'):
            logger.info('Contact form honeypot tripped from %s', client_ip(request))
            return Response(
                {'sent': True, 'inbox': settings.CONTACT_INBOX},
                status=status.HTTP_202_ACCEPTED,
            )

        body = render_message(
            data, received_at=timezone.localtime(), source_ip=client_ip(request),
        )

        mail = EmailMessage(
            subject=f"[{data['topic']}] {data['name']} via suryabooker.in",
            body=body,
            # The sender is our own mailbox, not the person who wrote: most
            # providers reject a From: they did not authenticate. Reply-To is
            # what makes hitting reply answer the traveller.
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[settings.CONTACT_INBOX],
            reply_to=[data['email']],
        )

        try:
            mail.send(fail_silently=False)
        except Exception:
            # The address is logged, the message body is not: it is the
            # traveller's, and a log is the wrong place for it.
            logger.exception('Contact message from %s could not be sent', data['email'])
            raise MessageNotSent()

        return Response(
            {'sent': True, 'inbox': settings.CONTACT_INBOX},
            status=status.HTTP_202_ACCEPTED,
        )
