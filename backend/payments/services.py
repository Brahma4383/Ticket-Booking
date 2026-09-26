"""
The payments module's business rules.

A booking is made in two steps. A travel module holds the inventory - seats,
berths, room nights - and writes the booking as `pending`. This module then
takes the money for it: every attempt is a `payment` row with a transaction
reference, a payment that goes through moves the booking to `confirmed`, and
a hold that is still unpaid after `PAYMENT_HOLD_MINUTES` is released and
the booking marked `failed`.

The travel modules stay in charge of their own inventory. This module never
touches a seat table; it asks the module that sold the booking to give the
inventory back through two small hooks every one of them exposes:

    amount_due(booking_id)      what to charge - the fare, or a cab's advance
    release_booking(booking_id) put the inventory back after an expired hold

Those are the same functions their own `cancel_booking` uses, so releasing
an expired hold and cancelling a ticket cannot disagree about what "back on
sale" means.
"""
from datetime import timedelta
from decimal import Decimal
from importlib import import_module

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from payments import gateway
from payments.exceptions import (
    BookingNotFound,
    PaymentDeclined,
    PaymentExpired,
    PaymentNotAllowed,
    TransactionNotFound,
    UnknownBookingMode,
)
from payments.models import Booking, Payment

MODES = ('bus', 'train', 'plane', 'hotel', 'cab')


def hold_minutes():
    """How long a pending booking keeps its inventory while unpaid."""
    return int(getattr(settings, 'PAYMENT_HOLD_MINUTES', 15))


def module_for(mode):
    """
    The travel module that sold a booking, imported only when asked for.

    Imported lazily, the way `accounts.views` reaches the modules, so nothing
    here depends on a travel app at import time and the travel apps can
    import this module's neighbours without a cycle.
    """
    if mode not in MODES:
        raise UnknownBookingMode(
            f'There is nothing booked under "{mode}".', detail={'mode': mode},
        )
    return import_module(f'{mode}.services')


# ---------------------------------------------------------------------------
# The hold
# ---------------------------------------------------------------------------

def hold_deadline(booking):
    """The moment an unpaid booking loses its inventory."""
    return booking.booked_at + timedelta(minutes=hold_minutes())


def hold_expires_at(booking):
    """
    The deadline as an ISO string while the booking is pending, else None.

    Called by every module's `serialise_confirmation`, so it accepts any of
    their `Booking` classes: all it reads is `status` and `booked_at`.
    """
    if booking.status != Booking.PENDING:
        return None
    return hold_deadline(booking).isoformat()


def is_hold_expired(booking, now=None):
    return (
        booking.status == Booking.PENDING
        and hold_deadline(booking) <= (now or timezone.now())
    )


def amount_due(booking):
    """What the gateway is asked for. The module decides: see the docstring."""
    return Decimal(module_for(booking.mode).amount_due(booking.pk))


def _owned_booking(user_id, mode, reference, *, lock=False):
    """
    The booking, for the account that made it.

    Scoped to the account rather than trusting the reference alone, and the
    same 404 whether it does not exist or belongs to someone else.
    """
    if mode not in MODES:
        raise UnknownBookingMode(
            f'There is nothing booked under "{mode}".', detail={'mode': mode},
        )

    rows = Booking.objects.all()
    if lock:
        # Held for the rest of the transaction, so two tabs paying for the
        # same booking - or a payment racing the expiry sweep - are
        # serialised rather than both passing the status check.
        rows = rows.select_for_update()

    booking = rows.filter(
        mode=mode, user_id=user_id, reference=reference.strip().upper(),
    ).first()
    if booking is None:
        raise BookingNotFound()
    return booking


def _successful_payment(booking):
    return (
        booking.payments.filter(status=Payment.SUCCESS).order_by('-pk').first()
    )


def _expire(booking):
    """
    Release an unpaid hold. Call inside a transaction with the row locked.

    The module gives its inventory back; the booking closes as `failed`, which
    is the schema's word for "never paid for", and any attempt still marked
    pending closes with it.
    """
    module_for(booking.mode).release_booking(booking.pk)

    booking.status = Booking.FAILED
    booking.save(update_fields=['status'])
    booking.payments.filter(status=Payment.PENDING).update(status=Payment.FAILED)


