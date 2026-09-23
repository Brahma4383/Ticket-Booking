"""
The cab module's business rules.

Views stay thin: they validate input, call one function from here, and render
the result. Everything that touches more than one table - estimating a trip,
pricing a category off its rate card, taking a booking - lives here so it can
be reasoned about without a request in hand.
"""
import re
import secrets
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from accounts.cancellation import ensure_cancellable, mark_cancelled
from accounts.exceptions import BookingNotFound

from cab.exceptions import (
    BookingNotFound,
    CategoryNotFound,
    InvalidSelection,
    NoRateCard,
)
from cab.models import (
    AIRPORT,
    LOCAL,
    OUTSTATION,
    Booking,
    BookingFareLine,
    CabBooking,
    CabBookingExtra,
    CabCategory,
    CabExtra,
    CabRateCard,
    Payment,
)


# ---------------------------------------------------------------------------
# Trip estimation
#
# There is no routing engine here and no distance table in the schema, so the
# distance is synthesised from the two addresses. It is *deterministic*: the
# same pickup and drop always estimate the same trip, so a quote does not
# change between the results page and the payment step, and a reload does not
# reprice the journey.
#
# This is the seam a real distance service plugs into. Replace `estimate_trip`
# with a call to one and nothing else in this module has to change - every
# caller already treats the estimate as something the server decides.
# ---------------------------------------------------------------------------

AIRPORT_WORDS = re.compile(r'airport|terminal|t1|t2|t3', re.IGNORECASE)

# Door to door once traffic and halts are counted.
AVERAGE_SPEED_KMH = 45

# Distance bands per kind of journey, mirroring the front end's own mock.
DISTANCE_BANDS = {
    AIRPORT: (8, 45),
    LOCAL: (5, 30),
    OUTSTATION: (60, 520),
}

NIGHT_FROM_HOUR = 22
NIGHT_TO_HOUR = 6


def _stable_hash(value):
    """
    FNV-1a, the same function the front end's mock uses.

    Python's own `hash()` is salted per process, so it would give a different
    distance after every restart - the one thing this must not do.
    """
    digest = 2166136261
    for char in value:
        digest ^= ord(char)
        digest = (digest * 16777619) & 0xFFFFFFFF
    return digest


def classify_trip(pickup, drop):
    """
    What kind of journey the route implies, which drives how fares are built.

    An airport at either end is an airport transfer whatever else is true.
    The same place at both ends reads as a local run rather than an intercity
    one.
    """
    if AIRPORT_WORDS.search(pickup) or AIRPORT_WORDS.search(drop):
        return AIRPORT
    if pickup.strip().casefold() == drop.strip().casefold():
        return LOCAL
    return OUTSTATION


def is_night_trip(pickup_time):
    """A night allowance applies between 22:00 and 06:00."""
    return pickup_time.hour >= NIGHT_FROM_HOUR or pickup_time.hour < NIGHT_TO_HOUR


def estimate_trip(pickup, drop, pickup_time):
    """
    Distance, duration, kind of journey and whether it runs overnight.

    See the note above: the distance is a stable stand-in, not a measurement.
    """
    trip_type = classify_trip(pickup, drop)
    low, high = DISTANCE_BANDS[trip_type]

    seed = _stable_hash(f'cab|{pickup.strip().casefold()}|{drop.strip().casefold()}')
    distance_km = low + seed % (high - low + 1)

    return {
        'distance_km': distance_km,
        'duration_minutes': round(distance_km / AVERAGE_SPEED_KMH * 60),
        'trip_type': trip_type,
        'night_trip': is_night_trip(pickup_time),
    }


def pickup_datetime(date, time):
    """
    The two form fields as one instant.

    `cab_booking.pickup_at` is a DATETIME, and with USE_TZ on Django needs an
    aware value - a naive one would be stored as if it were UTC and shift the
    pickup by hours.
    """
    return timezone.make_aware(datetime.combine(date, time))


# ---------------------------------------------------------------------------
# Pricing
#
# What the rate card owns: the per-km rate, the minimum, the extra-km rate,
# the driver allowance and the night charge. What stays here: the rules for
# *when* the allowance and the toll estimate apply, and the tax and advance
# rates, none of which vary by category.
# ---------------------------------------------------------------------------

GST_RATE = Decimal('0.05')
# Advance taken online; the balance is settled with the driver.
ADVANCE_SHARE = Decimal('0.2')
# Rough tolls and state permit on an intercity run, per kilometre. Estimated,
# and settled against actual receipts.
TOLL_PER_KM = Decimal('2.4')
# Below this an outstation run gets the driver home the same night.
OVERNIGHT_DISTANCE_KM = 250

RUPEE = Decimal('1')
TEN_RUPEES = Decimal('10')


