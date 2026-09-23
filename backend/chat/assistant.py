"""
The optional half: a question the script could not place, asked of Claude.

Everything here is written so the site works identically without it. No key in
the environment, or the `anthropic` package not installed, and `available()` is
False - the view never calls in, and the traveller gets the scripted bot with
its menu of quick replies. Nothing errors, nothing is logged as a failure, and
no screen mentions an assistant that is not there.

That is the whole design constraint: the AI is an upgrade to how well the bot
understands a sentence, never a dependency of the bot existing.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

#: What the model is told it is. Deliberately narrow, and explicit about the
#: things it must not do - a support model that improvises a refund figure or
#: claims to have cancelled something creates a problem no disclaimer fixes.
SYSTEM_PROMPT = """\
You are the support assistant for SuryaBooker, an Indian travel booking site \
for buses, trains, flights, hotels and cabs.

Answer in the language the traveller wrote in — Hindi, Marathi, Tamil, Telugu, \
Bengali, Gujarati, Kannada, English or any other. Match their script too: \
reply in Devanagari to Devanagari, in Latin script to romanised Hindi.

Keep answers to two or three short sentences. This is a chat bubble on a phone, \
not an email.

What you can tell them:
- Bookings, cancellations and refunds are all handled from their account page.
- A cancellation shows the exact refund before it is confirmed; nothing is \
cancelled until they agree to it.
- Card and UPI refunds normally take 3–5 working days, bank transfers up to 7.
- Tickets cannot have their date or passengers edited; cancel and rebook.
- Every ticket is on the account page with a printable copy.
- Phone support is staffed 24×7, and the number is in the site header.

Hard rules:
- Never invent a fare, a refund amount, a PNR, a seat number or a timing. If \
you do not have it, say the account page or the phone line has it.
- Never say you have cancelled, changed, refunded or booked anything. You \
cannot act on their account — you can only tell them where the button is.
- If they are upset, or it is about money that has gone missing, point them at \
the phone line early rather than working through it yourself.
"""


def available():
    """
    Whether the AI half is configured and importable.

    Both halves of that matter: the key can be set on a machine where the SDK
    was never installed, and the SDK can be installed on one that has no key.
    """
    if not settings.CHAT_AI_KEY:
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        logger.info(
            'ANTHROPIC_API_KEY is set but the `anthropic` package is not '
            'installed; the assistant is running scripted-only.',
        )
        return False
    return True


def _context_note(context):
    """
    What the model is allowed to know about who it is talking to.

    A first name and a count of upcoming trips, and nothing else. The bookings
    themselves are not sent: the model has no reason to hold a stranger's PNR
    to answer "how do refunds work", and the intents that genuinely need a
    booking are answered from the script, which reads it directly.
    """
    if not context.signed_in:
        return 'The traveller is not signed in. Anything about their own bookings needs them to sign in first.'

    parts = ['The traveller is signed in.']
    if context.first_name:
        parts.append(f'Their first name is {context.first_name}.')
    count = len(context.bookings())
    parts.append(
        f'They have {count} booking(s) on the account; the account page lists them.'
        if count else
        'They have no bookings on the account yet.'
    )
    return ' '.join(parts)


def answer(message, history, context):
    """
    Ask the model, and return its reply — or `None` if it could not be had.

    `None` is not an exception on purpose. A model that times out should leave
    the traveller with the scripted bot's menu, not a red error in a chat
    window, and the caller handles that one line up.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=settings.CHAT_AI_KEY, timeout=20.0)

    messages = [
        {'role': turn['role'], 'content': turn['content']}
        for turn in history
    ]
    messages.append({'role': 'user', 'content': message})

    try:
        response = client.messages.create(
            model=settings.CHAT_AI_MODEL,
            max_tokens=600,
            system=[
                # The prompt is identical on every request, so it is worth
                # caching: the per-traveller note goes after it, where it
                # cannot invalidate the cached prefix.
                {
                    'type': 'text',
                    'text': SYSTEM_PROMPT,
                    'cache_control': {'type': 'ephemeral'},
                },
                {'type': 'text', 'text': _context_note(context)},
            ],
            # A support reply is a short, well-defined answer, not a problem
            # to reason about at length. Low effort is faster and cheaper and
            # loses nothing here.
            output_config={'effort': 'low'},
            messages=messages,
        )
    except Exception:
        # Deliberately broad: a timeout, a rate limit, a bad key and a network
        # failure all lead to the same place — fall back to the script.
        logger.exception('The chat assistant could not be reached')
        return None

    if response.stop_reason == 'refusal':
        logger.info('The chat assistant declined to answer a message')
        return None

    text = '\n'.join(
        block.text for block in response.content if block.type == 'text'
    ).strip()

    return text or None
