"""
The scripted half of the assistant: what it knows without asking a model.

Every answer here is written once and costs nothing to give, which is why this
runs first. Most support chat on a booking site is the same six questions -
where is my ticket, cancel this, where is my refund, the payment failed, change
the date, put me through to a person - and a model is a slow, expensive way to
answer a question whose answer never changes.

What a model is *good* at is understanding a question that was not typed the
way anyone expected, in any of the languages the site claims to support. That
is the half in `assistant.py`, and it only runs when nothing here matches.

Two rules hold this together:

- An intent that needs the traveller's own data reads it live through the
  booking modules' services. Nothing about a booking is written down here.
- Every answer is honest about what it is not: none of these can actually
  cancel anything. They tell the traveller where the button is. A support bot
  that claims to have done something it did not do is worse than no bot.
"""
from dataclasses import dataclass, field
from datetime import date

#: Where the widget can send someone. The browser knows these as routes; the
#: server only names them, and `ChatWidget` turns a name into a link.
ACTION_ACCOUNT = 'account'
ACTION_REFUNDS = 'refunds'
ACTION_CONTACT = 'contact'
ACTION_SEARCH = 'search'


@dataclass(frozen=True)
class Answer:
    """What the assistant says back, and what it offers next."""

    text: str
    #: Tappable follow-ups, shown as chips under the reply.
    quick_replies: tuple = ()
    #: A route the widget offers as a button, from the ACTION_* names above.
    action: str = ''

    def as_dict(self):
        return {
            'reply': self.text,
            'quickReplies': list(self.quick_replies),
            'action': self.action or None,
        }


@dataclass(frozen=True)
class Intent:
    """One thing a traveller might be asking, and how to recognise it."""

    id: str
    #: Lowercased substrings. A match on any one is a match on the intent.
    #:
    #: Romanised Hindi and Marathi sit beside the English because that is how
    #: people actually type here - "ticket cancel karna hai", not "I would
    #: like to cancel my ticket". The scripted half only ever sees Latin
    #: script this way; a question typed in Devanagari falls through to the
    #: model, which is the right place for it.
    keywords: tuple
    #: Takes the request context, returns an `Answer`.
    respond: object
    #: Intents are tried in order; the first match wins. Ties are broken by
    #: putting the more specific intent earlier in `INTENTS`.
    needs_account: bool = False
    _: dict = field(default_factory=dict, repr=False)


# ------------------------------------------------------------------
# The answers.
#
# Each takes a `Context` (see views.py) so the ones that need the traveller's
# own bookings can reach them, and the rest can ignore it.
# ------------------------------------------------------------------

GREETING_REPLIES = (
    'Where is my booking?',
    'Cancel a booking',
    'Refund status',
    'Talk to a person',
)


def _greeting(context):
    who = f', {context.first_name}' if context.first_name else ''
    return Answer(
        text=(
            f'Hello{who}! I can help with bookings, cancellations, refunds and '
            'payments. What do you need?'
        ),
        quick_replies=GREETING_REPLIES,
    )


def _my_bookings(context):
    """The traveller's own tickets, read live rather than described."""
    bookings = context.bookings()

    if not bookings:
        return Answer(
            text=(
                'There is nothing booked on this account yet. Search for a '
                'bus, train, flight, stay or cab and it will show up here '
                'once it is paid for.'
            ),
            quick_replies=('How do I book?', 'Talk to a person'),
            action=ACTION_SEARCH,
        )

    today = date.today().isoformat()
    upcoming = [
        booking for booking in bookings
        if (booking.get('endDate') or booking.get('travelDate', ''))[:10] >= today
        and booking.get('status') in ('confirmed', 'pending')
    ]

    if not upcoming:
        return Answer(
            text=(
                f'You have {len(bookings)} booking(s) on this account, but '
                'nothing coming up — they are all past or cancelled. The full '
                'list, with every ticket, is on your account page.'
            ),
            quick_replies=('Refund status', 'Talk to a person'),
            action=ACTION_ACCOUNT,
        )

    lines = []
    for booking in upcoming[:3]:
        route = booking.get('title') or booking.get('reference', 'Booking')
        when = (booking.get('travelDate') or '')[:10]
        lines.append(
            f"• {route} on {when} — {booking.get('reference', '')} "
            f"({booking.get('status', 'confirmed')})"
        )

    more = ''
    if len(upcoming) > 3:
        more = f'\n…and {len(upcoming) - 3} more.'

    return Answer(
        text='Here is what is coming up:\n' + '\n'.join(lines) + more,
        quick_replies=('Cancel a booking', 'Refund status'),
        action=ACTION_ACCOUNT,
    )


