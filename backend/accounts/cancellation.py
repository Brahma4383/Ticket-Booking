"""
The one cancellation policy, shared by the five travel modules.

Cancelling is an account-level action - it is reached from the account's
ticket list, not from a booking flow - so the rule about *when* a ticket may
be cancelled lives here, in one place, and each module supplies only the half
it owns: giving its inventory back.

The direction of the dependency is the same one the models already use
(`bus.models` imports `accounts.models`), so a module importing this adds no
cycle. Statuses are compared as the plain strings the schema stores rather
than through any one module's `Booking` class, because all five define their
own model over the same `booking` table.
"""
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from accounts.exceptions import CancellationNotAllowed

CANCELLED = 'cancelled'
CONFIRMED = 'confirmed'
PENDING = 'pending'

#: The only two states a ticket can be cancelled out of. `completed` and
#: `failed` are terminal, and `cancelled` has already been here.
CANCELLABLE_STATUSES = (CONFIRMED, PENDING)


def ensure_cancellable(booking, last_travel_date):
    """
    Raise unless this booking may still be cancelled.

    `last_travel_date` is the end of the journey: the travel date for a bus,
    train, flight or cab, and the check-out date for a stay. Cancellation is
    allowed up to the end of that day rather than up to departure - a
    traveller who misses a bus at 6am is still owed the chance to cancel the
    rest of it, and this app has no live departure feed to be stricter with.
    """
    if booking.status == CANCELLED:
        raise CancellationNotAllowed(
            'That booking has already been cancelled.',
            detail={'status': booking.status},
        )

    if booking.status not in CANCELLABLE_STATUSES:
        raise CancellationNotAllowed(
            'Only a confirmed or pending booking can be cancelled.',
            detail={'status': booking.status},
        )

    if last_travel_date < timezone.localdate():
        raise CancellationNotAllowed(
            'That journey is already over, so it can no longer be cancelled.',
            detail={'travelDate': last_travel_date.isoformat()},
        )


def mark_cancelled(booking):
    """
    Close the booking and refund what was paid for it.

    The refund is the full amount. `payment` has one amount column and no
    place to record a cancellation charge, so a partial refund could not be
    represented honestly here; a real deployment would add a refund table and
    a per-operator charge before changing this.
    """
    booking.status = CANCELLED
    booking.cancelled_at = timezone.now()
    booking.save(update_fields=['status', 'cancelled_at'])

    # Only a payment that actually went through can be refunded; a pending or
    # failed one is left as it is. A booking cancelled before it was paid for
    # - the payments module holds it as `pending` meanwhile - has nothing to
    # refund, and this touches nothing.
    booking.payments.filter(status='success').update(status='refunded')

    return booking


def refund_total(booking):
    """
    What is owed back after `mark_cancelled`: every payment it just flipped
    to refunded, added up.

    Read off the payment rows rather than the booking's total, because the
    two differ: a cab takes only its advance online, and a booking that was
    never paid for refunds nothing.
    """
    total = (
        booking.payments.filter(status='refunded')
        .aggregate(total=Sum('amount'))['total']
    )
    # Quantised because SQLite hands a SUM back without the column's scale.
    return Decimal(total if total is not None else 0).quantize(Decimal('0.01'))
