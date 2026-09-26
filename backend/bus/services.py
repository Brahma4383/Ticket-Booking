"""
The bus module's business rules.

Views stay thin: they validate input, call one function from here, and render
the result. Everything that touches more than one table - searching with
date-aware availability, pricing a selection, reserving seats - lives here so
it can be reasoned about, and reused, without a request in hand.
"""
import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.utils import timezone

from accounts.cancellation import ensure_cancellable, mark_cancelled
from accounts.exceptions import BookingNotFound

from bus.exceptions import (
    BookingNotFound,
    InvalidSeatSelection,
    SeatUnavailable,
    TripNotFound,
)
from bus.models import (
    Booking,
    BookingFareLine,
    BusBooking,
    BusBookingSeat,
    BusSeat,
    BusStopPoint,
    BusTrip,
    Payment,
)


# ---------------------------------------------------------------------------
# Fare rules
#
# These three constants are the whole pricing model, and they are duplicated in
# frontend/src/services/bus.services.ts so the summary can update as seats are
# picked without a round trip. The server recomputes on booking and its answer
# is the one that is charged - `POST /api/bus/quote/` exists so the two can be
# checked against each other.
# ---------------------------------------------------------------------------

SERVICE_FEE = Decimal('25.00')
GST_RATE = Decimal('0.05')


def calculate_fare(seat_prices):
    """
    Price a seat selection.

    GST rounds to whole rupees, matching the `Math.round` the front end
    applies, so both sides land on the same total for the same seats.
    """
    seat_total = sum((Decimal(price) for price in seat_prices), Decimal('0.00'))
    service_fee = SERVICE_FEE if seat_prices else Decimal('0.00')
    gst = ((seat_total + service_fee) * GST_RATE).quantize(
        Decimal('1'), rounding=ROUND_HALF_UP,
    )
    return {
        'seat_total': seat_total,
        'service_fee': service_fee,
        'gst': gst,
        'total': seat_total + service_fee + gst,
    }


# ---------------------------------------------------------------------------
# Reading inventory
# ---------------------------------------------------------------------------

def _trip_queryset():
    """
    Every trip read pulls the same related rows.

    Without the prefetches, serialising a page of results fires a query per
    trip for the operator, the amenities and the stop points.
    """
    return (
        BusTrip.objects
        .select_related('operator', 'origin_city', 'destination_city')
        .prefetch_related(
            'trip_amenities__amenity',
            Prefetch(
                'stop_points',
                queryset=BusStopPoint.objects.order_by('sort_order', 'stop_time'),
            ),
        )
    )


def booked_seat_codes(trip_ids, travel_date):
    """
    Seat codes already sold on `travel_date`, keyed by trip id.

    One query for however many trips are on the page.

    The booking's status is deliberately not consulted. uq_bus_seat_per_date
    admits one row per (seat, date) whatever the booking says, so the row
    itself is the reservation; releasing a seat means deleting it. Reading
    availability any other way would disagree with the constraint that
    enforces it.
    """
    rows = (
        BusBookingSeat.objects
        .filter(seat__trip_id__in=trip_ids, travel_date=travel_date)
        .values_list('seat__trip_id', 'seat__seat_code')
    )

    taken = {}
    for trip_id, seat_code in rows:
        taken.setdefault(trip_id, set()).add(seat_code)
    return taken


def search_trips(from_city, to_city, travel_date):
    """
    Services running between two cities, with availability for that date.

    City names are matched case-insensitively because they arrive as typed
    into the search box, not as ids.
    """
    trips = list(
        _trip_queryset()
        .filter(
            is_active=True,
            origin_city__name__iexact=from_city.strip(),
            destination_city__name__iexact=to_city.strip(),
            origin_city__is_active=True,
            destination_city__is_active=True,
        )
        .prefetch_related(
            Prefetch(
                'seats',
                queryset=BusSeat.objects.exclude(status=BusSeat.BLOCKED),
                to_attr='sellable_seats',
            ),
        )
        .order_by('departure_time')
    )

    taken = booked_seat_codes([trip.pk for trip in trips], travel_date)

    results = []
    for trip in trips:
        trip_taken = taken.get(trip.pk, set())
        free = [
            seat for seat in trip.sellable_seats
            if seat.seat_code not in trip_taken
        ]
        results.append({
            'trip': trip,
            # What the results card shows as "from ₹x" - the cheapest seat a
            # traveller could actually buy today, not the cheapest that exists.
            'fare_from': min(
                (seat.price for seat in free), default=trip.base_fare,
            ),
            'seats_left': len(free),
        })

    return results


def get_trip(trip_id, *, active_only=True):
    """
    One trip with its related rows.

    `active_only` is on for anything that leads to a sale and off when reading
    a ticket back: a service withdrawn from sale still has to print the
    tickets already issued against it.
    """
    trips = _trip_queryset()
    if active_only:
        trips = trips.filter(is_active=True)

    trip = trips.filter(pk=trip_id).first()
    if trip is None:
        raise TripNotFound()
    return trip


