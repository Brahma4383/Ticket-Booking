"""
The hotel module's business rules.

Views stay thin: they validate input, call one function from here, and render
the result. Everything that touches more than one table - searching a city for
a date range, pricing a stay, taking the inventory - lives here so it can be
reasoned about without a request in hand.
"""
import secrets
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.utils import timezone

from accounts.cancellation import ensure_cancellable, mark_cancelled
from accounts.exceptions import BookingNotFound

from hotel.exceptions import (
    BookingNotFound,
    InvalidSelection,
    PropertyNotFound,
    RoomsUnavailable,
)
from hotel.models import (
    Booking,
    BookingFareLine,
    HotelBooking,
    HotelGuest,
    Payment,
    Property,
    RatePlan,
    RoomInventory,
    RoomType,
)
from hotel.serializers import serialise_property, serialise_room


# ---------------------------------------------------------------------------
# Fare rules
#
# These mirror `calculateStayFare` in frontend/src/services/hotel.services.ts
# so the summary can update as rooms and nights change without a round trip.
# The server recomputes on booking and its answer is the one that is charged -
# `POST /api/hotel/quote/` exists so the two can be checked against each other.
# ---------------------------------------------------------------------------

PROPERTY_FEE_PER_NIGHT = Decimal('99')

# India taxes stays at 12% below Rs 7,500 a night and 18% at or above. The
# slab is decided by the nightly rate, not by the total - two cheap nights do
# not push a booking into the higher band.
TAX_SLAB_THRESHOLD = Decimal('7500')
LOW_TAX_PERCENT = Decimal('12')
HIGH_TAX_PERCENT = Decimal('18')

RUPEE = Decimal('1')


def tax_rate_for(price_per_night):
    return (
        HIGH_TAX_PERCENT if Decimal(price_per_night) >= TAX_SLAB_THRESHOLD
        else LOW_TAX_PERCENT
    )


def nights_between(check_in, check_out):
    """
    Whole nights between two dates.

    A stay is the nights slept, not the days touched: arriving Monday and
    leaving Wednesday is two nights.
    """
    return (check_out - check_in).days


def stay_dates(check_in, check_out):
    """
    Every night of the stay, as dates.

    Check-out day is not a night - the room is wanted from check-in up to but
    not including it, which is exactly the range inventory is held on.
    """
    return [
        check_in + timedelta(days=offset)
        for offset in range(nights_between(check_in, check_out))
    ]


def calculate_fare(rate_plan, nights, rooms):
    """Price a rate plan for a number of nights and rooms."""
    if rate_plan is None or nights <= 0 or rooms <= 0:
        zero = Decimal('0.00')
        return {
            'nights': max(nights, 0), 'rooms': max(rooms, 0),
            'room_total': zero, 'taxes': zero, 'tax_rate_percent': zero,
            'property_fee': zero, 'total': zero,
        }

    room_total = Decimal(rate_plan.price_per_night) * nights * rooms
    tax_rate_percent = tax_rate_for(rate_plan.price_per_night)
    taxes = (room_total * tax_rate_percent / Decimal('100')).quantize(
        RUPEE, rounding=ROUND_HALF_UP,
    )
    property_fee = PROPERTY_FEE_PER_NIGHT * nights * rooms

    return {
        'nights': nights,
        'rooms': rooms,
        'room_total': room_total,
        'taxes': taxes,
        'tax_rate_percent': tax_rate_percent,
        'property_fee': property_fee,
        'total': room_total + taxes + property_fee,
    }


# ---------------------------------------------------------------------------
# Reading inventory
# ---------------------------------------------------------------------------

def _property_queryset():
    """
    Every property read pulls the same related rows.

    Without the prefetches, serialising a page of results fires a query per
    property for the amenities, and per room for its amenities and plans.
    """
    return (
        Property.objects
        .select_related('city')
        .prefetch_related(
            'property_amenities__amenity',
            Prefetch(
                'room_types',
                queryset=(
                    RoomType.objects
                    .prefetch_related(
                        'room_amenities__amenity',
                        Prefetch(
                            'rate_plans',
                            queryset=RatePlan.objects.order_by('price_per_night'),
                        ),
                    )
                    .order_by('id')
                ),
            ),
        )
    )


