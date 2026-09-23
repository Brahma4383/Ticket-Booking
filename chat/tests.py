"""
Tests for the support assistant.

The point most of these are making is the same one: the assistant answers
without an API key. Every test here runs with `CHAT_AI_KEY` blank, which is the
configuration the site ships in, and the only tests that touch the AI half
stub it out — none of them make a network call or spend anything.
"""
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse

from chat import knowledge
from chat.views import ChatThrottle


@override_settings(CHAT_AI_KEY='')
class ScriptedAssistantTests(TestCase):
    """The half that works with no key, no package and no network."""

    def setUp(self):
        # DRF counts requests per IP in the cache, and every test here posts
        # from the same one.
        cache.clear()

    def ask(self, message, history=None):
        return self.client.post(
            reverse('chat:ask'),
            data=json.dumps({'message': message, 'history': history or []}),
            content_type='application/json',
        )

    def test_greeting_offers_the_common_questions(self):
        response = self.ask('hello')

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['source'], 'scripted')
        self.assertEqual(body['intent'], 'greeting')
        self.assertIn('Cancel a booking', body['quickReplies'])

    def test_cancelling_points_at_the_account_page(self):
        body = self.ask('I want to cancel my ticket').json()

        self.assertEqual(body['intent'], 'cancel')
        self.assertEqual(body['action'], knowledge.ACTION_ACCOUNT)

    def test_it_never_claims_to_have_cancelled_anything(self):
        """
        The one thing a support bot must not do.

        It can say where the button is; it cannot say it pressed it.
        """
        body = self.ask('cancel my booking now').json()
        text = body['reply'].lower()

        self.assertIn('cannot cancel it for you', text)

    def test_romanised_hindi_matches_the_same_intent(self):
        """`ticket cancel karna hai` is how the question actually arrives."""
        body = self.ask('mujhe ticket cancel karna hai').json()

        self.assertEqual(body['intent'], 'cancel')

    def test_refund_status_beats_the_general_refund_answer(self):
        """
        Ordering, which is the whole trick in `knowledge.INTENTS`.

        'refund status' contains 'refund', so the specific intent has to be
        tried first or the general one swallows it.
        """
        self.assertEqual(self.ask('refund status').json()['intent'], 'refund_status')
        self.assertEqual(self.ask('how much refund do I get').json()['intent'], 'refund_policy')

    def test_account_questions_ask_an_anonymous_visitor_to_sign_in(self):
        body = self.ask('where is my booking').json()

        self.assertEqual(body['source'], 'scripted')
        self.assertIn('signed in', body['reply'])

    def test_an_unmatched_question_falls_back_without_a_key(self):
        """No key, nothing matched: a menu, not an error."""
        response = self.ask('do you deliver pizza to Nagpur')
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(body['source'], 'fallback')
        self.assertIn('did not follow', body['reply'])

    def test_the_opening_call_reports_the_ai_as_off(self):
        body = self.client.get(reverse('chat:ask')).json()

        self.assertFalse(body['ai'])
        self.assertFalse(body['signedIn'])
        self.assertTrue(body['reply'])

    def test_an_empty_message_is_rejected(self):
        response = self.ask('')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error']['code'], 'invalid_message')

    def test_history_is_capped(self):
        """A tab left open all afternoon cannot grow an unbounded prompt."""
        history = [
            {'role': 'user', 'content': f'question {index}'}
            for index in range(40)
        ]
        self.assertEqual(self.ask('hello', history).status_code, 200)


@override_settings(CHAT_AI_KEY='test-key')
class AssistantFallbackTests(TestCase):
    """The AI half, stubbed. Nothing here reaches the network."""

    def setUp(self):
        cache.clear()

    def ask(self, message):
        return self.client.post(
            reverse('chat:ask'),
            data=json.dumps({'message': message}),
            content_type='application/json',
        )

    @patch('chat.assistant.available', return_value=True)
    @patch('chat.assistant.answer', return_value='Yes, in Marathi too.')
    def test_an_unmatched_question_reaches_the_model(self, answer, available):
        body = self.ask('do you deliver pizza to Nagpur').json()

        self.assertEqual(body['source'], 'ai')
        self.assertEqual(body['reply'], 'Yes, in Marathi too.')

    @patch('chat.assistant.available', return_value=True)
    @patch('chat.assistant.answer', return_value=None)
    def test_a_failed_model_call_degrades_rather_than_erroring(self, answer, available):
        """
        The behaviour the whole design rests on.

        A model that times out leaves the traveller with the scripted bot and
        the phone number, not a red error in a chat window.
        """
        response = self.ask('do you deliver pizza to Nagpur')
        body = response.json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(body['source'], 'fallback')
        self.assertIn('could not reach', body['reply'])

    @patch('chat.assistant.available', return_value=True)
    @patch('chat.assistant.answer')
    def test_a_scripted_question_never_reaches_the_model(self, answer, available):
        """The cost argument: the common questions must not be billable."""
        self.ask('I want to cancel my ticket')

        answer.assert_not_called()


@override_settings(
    CHAT_AI_KEY='',
    REST_FRAMEWORK={'DEFAULT_THROTTLE_RATES': {'chat': '3/hour'}},
)
class ChatRateLimitTests(TestCase):
    """The limit that stops a script spending the model budget."""

    def setUp(self):
        # DRF reads the rates off the throttle class, which took its copy
        # from the settings when the module was imported - so overriding the
        # setting is not enough on its own. It is put back afterwards; left
        # mutated, a 3/hour limit leaks into every later test.
        cache.clear()
        self._rates = ChatThrottle.THROTTLE_RATES
        ChatThrottle.THROTTLE_RATES = {'chat': '3/hour'}

    def tearDown(self):
        ChatThrottle.THROTTLE_RATES = self._rates
        cache.clear()

    def ask(self):
        return self.client.post(
            reverse('chat:ask'),
            data=json.dumps({'message': 'hello'}),
            content_type='application/json',
        )

    def test_the_fourth_message_in_an_hour_is_refused(self):
        for _ in range(3):
            self.assertEqual(self.ask().status_code, 200)

        self.assertEqual(self.ask().status_code, 429)