def _round_to_ten(amount):
    """Fares are quoted in tens, as the front end's mock rounds them."""
    return (Decimal(amount) / TEN_RUPEES).quantize(
        RUPEE, rounding=ROUND_HALF_UP,
    ) * TEN_RUPEES


def active_rate_card(category, trip_type, on_date):
    """
    The card in force for a category and journey on a date.

    A card with no `valid_from` is open-ended at the start and one with no
    `valid_to` never expires. Where several apply, the one that started most
    recently wins - that is what loading a new card ahead of time means.
    """
    return (
        CabRateCard.objects
        .filter(category=category, trip_type=trip_type)
        .filter(Q(valid_from__isnull=True) | Q(valid_from__lte=on_date))
        .filter(Q(valid_to__isnull=True) | Q(valid_to__gte=on_date))
        .order_by('-valid_from')
        .first()
    )


def build_inclusions(included_km, category, trip_type):
    """
    What the fare covers, as the results card lists it.

    The schema has no column for this - it is copy derived from the rate card,
    not data - so it is built here to keep the wording in one place rather
    than duplicated in the front end.
    """
    inclusions = [
        f'{included_km} km included',
        'Fuel and driver charges',
        'AC cab' if category.code == CabCategory.HATCHBACK
        else 'AC cab with charging point',
    ]
    if trip_type == OUTSTATION:
        inclusions.append('One way drop, no return fare')
    return inclusions


EXCLUSIONS = [
    'Tolls and state permit',
    'Parking charges',
    'Waiting beyond 45 minutes',
]


def eta_minutes_for(category, trip_type):
    """
    Typical wait at pickup.

    Invented the same way `inclusions` is: there is no column for it and no
    dispatch system behind this. Derived from the category so a cab type
    always quotes the same wait, with airport pickups a little longer because
    of the terminal approach.
    """
    base = 5 + (category.pk * 7) % 16
    return base + (5 if trip_type == AIRPORT else 0)


def price_category(category, rate_card, estimate):
    """
    Everything that makes up one CabOption.

    The base fare covers the included kilometres, which is the greater of the
    trip distance and the card's minimum - a 40 km run on a 100 km minimum
    pays for 100.
    """
    included_km = max(estimate['distance_km'], rate_card.minimum_km)

    return {
        'category': category,
        'rate_card': rate_card,
        'base_fare': _round_to_ten(
            Decimal(included_km) * Decimal(rate_card.per_km_rate)
        ),
        'included_km': included_km,
        'extra_km_rate': rate_card.extra_km_rate,
        'inclusions': build_inclusions(
            included_km, category, estimate['trip_type'],
        ),
        'exclusions': list(EXCLUSIONS),
        'cancellation': rate_card.cancellation_note or '',
        'eta_minutes': eta_minutes_for(category, estimate['trip_type']),
    }


def search_cabs(pickup, drop, date, time):
    """
    Every cab type priced for this journey, cheapest first.

    A category with no rate card in force is left out rather than quoted at
    zero: it is not on sale for this journey, and a card that cannot be priced
    is an operational gap, not something to paper over.
    """
    estimate = estimate_trip(pickup, drop, time)

    options = []
    for category in CabCategory.objects.filter(is_active=True).order_by('id'):
        rate_card = active_rate_card(category, estimate['trip_type'], date)
        if rate_card is None:
            continue
        options.append(price_category(category, rate_card, estimate))

    options.sort(key=lambda option: option['base_fare'])
    return estimate, options


def get_category(code):
    category = (
        CabCategory.objects
        .filter(code__iexact=code.strip(), is_active=True)
        .first()
    )
    if category is None:
        raise CategoryNotFound(detail={'categoryCode': code})
    return category


def get_extras(codes):
    """
    The extras named by code, in the order the catalogue lists them.

    An unknown or withdrawn code is refused rather than silently dropped - a
    passenger who ticked a child seat should not arrive to a car without one.
    """
    wanted = [code.strip() for code in codes]
    if not wanted:
        return []

    extras = list(
        CabExtra.objects.filter(code__in=wanted, is_active=True).order_by('id')
    )

    missing = sorted(set(wanted) - {extra.code for extra in extras})
    if missing:
        raise InvalidSelection(
            'That extra is not available.', detail={'extras': missing},
        )
    return extras