def rooms_left_by_type(room_type_ids, check_in, check_out):
    """
    How many rooms of each type can be held for the whole stay.

    The answer is the smallest count across the nights: a room free on three
    nights of four cannot take a four-night booking. A night with no
    `room_inventory` row means nothing is loaded for it, which is treated as
    nothing available rather than as unlimited - the safe reading, and the one
    that stops a stay being sold on a date nobody has opened yet.
    """
    nights = stay_dates(check_in, check_out)
    if not nights or not room_type_ids:
        return {}

    rows = (
        RoomInventory.objects
        .filter(room_type_id__in=room_type_ids, stay_date__in=nights)
        .values_list('room_type_id', 'stay_date', 'rooms_available')
    )

    by_type = {}
    for room_type_id, _, available in rows:
        by_type.setdefault(room_type_id, []).append(available)

    return {
        room_type_id: (
            min(counts) if len(counts) == len(nights) else 0
        )
        for room_type_id, counts in by_type.items()
    }


def search_stays(city, check_in, check_out, guests):
    """
    Properties in a city with something bookable for the whole stay.

    A property is left out when no room of any type is free for every night -
    it has nothing to sell, and a results card that cannot be clicked is worse
    than no card. Room types are all returned, availability and all, because
    the room step already marks the ones too small for the party rather than
    hiding them.
    """
    properties = list(
        _property_queryset()
        .filter(is_active=True, city__name__iexact=city.strip())
        .order_by('-review_score', 'name')
    )

    room_type_ids = [
        room.pk for stay in properties for room in stay.room_types.all()
    ]
    left = rooms_left_by_type(room_type_ids, check_in, check_out)

    results = []
    for stay in properties:
        rooms = [
            serialise_room(room, left.get(room.pk, 0))
            for room in stay.room_types.all()
        ]
        bookable = [
            room for room in rooms
            if room['roomsLeft'] > 0 and room['ratePlans']
        ]
        if not bookable:
            continue

        # "from Rs x" should quote a rate that can actually be booked.
        results.append(serialise_property(stay, rooms) | {
            'fromPricePerNight': min(
                plan['pricePerNight']
                for room in bookable for plan in room['ratePlans']
            ),
        })

    return results


def get_property(property_id, *, active_only=True):
    """
    One property with its rooms and plans.

    `active_only` is on for anything that leads to a sale and off when reading
    a voucher back: a property taken off sale still has to print the bookings
    already made against it.
    """
    properties = _property_queryset()
    if active_only:
        properties = properties.filter(is_active=True)

    stay = properties.filter(pk=property_id).first()
    if stay is None:
        raise PropertyNotFound()
    return stay


def property_payload(stay, check_in, check_out):
    """One property serialised for a date range."""
    room_types = list(stay.room_types.all())
    left = rooms_left_by_type(
        [room.pk for room in room_types], check_in, check_out,
    )
    return serialise_property(stay, [
        serialise_room(room, left.get(room.pk, 0)) for room in room_types
    ])


def get_room_type(stay, room_type_id):
    """
    A room type at this property.

    Looked up among the property's own rows rather than by id alone: the room
    and property ids arrive independently from the client, and this is what
    stops a room at one hotel being booked against another. It also reuses the
    prefetch, so the amenities and plans are already loaded.
    """
    room = next(
        (room for room in stay.room_types.all() if room.pk == room_type_id),
        None,
    )
    if room is None:
        raise InvalidSelection(
            'That room is not at this property.',
            detail={'roomTypeId': room_type_id},
        )
    return room


def get_room_type_by_id(room_type_id):
    """
    A room type on its own, for the quote endpoint.

    Quoting needs no property id - the room already knows which property it
    belongs to - so this is the one lookup that takes an id alone. Anything
    that leads to a sale goes through `get_room_type`, which checks the room
    against the property the client named.
    """
    room = (
        RoomType.objects
        .select_related('property')
        .prefetch_related(
            'room_amenities__amenity',
            Prefetch(
                'rate_plans',
                queryset=RatePlan.objects.order_by('price_per_night'),
            ),
        )
        .filter(pk=room_type_id)
        .first()
    )
    if room is None:
        raise InvalidSelection(
            'That room does not exist.', detail={'roomTypeId': room_type_id},
        )
    return room