def seat_map(trip, travel_date):
    """Every seat on the trip, plus the codes sold on `travel_date`."""
    seats = list(trip.seats.all().order_by('deck', 'row_no', 'column_no'))
    taken = booked_seat_codes([trip.pk], travel_date).get(trip.pk, set())
    return seats, taken


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

# Unambiguous characters only: no O/0, no I/1. A traveller reads this off a
# screen and into a phone call.
PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
PNR_PREFIX = 'SB'


def generate_pnr():
    """`SBG28T5X` - the shape the ticket screen already prints."""
    body = ''.join(secrets.choice(PNR_ALPHABET) for _ in range(6))
    return f'{PNR_PREFIX}{body}'


def _resolve_seats(trip, seat_ids):
    """
    Look up and lock the requested seats.

    `select_for_update` holds the rows for the rest of the transaction, so two
    people checking out the same seat at the same time are serialised rather
    than both passing the availability check.
    """
    seats = {
        seat.seat_code: seat
        for seat in BusSeat.objects
        .select_for_update()
        .filter(trip=trip, seat_code__in=seat_ids)
    }

    missing = [code for code in seat_ids if code not in seats]
    if missing:
        raise InvalidSeatSelection(
            'Some of those seats are not on this bus.',
            detail={'seatIds': missing},
        )

    blocked = [
        code for code, seat in seats.items() if seat.status == BusSeat.BLOCKED
    ]
    if blocked:
        raise SeatUnavailable(
            'Some of those seats are not on sale.',
            detail={'seatIds': blocked},
        )

    return [seats[code] for code in seat_ids]


def _check_ladies_seats(seats, passengers_by_seat):
    """A ladies seat can only be occupied by a female passenger."""
    wrong = [
        seat.seat_code
        for seat in seats
        if seat.status == BusSeat.LADIES
        and passengers_by_seat[seat.seat_code]['gender'] != 'female'
    ]
    if wrong:
        raise InvalidSeatSelection(
            'A ladies seat can only be booked for a female passenger.',
            detail={'seatIds': wrong},
        )


def _resolve_stop_points(trip, boarding_id, dropping_id):
    points = {
        point.pk: point
        for point in BusStopPoint.objects.filter(
            trip=trip, pk__in=[boarding_id, dropping_id],
        )
    }

    boarding = points.get(boarding_id)
    dropping = points.get(dropping_id)

    if boarding is None or boarding.kind != BusStopPoint.BOARDING:
        raise InvalidSeatSelection(
            'That boarding point is not on this route.',
            detail={'boardingPointId': boarding_id},
        )
    if dropping is None or dropping.kind != BusStopPoint.DROPPING:
        raise InvalidSeatSelection(
            'That dropping point is not on this route.',
            detail={'droppingPointId': dropping_id},
        )

    return boarding, dropping


def _create_booking_row(data, fare):
    """
    Insert the booking, retrying if the generated reference already exists.

    A six-character body out of a 32-character alphabet collides rarely enough
    that three attempts is plenty, and the unique key is what actually decides.
    """
    for _ in range(3):
        try:
            with transaction.atomic():
                return Booking.objects.create(
                    reference=generate_pnr(),
                    mode=Booking.BUS,
                    user_id=data.get('userId'),
                    status=Booking.PENDING,
                    contact_email=data['contact']['email'],
                    contact_phone=data['contact']['phone'],
                    total_amount=fare['total'],
                    currency='INR',
                )
        except IntegrityError:
            continue

    raise SeatUnavailable('Could not allocate a booking reference. Try again.')


