"""
Tests for the contact form.

The mail backend under test is Django's locmem one, so nothing leaves the
machine and `mail.outbox` is what a message turned into.
"""
import json

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse

from contact.views import ContactThrottle, ContactView

VALID = {
    'name': 'Asha Menon',
    'email': 'demo@gmail.com',
    'phone': '9876543210',
    'topic': 'Booking help',
    'message': 'My bus was cancelled and I would like to know about the refund.',
}


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    CONTACT_INBOX='demo@gmail.com',
    DEFAULT_FROM_EMAIL='demo@gmail.com',
)
class ContactFormTests(TestCase):
    """Everything but the rate limit, which has its own class below."""

    def send(self, **overrides):
        payload = {**VALID, **overrides}
        return self.client.post(
            reverse('contact:send'),
            data=json.dumps(payload),
            content_type='application/json',
        )

    def setUp(self):
        mail.outbox = []

        # The throttle counts every request, valid or not, so a class of
        # tests would trip it on its own. It is switched off here and
        # exercised deliberately in ContactThrottleTests.
        original = ContactView.throttle_classes
        ContactView.throttle_classes = []
        self.addCleanup(setattr, ContactView, 'throttle_classes', original)

    def test_a_message_is_mailed_to_the_support_inbox(self):
        response = self.send()

        self.assertEqual(response.status_code, 202)
        self.assertIs(response.json()['sent'], True)

        (sent,) = mail.outbox
        self.assertEqual(sent.to, ['demo@gmail.com'])
        # Our own mailbox sends it; hitting reply answers the traveller.
        self.assertEqual(sent.from_email, 'demo@gmail.com')
        self.assertEqual(sent.reply_to, ['demo@gmail.com'])
        self.assertIn('Booking help', sent.subject)
        self.assertIn('Asha Menon', sent.subject)
        self.assertIn('My bus was cancelled', sent.body)
        self.assertIn('9876543210', sent.body)

    def test_a_message_without_a_phone_is_accepted(self):
        self.assertEqual(self.send(phone='').status_code, 202)
        self.assertIn('not given', mail.outbox[0].body)

    def test_a_bad_email_is_refused(self):
        response = self.send(email='not-an-address')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_message')
        self.assertEqual(mail.outbox, [])

    def test_a_bad_phone_is_refused(self):
        response = self.send(phone='12345')

        self.assertEqual(response.status_code, 400)
        self.assertIn('phone', response.json()['error']['detail'])
        self.assertEqual(mail.outbox, [])

    def test_a_one_word_message_is_refused(self):
        response = self.send(message='help')

        self.assertEqual(response.status_code, 400)
        self.assertIn('message', response.json()['error']['detail'])
        self.assertEqual(mail.outbox, [])

    def test_an_unknown_topic_is_refused(self):
        self.assertEqual(self.send(topic='Anything else').status_code, 400)
        self.assertEqual(mail.outbox, [])

    def test_the_honeypot_swallows_a_bot_without_sending_mail(self):
        response = self.send(website='http://spam.example')

        # Answered like a success on purpose: an error would only teach the
        # bot to leave the field alone next time.
        self.assertEqual(response.status_code, 202)
        self.assertEqual(mail.outbox, [])

    def test_sending_does_not_need_an_account(self):
        # No Authorization header anywhere above; state it outright, because
        # someone who cannot sign in is who most needs this form.
        self.assertEqual(self.send().status_code, 202)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class ContactThrottleTests(TestCase):
    def setUp(self):
        mail.outbox = []

        # Counts live in the cache, which outlives a single test.
        cache.clear()
        self.addCleanup(cache.clear)

        # Set on the class rather than through REST_FRAMEWORK: the throttle
        # reads `self.rate` first, and this needs no settings reload.
        ContactThrottle.rate = '2/hour'
        self.addCleanup(delattr, ContactThrottle, 'rate')

    def send(self):
        return self.client.post(
            reverse('contact:send'),
            data=json.dumps(VALID),
            content_type='application/json',
        )

    def test_a_flood_from_one_address_is_cut_off(self):
        self.assertEqual(self.send().status_code, 202)
        self.assertEqual(self.send().status_code, 202)

        third = self.send()
        self.assertEqual(third.status_code, 429)
        self.assertEqual(len(mail.outbox), 2)