def _cancel(context):
    return Answer(
        text=(
            'You can cancel any confirmed booking yourself: open your account '
            'page, find the ticket and press Cancel. The refund is worked out '
            'before you confirm, so you see the amount first — nothing is '
            'cancelled until you agree to it.\n\n'
            'I cannot cancel it for you from here, on purpose: a cancellation '
            'should never happen because a chat misread a sentence.'
        ),
        quick_replies=('What is the refund?', 'Where is my booking?'),
        action=ACTION_ACCOUNT,
    )


def _refund_policy(context):
    return Answer(
        text=(
            'Refunds go back to the method you paid with. The amount depends '
            'on how close to departure you cancel — the exact slabs for each '
            'mode are in the cancellation policy, and your account page shows '
            'the real figure for your specific ticket before you confirm.\n\n'
            'Once it is approved, a card or UPI refund normally lands in 3–5 '
            'working days; a bank transfer can take up to 7.'
        ),
        quick_replies=('Cancel a booking', 'Talk to a person'),
        action=ACTION_REFUNDS,
    )


def _refund_status(context):
    bookings = context.bookings()
    cancelled = [b for b in bookings if b.get('status') == 'cancelled']

    if not cancelled:
        return Answer(
            text=(
                'Nothing on this account is currently cancelled, so there is '
                'no refund in progress. If you cancelled somewhere else or '
                'paid without signing in, the support line can trace it from '
                'the payment reference.'
            ),
            quick_replies=('Cancellation policy', 'Talk to a person'),
            action=ACTION_CONTACT,
        )

    lines = [
        f"• {b.get('title') or b.get('reference', '')} — {b.get('reference', '')}"
        for b in cancelled[:3]
    ]
    return Answer(
        text=(
            'These are cancelled and refunding:\n' + '\n'.join(lines) +
            '\n\nCard and UPI refunds normally land in 3–5 working days. Your '
            'account page shows the amount that was returned for each one.'
        ),
        quick_replies=('Cancellation policy', 'Talk to a person'),
        action=ACTION_ACCOUNT,
    )


def _payment(context):
    return Answer(
        text=(
            'If the money left your account but no ticket appeared, nothing is '
            'lost: a payment that does not complete is reversed by the bank on '
            'its own, usually within 3–5 working days, and no ticket means no '
            'charge was captured.\n\n'
            'Check your account page first — if the booking is listed as '
            'confirmed, the payment did go through and the ticket is there.'
        ),
        quick_replies=('Where is my booking?', 'Talk to a person'),
        action=ACTION_ACCOUNT,
    )


def _modify(context):
    return Answer(
        text=(
            'A booked ticket cannot have its date or passengers edited in '
            'place — that is a rule of the operators and the railways, not '
            'ours. The way through it is to cancel and book again, which is '
            'why the refund is shown before you confirm the cancellation.\n\n'
            'For a stay, the same is true, though many rate plans cancel free '
            'up to 24 hours before check-in.'
        ),
        quick_replies=('Cancel a booking', 'What is the refund?'),
        action=ACTION_ACCOUNT,
    )


def _ticket(context):
    return Answer(
        text=(
            'Every ticket is on your account page, and each one opens to a '
            'printable copy with the PNR, seat or berth, boarding point and '
            'fare breakdown. Print it or save it as a PDF from there — the '
            'page is laid out for it.'
        ),
        quick_replies=('Where is my booking?', 'Talk to a person'),
        action=ACTION_ACCOUNT,
    )


def _booking_help(context):
    return Answer(
        text=(
            'Pick the mode at the top of the home page — bus, train, flight, '
            'hotel or cab — fill in where and when, and search. You choose a '
            'service, then seats or a room, then travellers, then pay. The '
            'ticket is issued straight away and lands on your account page.'
        ),
        quick_replies=('Talk to a person',),
        action=ACTION_SEARCH,
    )


def _human(context):
    return Answer(
        text=(
            'Support is on the phone 24×7 — the number is in the header and at '
            'the bottom of every page, and a real person answers it. If it is '
            'not urgent, the contact form reaches the same team and keeps a '
            'written trail, which is better for anything about money.'
        ),
        quick_replies=('Cancellation policy',),
        action=ACTION_CONTACT,
    )


def _languages(context):
    return Answer(
        text=(
            'Type in whatever language you are comfortable with — Hindi, '
            'Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada and more — and '
            'I will answer in the same one. The phone line is staffed in the '
            'major languages too.'
        ),
        quick_replies=GREETING_REPLIES,
    )