def calculate_fare(option, estimate, extras):
    """
    Price a trip.

    GST covers the whole quoted fare including the toll estimate, which is how
    the front end's summary adds it up. The advance is a share of the total
    rounded to tens; the driver collects the rest.
    """
    if option is None:
        zero = Decimal('0.00')
        return {
            'base_fare': zero, 'extras': zero, 'driver_allowance': zero,
            'tolls_state_tax': zero, 'night_charge': zero, 'gst': zero,
            'total': zero, 'pay_now': zero, 'pay_to_driver': zero,
        }

    rate_card = option['rate_card']
    extras_total = sum(
        (Decimal(extra.price) for extra in extras), Decimal('0.00'),
    )

    # A long outstation run keeps the driver overnight; a short one gets him
    # home the same day.
    driver_allowance = (
        Decimal(rate_card.driver_allowance)
        if estimate['trip_type'] == OUTSTATION
        and estimate['distance_km'] > OVERNIGHT_DISTANCE_KM
        else Decimal('0.00')
    )
    tolls_state_tax = (
        _round_to_ten(Decimal(estimate['distance_km']) * TOLL_PER_KM)
        if estimate['trip_type'] == OUTSTATION else Decimal('0.00')
    )
    night_charge = (
        Decimal(rate_card.night_charge) if estimate['night_trip']
        else Decimal('0.00')
    )

    taxable = (
        Decimal(option['base_fare']) + extras_total
        + driver_allowance + tolls_state_tax + night_charge
    )
    gst = (taxable * GST_RATE).quantize(RUPEE, rounding=ROUND_HALF_UP)
    total = taxable + gst
    pay_now = _round_to_ten(total * ADVANCE_SHARE)

    return {
        'base_fare': Decimal(option['base_fare']),
        'extras': extras_total,
        'driver_allowance': driver_allowance,
        'tolls_state_tax': tolls_state_tax,
        'night_charge': night_charge,
        'gst': gst,
        'total': total,
        'pay_now': pay_now,
        'pay_to_driver': total - pay_now,
    }


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

# Unambiguous characters only: no O/0, no I/1. A passenger reads this off a
# screen and into a phone call to the driver.
BOOKING_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
BOOKING_ID_PREFIX = 'CB'


def generate_booking_id():
    """`CBCMBFRE` - the shape the trip voucher already prints."""
    body = ''.join(secrets.choice(BOOKING_ID_ALPHABET) for _ in range(6))
    return f'{BOOKING_ID_PREFIX}{body}'


def _create_booking_row(data, fare):
    """
    Insert the booking, retrying if the generated id already exists.

    A six-character body out of a 32-character alphabet collides rarely enough
    that three attempts is plenty, and the unique key is what actually decides.
    """
    for _ in range(3):
        try:
            with transaction.atomic():
                return Booking.objects.create(
                    reference=generate_booking_id(),
                    mode=Booking.CAB,
                    user_id=data.get('userId'),
                    status=Booking.CONFIRMED,
                    contact_email=data['details']['email'],
                    contact_phone=data['details']['phone'],
                    total_amount=fare['total'],
                    currency='INR',
                )
        except IntegrityError:
            continue

    raise NoRateCard('Could not allocate a booking id. Try again.')


@transaction.atomic
def create_booking(data):
    """
    Take the advance, record the trip, issue the voucher - one transaction.

    Returns the objects the confirmation needs. Anything raised in here rolls
    the whole thing back.

    There is no inventory to hold: a cab booking is a dispatch request, not a
    seat, so nothing is taken from a pool and nothing can be double-sold. The
    vehicle is assigned later, which is why `driver_name` and friends start
    NULL.
    """
    details = data['details']
    pickup_at = pickup_datetime(data['date'], data['time'])

    if pickup_at < timezone.now():
        raise InvalidSelection(
            'That pickup time has already passed.',
            detail={'date': data['date'].isoformat(),
                    'time': data['time'].strftime('%H:%M')},
        )

    category = get_category(data['categoryCode'])
    extras = get_extras(data['extras'])

    estimate = estimate_trip(
        details['pickupAddress'], details['dropAddress'], data['time'],
    )
    rate_card = active_rate_card(category, estimate['trip_type'], data['date'])
    if rate_card is None:
        raise NoRateCard(detail={
            'categoryCode': category.code, 'tripType': estimate['trip_type'],
        })

    option = price_category(category, rate_card, estimate)
    fare = calculate_fare(option, estimate, extras)

    booking = _create_booking_row(data, fare)

    cab_booking = CabBooking.objects.create(
        booking=booking,
        category=category,
        rate_card=rate_card,
        trip_type=estimate['trip_type'],
        pickup_address=details['pickupAddress'].strip(),
        drop_address=details['dropAddress'].strip(),
        pickup_at=pickup_at,
        distance_km=estimate['distance_km'],
        duration_minutes=estimate['duration_minutes'],
        is_night_trip=estimate['night_trip'],
        passenger_name=details['name'].strip(),
        passenger_phone=details['phone'],
        base_fare=fare['base_fare'],
        extras_total=fare['extras'],
        driver_allowance=fare['driver_allowance'],
        tolls_state_tax=fare['tolls_state_tax'],
        night_charge=fare['night_charge'],
        gst=fare['gst'],
        pay_now=fare['pay_now'],
        pay_to_driver=fare['pay_to_driver'],
    )

    if extras:
        CabBookingExtra.objects.bulk_create([
            CabBookingExtra(
                booking=cab_booking, extra=extra, amount=extra.price,
            )
            for extra in extras
        ])

    BookingFareLine.objects.bulk_create([
        line for line in [
            BookingFareLine(
                booking=booking,
                label=f'{option["included_km"]} km base fare',
                amount=fare['base_fare'], sort_order=0,
            ),
            BookingFareLine(
                booking=booking, label='Extras',
                amount=fare['extras'], sort_order=1,
            ) if fare['extras'] else None,
            BookingFareLine(
                booking=booking, label='Driver allowance',
                amount=fare['driver_allowance'], sort_order=2,
            ) if fare['driver_allowance'] else None,
            BookingFareLine(
                booking=booking, label='Tolls and state tax (estimated)',
                amount=fare['tolls_state_tax'], sort_order=3,
            ) if fare['tolls_state_tax'] else None,
            BookingFareLine(
                booking=booking, label='Night charge',
                amount=fare['night_charge'], sort_order=4,
            ) if fare['night_charge'] else None,
            BookingFareLine(
                booking=booking, label='GST', amount=fare['gst'], sort_order=5,
            ),
        ] if line is not None
    ])

    # Only the advance is taken online; the driver collects the balance, which
    # is why this payment is `pay_now` and not the total.
    payment = Payment.objects.create(
        booking=booking,
        method=data['paymentMethodId'],
        instrument=data['paymentMethod'],
        amount=fare['pay_now'],
        status=Payment.SUCCESS,
        transaction_ref=f'TXN{secrets.token_hex(8).upper()}',
        paid_at=timezone.now(),
    )

    return (
        booking, cab_booking, option,
        list(cab_booking.extras.select_related('extra').all()),
        payment,
    )