def expire_stale(user_id=None, now=None):
    """
    Close every pending booking whose hold has run out. Returns how many.

    Run for one account before its bookings or transactions are listed, so
    what the screen shows is current, and for everyone by the
    `expire_payments` command. Each booking is closed in its own transaction:
    one that fails to release should not keep the rest held.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(minutes=hold_minutes())

    candidates = Booking.objects.filter(
        status=Booking.PENDING, booked_at__lte=cutoff,
    )
    if user_id is not None:
        candidates = candidates.filter(user_id=user_id)

    expired = 0
    for pk in list(candidates.values_list('pk', flat=True)):
        with transaction.atomic():
            booking = (
                Booking.objects.select_for_update()
                .filter(pk=pk, status=Booking.PENDING)
                .first()
            )
            # Paid, cancelled or swept by someone else since the list was
            # taken: nothing to do.
            if booking is None:
                continue
            _expire(booking)
            expired += 1

    return expired


# ---------------------------------------------------------------------------
# Paying
# ---------------------------------------------------------------------------

PENDING = 'pending'
PAID = 'paid'
EXPIRED = 'expired'
CLOSED = 'closed'


RELEASED = 'released'


def _state(booking, now=None):
    """Which of the five things a payment attempt can run into."""
    if booking.status == Booking.CONFIRMED:
        return PAID
    # `failed` is only ever written by `_expire`: a hold the sweep already
    # released. Answered the same way as one that runs out right now.
    if booking.status == Booking.FAILED:
        return RELEASED
    if booking.status != Booking.PENDING:
        return CLOSED
    return EXPIRED if is_hold_expired(booking, now) else PENDING


def pay(user_id, mode, reference, method, details):
    """
    Take the payment for a pending booking.

    Returns `(payment, booking)` with the payment `success` and the booking
    `confirmed`. Raises:

      * `PaymentDeclined` (402) when the gateway says no. The failed attempt
        is committed before the error is raised - it is a record, not a
        rollback - and the booking stays pending, so the traveller can try
        again until the hold runs out.
      * `PaymentExpired` (409) when the hold has run out. The inventory is
        released here and now rather than waiting for the sweep.
      * `PaymentNotAllowed` (409) for a cancelled, failed or completed
        booking.

    Paying for a booking that is already confirmed answers with the payment
    that confirmed it, so a retry after a dropped connection is harmless.

    Three transactions on purpose. The checks and the expiry commit first;
    the gateway is asked with no lock held, because a real one takes seconds
    to answer; and the result is written under a fresh lock with the status
    re-checked, in case another tab paid meanwhile.
    """
    with transaction.atomic():
        booking = _owned_booking(user_id, mode, reference, lock=True)
        state = _state(booking)
        if state == EXPIRED:
            _expire(booking)

    if state in (EXPIRED, RELEASED):
        raise PaymentExpired(detail={
            'reference': booking.reference,
            'holdExpiredAt': hold_deadline(booking).isoformat(),
        })
    if state == PAID:
        existing = _successful_payment(booking)
        if existing is None:
            raise PaymentNotAllowed(detail={
                'reference': booking.reference, 'status': booking.status,
            })
        return existing, booking
    if state == CLOSED:
        raise PaymentNotAllowed(detail={
            'reference': booking.reference, 'status': booking.status,
        })

    amount = amount_due(booking)
    decision = gateway.charge(method, details, amount)

    with transaction.atomic():
        booking = _owned_booking(user_id, mode, reference, lock=True)
        if booking.status != Booking.PENDING:
            existing = _successful_payment(booking)
            if existing is not None:
                return existing, booking
            raise PaymentNotAllowed(detail={
                'reference': booking.reference, 'status': booking.status,
            })

        payment = Payment.objects.create(
            booking=booking,
            method=method,
            instrument=decision.instrument[:100],
            amount=amount,
            status=Payment.SUCCESS if decision.approved else Payment.FAILED,
            transaction_ref=decision.transaction_ref,
            paid_at=timezone.now() if decision.approved else None,
        )

        if decision.approved:
            booking.status = Booking.CONFIRMED
            booking.save(update_fields=['status'])

    if not decision.approved:
        raise PaymentDeclined(decision.failure_reason, detail={
            'transactionRef': payment.transaction_ref,
            'reference': booking.reference,
            'holdExpiresAt': hold_expires_at(booking),
        })

    return payment, booking


# ---------------------------------------------------------------------------
# Reading back
# ---------------------------------------------------------------------------

def order(user_id, mode, reference):
    """
    What the resume-payment screen needs: the booking, what is owed, every
    attempt so far and the fare lines. Expires the hold first if it has run
    out, so the answer is current.
    """
    with transaction.atomic():
        booking = _owned_booking(user_id, mode, reference, lock=True)
        if _state(booking) == EXPIRED:
            _expire(booking)

    return (
        booking,
        amount_due(booking),
        list(booking.payments.order_by('pk')),
        list(booking.fare_lines.all()),
    )


def list_transactions(user_id):
    """Every payment attempt this account has made, newest first."""
    expire_stale(user_id)
    return list(
        Payment.objects
        .select_related('booking')
        .filter(booking__user_id=user_id)
        .order_by('-pk')
    )


def get_transaction(user_id, transaction_ref):
    """One attempt with its fare lines - a receipt. Scoped to the account."""
    payment = (
        Payment.objects
        .select_related('booking')
        .filter(
            booking__user_id=user_id,
            transaction_ref=transaction_ref.strip().upper(),
        )
        .first()
    )
    if payment is None:
        raise TransactionNotFound()

    return payment, list(payment.booking.fare_lines.all())