def get_rate_plan(room, code):
    """
    The rate plan a booking sells under.

    Plans belong to a room type, so a code that exists on another room is
    still not valid here.
    """
    plan = next(
        (plan for plan in room.rate_plans.all()
         if plan.code.casefold() == code.strip().casefold()),
        None,
    )
    if plan is None:
        raise InvalidSelection(
            'That rate plan is not offered on this room.',
            detail={'ratePlanCode': code},
        )
    return plan


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

# Unambiguous characters only: no O/0, no I/1. A guest reads this off a screen
# and into a phone call to the property.
BOOKING_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
BOOKING_ID_PREFIX = 'HT'


def generate_booking_id():
    """`HTN75YLS` - the shape the voucher screen already prints."""
    body = ''.join(secrets.choice(BOOKING_ID_ALPHABET) for _ in range(6))
    return f'{BOOKING_ID_PREFIX}{body}'


def _take_inventory(room, nights, rooms):
    """
    Hold the rooms for every night of the stay.

    The inventory rows are locked for the rest of the transaction, so two
    guests booking the last room are serialised rather than both passing the
    check. Every night is verified before any is decremented - a stay is all
    or nothing, and a partial hold would leave a guest with three nights of
    four.
    """
    rows = {
        row.stay_date: row
        for row in RoomInventory.objects
        .select_for_update()
        .filter(room_type=room, stay_date__in=nights)
    }

    short = sorted(
        night for night in nights
        if night not in rows or rows[night].rooms_available < rooms
    )
    if short:
        raise RoomsUnavailable(detail={
            'nights': [night.isoformat() for night in short],
            'roomsRequested': rooms,
        })

    for row in rows.values():
        row.rooms_available -= rooms

    RoomInventory.objects.bulk_update(rows.values(), ['rooms_available'])


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
                    mode=Booking.HOTEL,
                    user_id=data.get('userId'),
                    status=Booking.CONFIRMED,
                    contact_email=data['guest']['email'],
                    contact_phone=data['guest']['phone'],
                    total_amount=fare['total'],
                    currency='INR',
                )
        except IntegrityError:
            continue

    raise RoomsUnavailable('Could not allocate a booking id. Try again.')


