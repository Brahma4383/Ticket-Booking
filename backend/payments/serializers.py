"""
Request validation and response shaping for the payment endpoints.

Incoming payloads go through DRF serializers; outgoing ones are built by the
`serialise_*` functions, plain dicts in the exact shape of
frontend/src/types/payment.types.ts. `serialise_payment` is also what every
travel module embeds in its own confirmation, so a ticket and a receipt
describe the same payment the same way.

Card numbers and CVVs pass through validation and reach the gateway; they
are never stored, logged or echoed. What a payment row keeps is the masked
form `gateway.mask_card` produces.
"""
from decimal import Decimal

from rest_framework import serializers

from payments import gateway
from payments.services import hold_expires_at


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def money(value):
    """A rupee amount as a JSON number; whole rupees stay ints."""
    amount = Decimal(value or 0).quantize(Decimal('0.01'))
    return int(amount) if amount == amount.to_integral_value() else float(amount)


def serialise_payment(payment, currency='INR'):
    """
    A PaymentRecord: one attempt, as the ticket and the receipt print it.

    `currency` is passed in rather than read off `payment.booking` so a
    payment reached through a module's own `Booking` class - which is not
    this app's - serialises without a second query.
    """
    if payment is None:
        return None

    label = gateway.METHOD_LABELS.get(payment.method, payment.method)
    return {
        'transactionRef': payment.transaction_ref or '',
        'method': payment.method,
        'methodLabel': label,
        'instrument': payment.instrument or label,
        'amount': money(payment.amount),
        'currency': currency,
        'status': payment.status,
        'paidAt': payment.paid_at.isoformat() if payment.paid_at else None,
    }


def serialise_fare_lines(lines):
    return [{'label': line.label, 'amount': money(line.amount)} for line in lines]


def serialise_booking_stub(booking):
    """
    The little a receipt needs to say about its booking.

    Only what the shared `booking` table holds: the route, the property, the
    train are the travel module's to describe, and the account page already
    has them from its own list.
    """
    return {
        'reference': booking.reference,
        'mode': booking.mode,
        'status': booking.status,
        'contactEmail': booking.contact_email,
        'contactPhone': booking.contact_phone,
        'totalAmount': money(booking.total_amount),
        'currency': booking.currency,
        'bookedAt': booking.booked_at.isoformat(),
        'cancelledAt': (
            booking.cancelled_at.isoformat() if booking.cancelled_at else None
        ),
        'holdExpiresAt': hold_expires_at(booking),
    }


def serialise_transaction(payment):
    """One row of the account's transaction list."""
    return {
        **serialise_payment(payment, payment.booking.currency),
        'booking': serialise_booking_stub(payment.booking),
    }


def serialise_receipt(payment, fare_lines):
    return {
        **serialise_transaction(payment),
        'fareLines': serialise_fare_lines(fare_lines),
    }


def serialise_order(booking, amount_due, payments, fare_lines):
    """What `GET /api/payments/<mode>/<reference>/` answers with."""
    return {
        'booking': serialise_booking_stub(booking),
        'amountDue': money(amount_due),
        'currency': booking.currency,
        'holdExpiresAt': hold_expires_at(booking),
        'payments': [
            serialise_payment(payment, booking.currency) for payment in payments
        ],
        'fareLines': serialise_fare_lines(fare_lines),
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

class CardSerializer(serializers.Serializer):
    """
    A card as typed. Checked for shape here, then handed to the gateway,
    which decides whether the bank would honour it.
    """

    number = serializers.CharField(max_length=23)
    name = serializers.CharField(max_length=150)
    expiry = serializers.CharField(max_length=5)
    cvv = serializers.CharField(min_length=3, max_length=4)

    def validate_number(self, value):
        digits = gateway.card_digits(value)
        if not gateway.luhn_valid(digits):
            raise serializers.ValidationError('Enter a valid card number.')
        return digits

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Enter the name on the card.')
        return value.strip()

    def validate_expiry(self, value):
        if not gateway.CARD_EXPIRY_PATTERN.match(value.strip()):
            raise serializers.ValidationError('Enter the expiry as MM/YY.')
        return value.strip()

    def validate_cvv(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('The CVV is 3 or 4 digits.')
        return value


class PaymentRequestSerializer(serializers.Serializer):
    """
    Body of `POST /api/payments/<mode>/<reference>/`.

    `method` says which one of the other fields matters; the rest are
    ignored, so a form that keeps state for every method can send it all.
    """

    method = serializers.ChoiceField(choices=gateway.METHODS)
    upiId = serializers.CharField(
        required=False, allow_blank=True, max_length=100,
    )
    card = CardSerializer(required=False)
    bank = serializers.ChoiceField(choices=gateway.BANKS, required=False)
    wallet = serializers.ChoiceField(choices=gateway.WALLETS, required=False)

    #: Which field each method reads. The others are dropped before
    #: validation, so a half-typed card cannot block a UPI payment.
    FIELD_FOR = {
        gateway.UPI: 'upiId',
        gateway.CARD: 'card',
        gateway.NETBANKING: 'bank',
        gateway.WALLET: 'wallet',
    }

    def to_internal_value(self, data):
        if isinstance(data, dict):
            field = self.FIELD_FOR.get(data.get('method'))
            if field is not None:
                data = {
                    'method': data['method'],
                    **({field: data[field]} if field in data else {}),
                }
        return super().to_internal_value(data)

    def validate(self, attrs):
        method = attrs['method']

        if method == gateway.UPI:
            upi_id = (attrs.get('upiId') or '').strip()
            if not gateway.UPI_PATTERN.match(upi_id):
                raise serializers.ValidationError({
                    'upiId': 'Enter a UPI ID such as yourname@okhdfcbank.',
                })
            attrs['upiId'] = upi_id.lower()

        elif method == gateway.CARD and 'card' not in attrs:
            raise serializers.ValidationError({
                'card': 'Enter the card details.',
            })

        elif method == gateway.NETBANKING and 'bank' not in attrs:
            raise serializers.ValidationError({'bank': 'Choose a bank.'})

        elif method == gateway.WALLET and 'wallet' not in attrs:
            raise serializers.ValidationError({'wallet': 'Choose a wallet.'})

        return attrs