def get_booking(reference, user_id):
    """
    Load a booking by its reference, for the account that made it.

    Scoped to `user_id` rather than trusting the reference alone: eight
    characters is short enough to guess, and a ticket carries a name, a phone
    number and an itinerary.
    """
    cab_booking = (
        CabBooking.objects
        .select_related('booking', 'category', 'rate_card')
        .filter(
            booking__user_id=user_id,
            booking__reference=reference.strip().upper(),
        )
        .first()
    )
    if cab_booking is None:
        raise BookingNotFound()

    # The option as it was sold. The rate card may have been replaced since,
    # so the fare comes off the booking rather than being re-derived; what is
    # rebuilt here is only the descriptive part the voucher prints.
    included_km = max(
        cab_booking.distance_km,
        cab_booking.rate_card.minimum_km if cab_booking.rate_card_id else 0,
    )
    option = {
        'category': cab_booking.category,
        'rate_card': cab_booking.rate_card,
        'base_fare': cab_booking.base_fare,
        'included_km': included_km,
        'extra_km_rate': (
            cab_booking.rate_card.extra_km_rate if cab_booking.rate_card_id
            else Decimal('0.00')
        ),
        'inclusions': build_inclusions(
            included_km, cab_booking.category, cab_booking.trip_type,
        ),
        'exclusions': list(EXCLUSIONS),
        'cancellation': (
            cab_booking.rate_card.cancellation_note or ''
            if cab_booking.rate_card_id else ''
        ),
        'eta_minutes': eta_minutes_for(
            cab_booking.category, cab_booking.trip_type,
        ),
    }

    payment = (
        cab_booking.booking.payments
        .filter(status=Payment.SUCCESS).order_by('-pk').first()
        or cab_booking.booking.payments.order_by('-pk').first()
    )

    return (
        cab_booking.booking, cab_booking, option,
        list(cab_booking.extras.select_related('extra').all()),
        payment,
    )

def list_bookings(user_id):
    """
    Every cab booking this account has made, newest first.

    Feeds the account's own ticket list. The related rows this pulls are
    exactly what `serialise_booking_summary` reads, so the list costs one
    query however many tickets come back.
    """
    return (
        CabBooking.objects
        .select_related(
            'booking', 'category',
        )
        .filter(booking__user_id=user_id)
        .order_by('-booking__booked_at')
    )


@transaction.atomic
def cancel_booking(user_id, reference):
    """
    Cancel a cab booking.

    Nothing to release: a cab is quoted from a rate card rather than sold out
    of a fixed pool, and a vehicle is only assigned two hours before pickup.
    The date the policy is measured against is the pickup day.
    """
    cab_booking = (
        CabBooking.objects
        .select_related('booking', 'category', 'rate_card')
        .filter(booking__reference=reference, booking__user_id=user_id)
        .first()
    )
    if cab_booking is None:
        raise BookingNotFound()

    ensure_cancellable(
        cab_booking.booking, timezone.localtime(cab_booking.pickup_at).date(),
    )

    mark_cancelled(cab_booking.booking)

    return cab_booking