@transaction.atomic
def create_booking(data):
    """
    Take payment, hold the rooms, issue the voucher - one transaction.

    Returns the objects the confirmation needs. Anything raised in here rolls
    the whole thing back, so a failed booking never leaves a night held.
    """
    check_in, check_out = data['checkIn'], data['checkOut']
    if check_in < timezone.localdate():
        raise InvalidSelection(
            'That check-in date has already passed.',
            detail={'checkIn': check_in.isoformat()},
        )

    stay = get_property(data['propertyId'])
    room = get_room_type(stay, data['roomTypeId'])
    rate_plan = get_rate_plan(room, data['ratePlanCode'])

    rooms = data['rooms']
    guests = data['guests']
    if room.max_guests * rooms < guests:
        raise InvalidSelection(
            f'{rooms} of these rooms hold {room.max_guests * rooms} guests, '
            f'not {guests}.',
            detail={'guests': guests, 'maxGuests': room.max_guests * rooms},
        )

    nights = stay_dates(check_in, check_out)
    _take_inventory(room, nights, rooms)

    fare = calculate_fare(rate_plan, len(nights), rooms)
    booking = _create_booking_row(data, fare)

    hotel_booking = HotelBooking.objects.create(
        booking=booking,
        property=stay,
        room_type=room,
        rate_plan=rate_plan,
        check_in=check_in,
        check_out=check_out,
        nights=len(nights),
        rooms=rooms,
        guests=guests,
        room_total=fare['room_total'],
        tax_rate_percent=fare['tax_rate_percent'],
        taxes=fare['taxes'],
        property_fee=fare['property_fee'],
        arrival_window=data['guest']['arrival'] or None,
        special_requests=data['guest']['requests'] or None,
    )

    lead_guest = HotelGuest.objects.create(
        booking=hotel_booking,
        full_name=data['guest']['name'].strip(),
        is_lead=True,
        sort_order=0,
    )

    BookingFareLine.objects.bulk_create([
        BookingFareLine(
            booking=booking,
            label=f'{len(nights)} night(s) x {rooms} room(s)',
            amount=fare['room_total'], sort_order=0,
        ),
        BookingFareLine(
            booking=booking,
            label=f'Taxes and fees ({fare["tax_rate_percent"]:.0f}%)',
            amount=fare['taxes'], sort_order=1,
        ),
        BookingFareLine(
            booking=booking, label='Property fee',
            amount=fare['property_fee'], sort_order=2,
        ),
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

    hotel_booking.property = stay
    hotel_booking.rate_plan = rate_plan

    return (
        booking, hotel_booking,
        property_payload(stay, check_in, check_out),
        serialise_room(room, _rooms_left_for(room, check_in, check_out)),
        lead_guest, payment,
    )


def _rooms_left_for(room, check_in, check_out):
    return rooms_left_by_type([room.pk], check_in, check_out).get(room.pk, 0)


def get_booking(reference, user_id):
    """
    Load a booking by its reference, for the account that made it.

    Scoped to `user_id` rather than trusting the reference alone: eight
    characters is short enough to guess, and a ticket carries a name, a phone
    number and an itinerary.
    """
    hotel_booking = (
        HotelBooking.objects
        .select_related('booking', 'rate_plan', 'room_type')
        .filter(
            booking__user_id=user_id,
            booking__reference=reference.strip().upper(),
        )
        .first()
    )
    if hotel_booking is None:
        raise BookingNotFound()

    stay = get_property(hotel_booking.property_id, active_only=False)
    hotel_booking.property = stay

    check_in, check_out = hotel_booking.check_in, hotel_booking.check_out
    room = next(
        (r for r in stay.room_types.all() if r.pk == hotel_booking.room_type_id),
        hotel_booking.room_type,
    )

    lead_guest = (
        hotel_booking.party.filter(is_lead=True).first()
        or hotel_booking.party.first()
    )
    payment = (
        hotel_booking.booking.payments
        .filter(status=Payment.SUCCESS).order_by('-pk').first()
        or hotel_booking.booking.payments.order_by('-pk').first()
    )

    return (
        hotel_booking.booking, hotel_booking,
        property_payload(stay, check_in, check_out),
        serialise_room(room, _rooms_left_for(room, check_in, check_out)),
        lead_guest, payment,
    )

def list_bookings(user_id):
    """
    Every stay booking this account has made, newest first.

    Feeds the account's own ticket list. The related rows this pulls are
    exactly what `serialise_booking_summary` reads, so the list costs one
    query however many tickets come back.
    """
    return (
        HotelBooking.objects
        .select_related(
            'booking', 'property', 'property__city',
        )
        .filter(booking__user_id=user_id)
        .order_by('-booking__booked_at')
    )


def _release_inventory(room, nights, rooms):
    """
    Put the rooms back on every night of a cancelled stay.

    The mirror of `_take_inventory`, locked the same way so a release and a
    sale racing for the same night are serialised. A night whose inventory row
    has since been deleted is skipped rather than recreated - the hotel has
    stopped selling that date, and inventing a row would put rooms back on
    sale that no longer exist.
    """
    rows = list(
        RoomInventory.objects
        .select_for_update()
        .filter(room_type=room, stay_date__in=nights)
    )

    for row in rows:
        row.rooms_available += rooms

    if rows:
        RoomInventory.objects.bulk_update(rows, ['rooms_available'])


@transaction.atomic
def cancel_booking(user_id, reference):
    """
    Cancel a stay and return its rooms to inventory for every night booked.

    Check-out is the date the policy is measured against, so a guest can still
    cancel the back half of a stay they are in the middle of.
    """
    hotel_booking = (
        HotelBooking.objects
        .select_related('booking', 'property', 'property__city', 'room_type')
        .filter(booking__reference=reference, booking__user_id=user_id)
        .first()
    )
    if hotel_booking is None:
        raise BookingNotFound()

    ensure_cancellable(hotel_booking.booking, hotel_booking.check_out)

    nights = [
        hotel_booking.check_in + timedelta(days=offset)
        for offset in range(hotel_booking.nights)
    ]
    _release_inventory(hotel_booking.room_type, nights, hotel_booking.rooms)

    mark_cancelled(hotel_booking.booking)

    return hotel_booking
