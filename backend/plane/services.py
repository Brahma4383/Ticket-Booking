"""
The plane module's business rules.

Views stay thin: they validate input, call one function from here, and render
the result. Everything that touches more than one table - searching with
date-aware seat counts, pricing a fare brand, taking seats - lives here so it
can be reasoned about without a request in hand.
"""
import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from django.utils import timezone

from accounts.cancellation import ensure_cancellable, mark_cancelled
from accounts.exceptions import BookingNotFound

from plane.exceptions import (
    BookingNotFound,
    FlightNotFound,
    InvalidSelection,
    SeatUnavailable,
)
from plane.models import (
    Booking,
    BookingFareLine,
    FareBrand,
    Flight,
    FlightAddon,
    FlightBooking,
    FlightBookingAddon,
    FlightSeat,
    FlightStop,
    FlightTraveller,
    Payment,
)
from plane.serializers import serialise_trip


# ---------------------------------------------------------------------------
# Fare rules
#
# These mirror `calculatePlaneFare` in frontend/src/services/plane.services.ts
# so the summary can update as travellers and add-ons are picked without a
# round trip. The server recomputes on booking and its answer is the one that
# is charged - `POST /api/plane/quote/` exists so the two can be checked
# against each other.
# ---------------------------------------------------------------------------

TAX_RATE = Decimal('0.12')
FIXED_LEVY_PER_TRAVELLER = Decimal('236')
CONVENIENCE_FEE_PER_TRAVELLER = Decimal('149')

# Whole rupees, matching the `Math.round` the front end applies.
RUPEE = Decimal('1')


def calculate_fare(fare_brand, traveller_count, seat_total, addons):
    """
    Price a fare brand for a number of travellers.

    Taxes are a percentage of the base fare plus a flat levy a head; add-ons
    and the convenience fee are charged per traveller. Seats are priced from
    the seats actually assigned, which is why the total is passed in rather
    than recomputed here.

    Note that seat charges apply on every brand. `FareBrand.freeSeat` is
    advisory in the current front end - the seat step shows a notice on Saver
    but still charges - and the server matches it rather than quietly pricing
    differently. See the README.
    """
    if fare_brand is None or traveller_count == 0:
        zero = Decimal('0.00')
        return {
            'base_fare': zero, 'taxes': zero, 'seats': zero,
            'addons': zero, 'convenience_fee': zero, 'total': zero,
        }

    count = Decimal(traveller_count)
    base_fare = Decimal(fare_brand.price) * count
    taxes = (
        (base_fare * TAX_RATE).quantize(RUPEE, rounding=ROUND_HALF_UP)
        + FIXED_LEVY_PER_TRAVELLER * count
    )
    addon_total = sum(
        (Decimal(addon.price) * count for addon in addons), Decimal('0.00'),
    )
    convenience_fee = CONVENIENCE_FEE_PER_TRAVELLER * count
    seats = Decimal(seat_total or 0)

    return {
        'base_fare': base_fare,
        'taxes': taxes,
        'seats': seats,
        'addons': addon_total,
        'convenience_fee': convenience_fee,
        'total': base_fare + taxes + seats + addon_total + convenience_fee,
    }


# ---------------------------------------------------------------------------
# Reading inventory
# ---------------------------------------------------------------------------

def _flight_queryset():
    """
    Every flight read pulls the same related rows.

    Without the prefetches, serialising a page of results fires a query per
    flight for the stops and the fare brands.
    """
    return (
        Flight.objects
        .select_related(
            'airline',
            'origin_airport', 'origin_airport__city',
            'destination_airport', 'destination_airport__city',
        )
        .prefetch_related(
            Prefetch(
                'stops',
                queryset=(
                    FlightStop.objects
                    .select_related('airport', 'airport__city')
                    .order_by('sort_order')
                ),
            ),
            Prefetch('fares', queryset=FareBrand.objects.order_by('price')),
        )
    )


def _place_filter(prefix, place):
    """
    Match a place against an airport.

    The search box offers city names, but a traveller may well type the IATA
    code or the airport's own name, and all three identify the same terminal.
    `city__name` is what the home page actually sends.
    """
    place = place.strip()
    return (
        Q(**{f'{prefix}__city__name__iexact': place})
        | Q(**{f'{prefix}__code__iexact': place})
        | Q(**{f'{prefix}__name__iexact': place})
    )