@transaction.atomic
def create_booking(data):
    """
    Write the booking as `pending`, holding whatever it sells - one transaction.

    No money is taken here. The payments module does that afterwards
    (`POST /api/payments/<mode>/<reference>/`) and moves the booking to
    `confirmed` when a payment goes through; if none does within the
    payment window it calls `release_booking` below and closes the
    booking as `failed`.

    Returns the objects the confirmation needs. Anything raised in here rolls
    the whole thing back, so a failed booking never leaves a seat half sold.
    """
    travel_date = data['date']
    if travel_date < timezone.localdate():
        raise InvalidSeatSelection(
            'That travel date has already passed.',
            detail={'date': travel_date.isoformat()},
        )

    trip = get_trip(data['tripId'])
    seat_ids = data['seatIds']
    passengers_by_seat = {
        passenger['seatId']: passenger for passenger in data['passengers']
    }

    seats = _resolve_seats(trip, seat_ids)
    _check_ladies_seats(seats, passengers_by_seat)
    boarding, dropping = _resolve_stop_points(
        trip, data['boardingPointId'], data['droppingPointId'],
    )

    already_sold = set(
        BusBookingSeat.objects
        .filter(seat__in=seats, travel_date=travel_date)
        .values_list('seat__seat_code', flat=True)
    )
    if already_sold:
        raise SeatUnavailable(detail={'seatIds': sorted(already_sold)})

    fare = calculate_fare([seat.price for seat in seats])

    booking = _create_booking_row(data, fare)

    bus_booking = BusBooking.objects.create(
        booking=booking,
        trip=trip,
        travel_date=travel_date,
        boarding_point=boarding,
        dropping_point=dropping,
        seat_total=fare['seat_total'],
        service_fee=fare['service_fee'],
        gst=fare['gst'],
    )

    try:
        # A savepoint, so a constraint violation rolls back cleanly instead of
        # leaving the outer transaction unusable.
        with transaction.atomic():
            BusBookingSeat.objects.bulk_create([
                BusBookingSeat(
                    booking=bus_booking,
                    seat=seat,
                    travel_date=travel_date,
                    passenger_name=passengers_by_seat[seat.seat_code]['name'].strip(),
                    passenger_age=passengers_by_seat[seat.seat_code]['age'],
                    passenger_gender=passengers_by_seat[seat.seat_code]['gender'],
                    fare=seat.price,
                )
                for seat in seats
            ])
    except IntegrityError:
        # uq_bus_seat_per_date fired: a booking that started before this one
        # took the row locks got there first. The transaction rolls back.
        raise SeatUnavailable(detail={'seatIds': seat_ids})

    BookingFareLine.objects.bulk_create([
        BookingFareLine(
            booking=booking, label='Seat fare',
            amount=fare['seat_total'], sort_order=0,
        ),
        BookingFareLine(
            booking=booking, label='Service fee',
            amount=fare['service_fee'], sort_order=1,
        ),
        BookingFareLine(
            booking=booking, label='GST', amount=fare['gst'], sort_order=2,
        ),
    ])

    # No payment row yet. The booking is held as `pending`; the payments
    # module takes the money (`POST /api/payments/<mode>/<reference>/`),
    # writes the payment row and moves the booking to `confirmed`.
    payment = None

    booked_seats = list(
        bus_booking.booked_seats.select_related('seat').order_by('pk')
    )

    return booking, bus_booking, trip, booked_seats, payment


def get_booking(reference, user_id):
    """
    Load a booking by its reference, for the account that made it.

    Scoped to `user_id` rather than trusting the reference alone: eight
    characters is short enough to guess, and a ticket carries a name, a phone
    number and an itinerary.
    """
    bus_booking = (
        BusBooking.objects
        .select_related('booking', 'boarding_point', 'dropping_point')
        .filter(
            booking__user_id=user_id,
            booking__reference=reference.strip().upper(),
        )
        .first()
    )
    if bus_booking is None:
        raise BookingNotFound()

    trip = get_trip(bus_booking.trip_id, active_only=False)
    booked_seats = list(
        bus_booking.booked_seats.select_related('seat').order_by('pk')
    )
    payment = (
        bus_booking.booking.payments
        .filter(status=Payment.SUCCESS).order_by('-pk').first()
        or bus_booking.booking.payments.order_by('-pk').first()
    )

    return bus_booking.booking, bus_booking, trip, booked_seats, payment

def list_bookings(user_id):
    """
    Every bus booking this account has made, newest first.

    Feeds the account's own ticket list. The related rows this pulls are
    exactly what `serialise_booking_summary` reads, so the list costs one
    query however many tickets come back.
    """
    return (
        BusBooking.objects
        .select_related(
            'booking', 'trip', 'trip__operator',
            'trip__origin_city', 'trip__destination_city',
        )
        .filter(booking__user_id=user_id)
        .order_by('-booking__booked_at')
    )


# ---------------------------------------------------------------------------
# Hooks for the payments module
#
# `payments.services` calls these by name on whichever module sold a booking,
# so every travel module exposes the same two. They are also what
# `cancel_booking` below uses, so an expired hold and a cancellation agree
# about what "back on sale" means.
# ---------------------------------------------------------------------------

def amount_due(booking_id):
    """What the payments module charges for a bus ticket: the whole fare."""
    return Booking.objects.values_list('total_amount', flat=True).get(pk=booking_id)


def release_booking(booking_id):
    """
    Put a booking's seats back on sale.

    Deleting the `bus_booking_seat` rows is what frees the seats: the row is
    the reservation, as `booked_seat_codes` explains, so leaving them behind
    would keep those seats sold forever. The passenger names go with them,
    which is the trade `uq_bus_seat_per_date` forces: it admits one row per
    seat and date whatever the booking's status, so a released seat cannot
    keep its row.
    """
    BusBookingSeat.objects.filter(booking_id=booking_id).delete()


@transaction.atomic
def cancel_booking(user_id, reference):
    """
    Cancel a bus ticket and put its seats back on sale.

    The account is part of the lookup rather than checked afterwards, so a
    reference belonging to someone else is simply not found.
    """
    bus_booking = (
        BusBooking.objects
        .select_related(
            'booking', 'trip', 'trip__operator',
            'trip__origin_city', 'trip__destination_city',
        )
        .filter(booking__reference=reference, booking__user_id=user_id)
        .first()
    )
    if bus_booking is None:
        raise BookingNotFound()

    ensure_cancellable(bus_booking.booking, bus_booking.travel_date)

    release_booking(bus_booking.pk)
    mark_cancelled(bus_booking.booking)

    return bus_booking
