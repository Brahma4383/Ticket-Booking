"""
The simulated payment gateway.

There is no processor behind this app and no money moves. What this module
does is behave like one from the outside: it takes a method and an
instrument, checks what a real gateway would check before sending a request
to the bank, answers approved or declined, and hands back a transaction
reference either way.

The decisions are deterministic so the failure path can be exercised on
purpose, the way a sandbox account on a real gateway lets you. The rules are
short and listed here; the front end prints them next to the form:

    UPI         Any well-formed ID goes through. A local part of `failure`
                (e.g. `failure@upi`) is declined by the UPI app.
    Card        Any Luhn-valid number with a future expiry goes through.
                4000 0000 0000 0002 is declined by the issuer and
                4000 0000 0000 9995 has insufficient funds. An expired card
                is declined too.
    Netbanking  Always goes through, for any bank on the list.
    Wallet      Always goes through, for any wallet on the list.

Swapping in a real gateway means replacing `charge` with a call to it and
keeping everything around it; `services.pay` neither knows nor cares where
the decision came from.
"""
import re
import secrets
from dataclasses import dataclass

from django.utils import timezone

UPI = 'upi'
CARD = 'card'
NETBANKING = 'netbanking'
WALLET = 'wallet'

METHODS = (UPI, CARD, NETBANKING, WALLET)

METHOD_LABELS = {
    UPI: 'UPI',
    CARD: 'Card',
    NETBANKING: 'Netbanking',
    WALLET: 'Wallet',
}

#: The same two lists the payment step offers. Sent back as the instrument
#: label, so what the ticket prints is one of these strings.
BANKS = (
    'State Bank of India',
    'HDFC Bank',
    'ICICI Bank',
    'Axis Bank',
    'Kotak Mahindra Bank',
    'Punjab National Bank',
)

WALLETS = ('Paytm', 'Amazon Pay', 'PhonePe Wallet', 'Mobikwik')

#: `name@handle`: at least two characters either side of one `@`, letters,
#: digits, dots, hyphens and underscores in the name, letters and digits in
#: the handle. Case-insensitive, and stored lowercased.
UPI_PATTERN = re.compile(r'^[a-z0-9][a-z0-9._-]+@[a-z][a-z0-9]+$', re.IGNORECASE)

#: UPI local parts the simulated UPI app refuses.
DECLINED_UPI_NAMES = frozenset({'failure', 'fail', 'declined'})

#: Card numbers with a scripted answer, as a sandbox would have.
DECLINED_CARDS = {
    '4000000000000002': 'The card was declined by the issuing bank.',
    '4000000000009995': 'The card does not have enough funds for this payment.',
}

CARD_EXPIRY_PATTERN = re.compile(r'^(0[1-9]|1[0-2])/(\d{2})$')


@dataclass(frozen=True)
class Decision:
    """What the gateway says about one attempt."""

    approved: bool
    #: What the receipt prints: the UPI ID, a masked card, a bank or a wallet.
    instrument: str
    transaction_ref: str
    #: Why it was declined, in words meant for the traveller. None if approved.
    failure_reason: str | None = None


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------

def card_digits(number):
    """The number with spaces and hyphens removed; whatever was typed."""
    return re.sub(r'[\s-]', '', number or '')


def luhn_valid(digits):
    """The check digit every card number carries. A typo fails it."""
    if not digits.isdigit() or not 12 <= len(digits) <= 19:
        return False

    total = 0
    for index, char in enumerate(reversed(digits)):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def card_brand(digits):
    """
    The network, from the leading digits.

    Only the ranges a traveller in India is likely to hold. Anything else is
    plainly `Card`, which is still a true statement.
    """
    if digits.startswith('4'):
        return 'Visa'
    if digits[:2] in {'34', '37'}:
        return 'American Express'
    two = int(digits[:2]) if len(digits) >= 2 else 0
    four = int(digits[:4]) if len(digits) >= 4 else 0
    if 51 <= two <= 55 or 2221 <= four <= 2720:
        return 'Mastercard'
    if digits.startswith('35'):
        return 'JCB'
    if digits[:2] in {'60', '65', '81', '82'} or digits.startswith('508'):
        return 'RuPay'
    if digits[:2] in {'36', '38', '39'}:
        return 'Diners Club'
    return 'Card'


def mask_card(digits):
    """`Visa •••• 4242` - the only form of the number that is ever stored."""
    return f'{card_brand(digits)} •••• {digits[-4:]}'


def card_expired(expiry, today=None):
    """
    True when `MM/YY` is before the current month.

    A card is valid through the last day of its expiry month, so the same
    month as today is still fine.
    """
    match = CARD_EXPIRY_PATTERN.match(expiry or '')
    if match is None:
        return True

    month, year = int(match.group(1)), 2000 + int(match.group(2))
    today = today or timezone.localdate()
    return (year, month) < (today.year, today.month)


# ---------------------------------------------------------------------------
# The decision
# ---------------------------------------------------------------------------

def new_transaction_ref():
    """`TXN2609263F9A1C0B7D2E` - dated, then random, so a list reads in order."""
    return f'TXN{timezone.now():%y%m%d}{secrets.token_hex(7).upper()}'


def describe_instrument(method, details):
    """The label a payment row stores, for details `serializers` has checked."""
    if method == UPI:
        return details['upiId'].strip().lower()
    if method == CARD:
        return mask_card(card_digits(details['card']['number']))
    if method == NETBANKING:
        return details['bank']
    if method == WALLET:
        return details['wallet']
    raise ValueError(f'unknown payment method {method!r}')


def charge(method, details, amount):
    """
    Ask the gateway to take `amount` from the instrument in `details`.

    `details` is the validated data of `PaymentRequestSerializer`, so shape
    and format are already right; this decides only what the bank would.
    Never raises for a declined payment - a decline is an answer, and the
    caller records it as one.
    """
    instrument = describe_instrument(method, details)
    ref = new_transaction_ref()

    if method == UPI:
        local_part = instrument.split('@', 1)[0]
        if local_part in DECLINED_UPI_NAMES:
            return Decision(
                False, instrument, ref,
                'Your UPI app declined the payment. Check the app and try '
                'again, or pay another way.',
            )
        return Decision(True, instrument, ref)

    if method == CARD:
        digits = card_digits(details['card']['number'])
        if digits in DECLINED_CARDS:
            return Decision(False, instrument, ref, DECLINED_CARDS[digits])
        if card_expired(details['card']['expiry']):
            return Decision(
                False, instrument, ref, 'That card has expired.',
            )
        return Decision(True, instrument, ref)

    # Banks and wallets have no scripted failure: the point of the sandbox
    # rules above is to have *a* way to see a decline, not one per method.
    return Decision(True, instrument, ref)