def occupied_seat_codes(flight_ids, travel_date):
    """
    Seat codes already taken on `travel_date`, keyed by flight id.

    One query for however many flights are on the page. A seat is taken when a
    traveller on a booking for that date holds it - there is no per-date column
    on `flight_seat`, because the same seat is free again the next morning.

    The booking's status is deliberately not consulted, for the same reason it
    is not on the bus: the traveller row *is* the reservation, and releasing a
    seat means clearing it.
    """
    rows = (
        FlightTraveller.objects
        .filter(
            seat__flight_id__in=flight_ids,
            booking__travel_date=travel_date,
            seat__isnull=False,
        )
        .values_list('seat__flight_id', 'seat__seat_code')
    )

    taken = {}
    for flight_id, seat_code in rows:
        taken.setdefault(flight_id, set()).add(seat_code)
    return taken


def search_flights(from_place, to_place, travel_date):
    """
    Flights between two places, with the seats left for that date.

    A flight is listed whatever its seat count - an airline still shows a full
    flight, and the results card says how few are left. Whether a party fits
    is settled at booking.
    """
    flights = list(
        _flight_queryset()
        .filter(is_active=True)
        .filter(_place_filter('origin_airport', from_place))
        .filter(_place_filter('destination_airport', to_place))
        .prefetch_related(
            Prefetch(
                'seats',
                queryset=FlightSeat.objects.only('id', 'flight_id', 'seat_code'),
                to_attr='all_seats',
            ),
        )
        .order_by('departure_time')
    )

    taken = occupied_seat_codes([flight.pk for flight in flights], travel_date)

    return [
        serialise_trip(
            flight,
            seats_left=len(flight.all_seats) - len(taken.get(flight.pk, set())),
        )
        for flight in flights
    ]


def get_flight(flight_id, *, active_only=True):
    """
    One flight with its related rows.

    `active_only` is on for anything that leads to a sale and off when reading
    a ticket back: a service withdrawn from the schedule still has to print
    the tickets already issued against it.
    """
    flights = _flight_queryset()
    if active_only:
        flights = flights.filter(is_active=True)

    flight = flights.filter(pk=flight_id).first()
    if flight is None:
        raise FlightNotFound()
    return flight


def cabin(flight, travel_date):
    """Every seat on the flight, plus the codes taken on `travel_date`."""
    seats = list(flight.seats.all().order_by('row_no', 'seat_column'))
    taken = occupied_seat_codes([flight.pk], travel_date).get(flight.pk, set())
    return seats, taken


def get_fare_brand(flight, code):
    """
    The fare brand a booking sells under.

    Brands belong to a flight, so a code that exists on another flight is
    still not valid here.
    """
    brand = next(
        (brand for brand in flight.fares.all()
         if brand.code.casefold() == code.strip().casefold()),
        None,
    )
    if brand is None:
        raise InvalidSelection(
            'That fare is not offered on this flight.',
            detail={'fareBrandCode': code},
        )
    return brand


def get_addons(codes):
    """
    The add-ons named by code, in the order the catalogue lists them.

    An unknown or withdrawn code is refused rather than silently dropped - a
    traveller who ticked a meal should not be charged for a ticket without one.
    """
    wanted = [code.strip().casefold() for code in codes]
    if not wanted:
        return []

    addons = list(
        FlightAddon.objects.filter(code__in=wanted, is_active=True).order_by('id')
    )

    missing = sorted(set(wanted) - {addon.code for addon in addons})
    if missing:
        raise InvalidSelection(
            'That add-on is not available.', detail={'addOns': missing},
        )
    return addons


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

# No I or O: a traveller reads this off a screen and into a phone call. The
# digits stay, which is what the front end's own alphabet does.
REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'


def generate_reference():
    """`S7YH3U` - the six-character shape the ticket screen already prints."""
    return ''.join(secrets.choice(REFERENCE_ALPHABET) for _ in range(6))


def generate_eticket(airline_code):
    """`6E 123-0123456789`, the way the front end's mock formats one."""
    prefix = secrets.randbelow(900) + 100
    rest = ''.join(secrets.choice('0123456789') for _ in range(10))
    return f'{airline_code} {prefix}-{rest}'