def _sign_in_first(context):
    """What an account-only intent answers with when nobody is signed in."""
    return Answer(
        text=(
            'I can pull up your tickets, but only once you are signed in — '
            'they belong to an account, not to this chat. Sign in from the '
            'button in the header and ask me again.'
        ),
        quick_replies=('Cancellation policy', 'Talk to a person'),
        action=ACTION_ACCOUNT,
    )


#: Tried in order; the first keyword match wins, so the specific intents come
#: before the general ones. "refund status" has to beat "refund", and "cancel"
#: has to beat the greeting.
INTENTS = (
    Intent(
        id='refund_status',
        keywords=(
            'refund status', 'refund kab', 'paisa kab', 'paise kab',
            'where is my refund', 'refund not received', 'refund aaya',
            'money back', 'paise wapas',
        ),
        respond=_refund_status,
        needs_account=True,
    ),
    Intent(
        id='refund_policy',
        keywords=(
            'refund', 'cancellation charge', 'cancellation fee', 'charges',
            'kitna refund', 'refund policy', 'kitne paise',
        ),
        respond=_refund_policy,
    ),
    Intent(
        id='cancel',
        keywords=(
            'cancel', 'cancle', 'cancellation', 'cancel karna', 'rad kar',
            'radd', 'ticket cancel',
        ),
        respond=_cancel,
    ),
    Intent(
        id='payment',
        keywords=(
            'payment failed', 'payment fail', 'money deducted', 'paisa kat',
            'paise kat', 'debited', 'upi fail', 'card decline', 'not booked',
            'transaction fail',
        ),
        respond=_payment,
    ),
    Intent(
        id='modify',
        keywords=(
            'change date', 'reschedul', 'postpone', 'prepone', 'date badal',
            'modify booking', 'change my booking', 'edit booking',
            'change passenger', 'name change',
        ),
        respond=_modify,
    ),
    Intent(
        id='ticket',
        keywords=(
            'print', 'download ticket', 'ticket copy', 'pnr', 'e-ticket',
            'eticket', 'ticket kaha', 'ticket nahi mila',
        ),
        respond=_ticket,
    ),
    Intent(
        id='my_bookings',
        keywords=(
            'my booking', 'my bookings', 'my ticket', 'my tickets',
            'where is my', 'booking status', 'upcoming trip', 'meri booking',
            'mera ticket', 'booking kaha',
        ),
        respond=_my_bookings,
        needs_account=True,
    ),
    Intent(
        id='booking_help',
        keywords=(
            'how do i book', 'how to book', 'book a', 'kaise book',
            'booking kaise', 'want to book', 'new booking',
        ),
        respond=_booking_help,
    ),
    Intent(
        id='human',
        keywords=(
            'talk to', 'speak to', 'human', 'agent', 'customer care',
            'support number', 'phone number', 'call me', 'complaint',
            'baat kar', 'shikayat',
        ),
        respond=_human,
    ),
    Intent(
        id='languages',
        keywords=(
            'language', 'hindi', 'marathi', 'tamil', 'telugu', 'bengali',
            'gujarati', 'kannada', 'bhasha',
        ),
        respond=_languages,
    ),
    Intent(
        id='greeting',
        keywords=(
            'hello', 'hi ', 'hey', 'namaste', 'namaskar', 'good morning',
            'good evening', 'help', 'madad',
        ),
        respond=_greeting,
    ),
)


def match(message, context):
    """
    The first intent whose keywords appear in `message`, answered.

    Returns `None` when nothing matches, which is the signal to try the model.
    A lone "hi" matches; "hi, my bus never turned up in Nashik" matches the
    greeting too, which is why the greeting is last - every intent above it
    gets first refusal on a sentence that says something more specific.
    """
    text = f' {message.lower().strip()} '

    for intent in INTENTS:
        if not any(keyword in text for keyword in intent.keywords):
            continue
        if intent.needs_account and not context.signed_in:
            return _sign_in_first(context), intent.id
        return intent.respond(context), intent.id

    return None, ''


def nothing_matched(context, ai_tried):
    """
    The reply when neither the script nor the model could answer.

    Two different sentences, because the situations are different: with no
    model configured the bot is simply a menu and should say so, where a model
    that was asked and failed is a fault the traveller should not be left
    guessing about.
    """
    if ai_tried:
        text = (
            'I could not reach my assistant just then. The phone line is the '
            'quickest way through in the meantime — it is staffed 24×7.'
        )
    else:
        text = (
            'I did not follow that one. I can help with bookings, '
            'cancellations, refunds, payments and tickets — or put you through '
            'to a person, which is the better option for anything unusual.'
        )

    return Answer(text=text, quick_replies=GREETING_REPLIES, action=ACTION_CONTACT)