def _resolve_seats(flight, seat_codes):
    """
    Look up and lock the requested seats.

    `select_for_update` holds the rows for the rest of the transaction, so two
    people checking out the same seat at the same time are serialised rather
    than both passing the availability check.

    Worth knowing: unlike the bus schema, `flight_traveller` carries no unique
    key over (seat, date) - the travel date lives on the parent booking, which
    a single-table constraint cannot reach. These locks are therefore the only
    thing preventing a double sale, not a second line of defence. See the
    README.
    """
    if not seat_codes:
        return {}

    seats = {
        seat.seat_code: seat
        for seat in FlightSeat.objects
        .select_for_update()
        .filter(flight=flight, seat_code__in=seat_codes)
    }

    missing = [code for code in seat_codes if code not in seats]
    if missing:
        raise InvalidSelection(
            'Some of those seats are not on this aircraft.',
            detail={'seatIds': missing},
        )
    return seats


def _create_booking_row(data, fare):
    """
    Insert the booking, retrying if the generated reference already exists.

    Six characters out of a 34-character alphabet collide rarely enough that
    three attempts is plenty, and the unique key is what actually decides.
    """
    for _ in range(3):
        try:
            with transaction.atomic():
                return Booking.objects.create(
                    reference=generate_reference(),
                    mode=Booking.PLANE,
                    user_id=data.get('userId'),
                    status=Booking.CONFIRMED,
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
    Take payment, take the seats, issue the tickets - one transaction.

    Returns the objects the confirmation needs. Anything raised in here rolls
    the whole thing back, so a failed booking never leaves a seat half sold.
    """
    travel_date = data['date']
    if travel_date < timezone.localdate():
        raise InvalidSelection(
            'That travel date has already passed.',
            detail={'date': travel_date.isoformat()},
        )

    flight = get_flight(data['flightId'])
    fare_brand = get_fare_brand(flight, data['fareBrandCode'])
    addons = get_addons(data['addOns'])
    travellers = data['travellers']
    seat_by_traveller = data['seatByTraveller']

    seat_codes = [seat_by_traveller[t['id']]
                  for t in travellers if t['id'] in seat_by_traveller]
    seats = _resolve_seats(flight, seat_codes)

    already_taken = sorted(
        occupied_seat_codes([flight.pk], travel_date).get(flight.pk, set())
        & set(seat_codes)
    )
    if already_taken:
        raise SeatUnavailable(detail={'seatIds': already_taken})

    seat_total = sum(
        (Decimal(seats[code].price) for code in seat_codes), Decimal('0.00'),
    )
    fare = calculate_fare(fare_brand, len(travellers), seat_total, addons)

    booking = _create_booking_row(data, fare)

    flight_booking = FlightBooking.objects.create(
        booking=booking,
        flight=flight,
        fare_brand=fare_brand,
        travel_date=travel_date,
        base_fare=fare['base_fare'],
        taxes=fare['taxes'],
        seat_total=fare['seats'],
        addon_total=fare['addons'],
        convenience_fee=fare['convenience_fee'],
    )

    try:
        # A savepoint, so a constraint violation rolls back cleanly instead of
        # leaving the outer transaction unusable.
        with transaction.atomic():
            FlightTraveller.objects.bulk_create([
                FlightTraveller(
                    booking=flight_booking,
                    traveller_type=traveller['type'],
                    title=traveller['title'],
                    first_name=traveller['firstName'].strip(),
                    last_name=traveller['lastName'].strip(),
                    date_of_birth=traveller['dateOfBirth'],
                    seat=seats.get(seat_by_traveller.get(traveller['id'])),
                    seat_price=(
                        seats[seat_by_traveller[traveller['id']]].price
                        if traveller['id'] in seat_by_traveller
                        else Decimal('0.00')
                    ),
                    eticket_number=generate_eticket(flight.airline.code),
                    sort_order=index,
                )
                for index, traveller in enumerate(travellers)
            ])
    except IntegrityError:
        raise SeatUnavailable(detail={'seatIds': seat_codes})

    if addons:
        FlightBookingAddon.objects.bulk_create([
            FlightBookingAddon(
                booking=flight_booking,
                addon=addon,
                # Charged once per traveller.
                quantity=len(travellers),
                amount=Decimal(addon.price) * len(travellers),
            )
            for addon in addons
        ])

    BookingFareLine.objects.bulk_create([
        line for line in [
            BookingFareLine(
                booking=booking, label='Base fare',
                amount=fare['base_fare'], sort_order=0,
            ),
            BookingFareLine(
                booking=booking, label='Taxes and surcharges',
                amount=fare['taxes'], sort_order=1,
            ),
            BookingFareLine(
                booking=booking, label='Seats',
                amount=fare['seats'], sort_order=2,
            ) if fare['seats'] else None,
            BookingFareLine(
                booking=booking, label='Add-ons',
                amount=fare['addons'], sort_order=3,
            ) if fare['addons'] else None,
            BookingFareLine(
                booking=booking, label='Convenience fee',
                amount=fare['convenience_fee'], sort_order=4,
            ),
        ] if line is not None
    ])

    payment = Payment.objects.create(
        booking=booking,
        method=data['paymentMethodId'],
        instrument=data['paymentMethod'],
        amount=fare['total'],
        status=Payment.SUCCESS,
        transaction_ref=f'TXN{secrets.token_hex(8).upper()}',
        paid_at=timezone.now(),
    )

    # The trip goes onto the ticket as it was sold, so the seat count is the
    # one after this booking took its seats.
    all_seats, taken = cabin(flight, travel_date)
    trip = serialise_trip(flight, seats_left=len(all_seats) - len(taken))

    flight_booking.flight = flight
    return (
        booking, flight_booking, trip,
        list(flight_booking.travellers.select_related('seat').all()),
        list(flight_booking.addons.select_related('addon').all()),
        payment,
    )


def get_booking(reference, user_id):
    """
    Load a booking by its reference, for the account that made it.

    Scoped to `user_id` rather than trusting the reference alone: eight
    characters is short enough to guess, and a ticket carries a name, a phone
    number and an itinerary.
    """
    flight_booking = (
        FlightBooking.objects
        .select_related('booking', 'fare_brand')
        .filter(
            booking__user_id=user_id,
            booking__reference=reference.strip().upper(),
        )
        .first()
    )
    if flight_booking is None:
        raise BookingNotFound()

    flight = get_flight(flight_booking.flight_id, active_only=False)
    flight_booking.flight = flight

    all_seats, taken = cabin(flight, flight_booking.travel_date)
    trip = serialise_trip(flight, seats_left=len(all_seats) - len(taken))

    payment = (
        flight_booking.booking.payments
        .filter(status=Payment.SUCCESS).order_by('-pk').first()
        or flight_booking.booking.payments.order_by('-pk').first()
    )

    return (
        flight_booking.booking, flight_booking, trip,
        list(flight_booking.travellers.select_related('seat').all()),
        list(flight_booking.addons.select_related('addon').all()),
        payment,
    )

def list_bookings(user_id):
    """
    Every flight booking this account has made, newest first.

    Feeds the account's own ticket list. The related rows this pulls are
    exactly what `serialise_booking_summary` reads, so the list costs one
    query however many tickets come back.
    """
    return (
        FlightBooking.objects
        .select_related(
            'booking', 'flight', 'flight__airline',
            'flight__origin_airport', 'flight__destination_airport',
        )
        .filter(booking__user_id=user_id)
        .order_by('-booking__booked_at')
    )


@transaction.atomic
def cancel_booking(user_id, reference):
    """
    Cancel a flight booking and free the seats its travellers held.

    Clearing `seat` is what releases them, for the reason `occupied_seat_codes`
    gives: the traveller row holding a seat *is* the reservation. The
    travellers themselves stay, so a cancelled ticket still lists who was
    flying.
    """
    flight_booking = (
        FlightBooking.objects
        .select_related(
            'booking', 'flight', 'flight__airline',
            'flight__origin_airport', 'flight__destination_airport',
        )
        .filter(booking__reference=reference, booking__user_id=user_id)
        .first()
    )
    if flight_booking is None:
        raise BookingNotFound()

    ensure_cancellable(flight_booking.booking, flight_booking.travel_date)

    FlightTraveller.objects.filter(
        booking=flight_booking, seat__isnull=False,
    ).update(seat=None)

    mark_cancelled(flight_booking.booking)

    return flight_booking
