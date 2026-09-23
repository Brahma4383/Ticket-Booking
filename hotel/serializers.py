"""
Request validation and response shaping for the hotel endpoints.

Two different jobs, deliberately done two different ways:

  * Incoming payloads go through DRF serializers, which is where field
    validation belongs.
  * Outgoing payloads are built by the `serialise_*` functions below, which
    return plain dicts in the exact shape of frontend/src/types/hotel.types.ts
    - camelCase keys, string ids, rooms nested inside their property. A
    ModelSerializer would need a `source=` on nearly every field to produce
    the same thing.

The contract these functions honour is the signature block in
frontend/src/services/hotel.services.ts. Anything changed here has to change
there too.
"""
from decimal import Decimal

from rest_framework import serializers

from hotel.models import Payment


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def money(value):
    """
    A rupee amount as a JSON number.

    DECIMAL columns would otherwise render as strings, and the fare summary
    adds them up. Whole rupees stay ints so `formatINR` prints `1,250` rather
    than `1250.0`.
    """
    amount = Decimal(value or 0).quantize(Decimal('0.01'))
    return int(amount) if amount == amount.to_integral_value() else float(amount)


# `Property.imageAccent` is a Tailwind gradient standing in for a photo, and
# the schema has no column for it - `property` stores no imagery at all.
# Picking from this list by id keeps a stay looking the same on every request
# and across reloads, which a random choice would not. When real photographs
# arrive they belong in a new table, and this goes away.
IMAGE_ACCENTS = [
    'from-brand-500 to-brand-800',
    'from-sky-500 to-brand-700',
    'from-accent-500 to-orange-600',
    'from-emerald-500 to-teal-700',
    'from-violet-500 to-brand-700',
]


def image_accent_for(property_id):
    return IMAGE_ACCENTS[property_id % len(IMAGE_ACCENTS)]


def serialise_rate_plan(plan):
    """A RatePlan. `id` is the plan code - `room-only`, `breakfast`, `flexible`."""
    return {
        'id': plan.code,
        'name': plan.name,
        'pricePerNight': money(plan.price_per_night),
        'breakfastIncluded': plan.breakfast_included,
        'freeCancellation': plan.free_cancellation,
        'cancellationNote': plan.cancellation_note or '',
        'payAtHotel': plan.pay_at_hotel,
    }


def serialise_room(room, rooms_left=0):
    """
    A RoomType.

    `rooms_left` is the smallest number free across the nights of the stay, so
    it is worked out by the caller and passed in - it means nothing without a
    date range.
    """
    return {
        'id': str(room.pk),
        'name': room.name,
        'sizeSqft': room.size_sqft or 0,
        'bed': room.bed_type or 'Double',
        'maxGuests': room.max_guests,
        'amenities': [link.amenity.name for link in room.room_amenities.all()],
        'roomsLeft': rooms_left,
        'ratePlans': [
            serialise_rate_plan(plan) for plan in room.rate_plans.all()
        ],
    }


def serialise_property(stay, rooms):
    """
    A Property, with its room types nested.

    `rooms` arrives already serialised, because how many are left depends on
    the dates asked for. `fromPricePerNight` is the cheapest plan on any of
    them - what the results card shows as "from ₹x".
    """
    prices = [
        plan['pricePerNight'] for room in rooms for plan in room['ratePlans']
    ]

    return {
        'id': str(stay.pk),
        'name': stay.name,
        'type': stay.property_type,
        'starRating': stay.star_rating,
        'locality': stay.locality or '',
        'city': stay.city.name,
        'distanceKm': float(stay.distance_km) if stay.distance_km else 0.0,
        'reviewScore': float(stay.review_score) if stay.review_score else 0.0,
        'reviewCount': stay.review_count,
        'amenities': [
            link.amenity.name for link in stay.property_amenities.all()
        ],
        'fromPricePerNight': min(prices) if prices else 0,
        'imageAccent': image_accent_for(stay.pk),
        'checkInTime': stay.checkin_time,
        'checkOutTime': stay.checkout_time,
        'rooms': rooms,
    }


def serialise_fare(fare):
    """A HotelFareBreakdown, from the dict `services.calculate_fare` returns."""
    return {
        'nights': fare['nights'],
        'rooms': fare['rooms'],
        'roomTotal': money(fare['room_total']),
        'taxes': money(fare['taxes']),
        'taxRatePercent': money(fare['tax_rate_percent']),
        'propertyFee': money(fare['property_fee']),
        'total': money(fare['total']),
    }


def serialise_confirmation(
    booking, hotel_booking, stay, room, lead_guest, payment,
):
    """
    A HotelBookingConfirmation - what the voucher screen renders.

    The property, room and rate plan are embedded rather than referenced: the
    voucher has to keep reading correctly after rates and availability move
    on, and the front end holds this object in state with nothing left to
    fetch.
    """
    return {
        'bookingId': booking.reference,
        'bookedAt': booking.booked_at.isoformat(),
        'status': booking.status,
        'property': stay,
        'room': room,
        'ratePlan': serialise_rate_plan(hotel_booking.rate_plan),
        'query': {
            'city': hotel_booking.property.city.name,
            'checkIn': hotel_booking.check_in.isoformat(),
            'checkOut': hotel_booking.check_out.isoformat(),
            'guests': hotel_booking.guests,
        },
        'rooms': hotel_booking.rooms,
        'guest': {
            'name': lead_guest.full_name if lead_guest else '',
            'email': booking.contact_email,
            'phone': booking.contact_phone,
            'requests': hotel_booking.special_requests or '',
            'arrival': hotel_booking.arrival_window or '',
        },
        'fare': {
            'nights': hotel_booking.nights,
            'rooms': hotel_booking.rooms,
            'roomTotal': money(hotel_booking.room_total),
            'taxes': money(hotel_booking.taxes),
            'taxRatePercent': money(hotel_booking.tax_rate_percent),
            'propertyFee': money(hotel_booking.property_fee),
            'total': money(booking.total_amount),
        },
        # A booking with no payment row should not exist, but a missing one
        # must not stop the voucher rendering.
        'paymentMethod': (
            (payment.instrument or payment.get_method_display())
            if payment else ''
        ),
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

# Most properties cap a single booking at five rooms, which is what MAX_ROOMS
# enforces on screen.
MAX_ROOMS = 5

# A party larger than this is a group booking, handled off the website.
MAX_GUESTS = 30


class StayDatesMixin:
    """Shared check: a stay has to end after it starts."""

    def validate(self, attrs):
        if attrs['checkOut'] <= attrs['checkIn']:
            raise serializers.ValidationError({
                'checkOut': 'Check-out has to be after check-in.',
            })
        return attrs


class StaySearchSerializer(StayDatesMixin, serializers.Serializer):
    """Query string of `GET /api/hotel/stays/`. Mirrors HotelSearchQuery."""

    city = serializers.CharField(max_length=120)
    checkIn = serializers.DateField()
    checkOut = serializers.DateField()
    guests = serializers.IntegerField(
        min_value=1, max_value=MAX_GUESTS, default=1,
    )

    @classmethod
    def from_query_params(cls, params):
        return cls(data={
            'city': params.get('city', ''),
            'checkIn': params.get('checkIn', ''),
            'checkOut': params.get('checkOut', ''),
            'guests': params.get('guests') or 1,
        })


class StayDetailQuerySerializer(StayDatesMixin, serializers.Serializer):
    """Query string of `GET /api/hotel/stays/<id>/`."""

    checkIn = serializers.DateField()
    checkOut = serializers.DateField()
    guests = serializers.IntegerField(
        min_value=1, max_value=MAX_GUESTS, default=1,
    )


class QuoteSerializer(StayDatesMixin, serializers.Serializer):
    """Body of `POST /api/hotel/quote/`."""

    roomTypeId = serializers.IntegerField(min_value=1)
    ratePlanCode = serializers.CharField(max_length=20)
    checkIn = serializers.DateField()
    checkOut = serializers.DateField()
    rooms = serializers.IntegerField(min_value=1, max_value=MAX_ROOMS, default=1)


class GuestSerializer(serializers.Serializer):
    """The guest-details form. One lead guest holds the booking."""

    name = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)
    # Ten digits, matching the `pattern` on the phone input.
    phone = serializers.RegexField(r'^\d{10}$', max_length=15)
    # Free text passed to the property.
    requests = serializers.CharField(
        max_length=400, required=False, allow_blank=True, default='',
    )
    # Rough arrival time, so the desk can hold the room.
    arrival = serializers.CharField(
        max_length=40, required=False, allow_blank=True, default='',
    )


class BookingCreateSerializer(StayDatesMixin, serializers.Serializer):
    """
    Body of `POST /api/hotel/bookings/`. Mirrors ConfirmStayInput, with ids and
    codes in place of the objects the front end holds in state.

    Cross-field checks that need the database - the room belongs to the
    property, the plan to the room, enough rooms free every night - live in
    services.py, where they run inside the transaction that takes the
    inventory.
    """

    propertyId = serializers.IntegerField(min_value=1)
    roomTypeId = serializers.IntegerField(min_value=1)
    ratePlanCode = serializers.CharField(max_length=20)
    checkIn = serializers.DateField()
    checkOut = serializers.DateField()
    rooms = serializers.IntegerField(min_value=1, max_value=MAX_ROOMS, default=1)
    guests = serializers.IntegerField(
        min_value=1, max_value=MAX_GUESTS, default=1,
    )
    guest = GuestSerializer()
    # The label shown on the payment step: 'UPI', 'Card', or the bank or
    # wallet name. Stored as the payment instrument.
    paymentMethod = serializers.CharField(max_length=100)
    # Which of the four methods that label belongs to. The payment step knows
    # this and should send it; until it does, the default keeps the column
    # inside its CHECK constraint.
    paymentMethodId = serializers.ChoiceField(
        choices=[choice for choice, _ in Payment.METHODS],
        required=False, default=Payment.UPI,
    )


class AmenityQuerySerializer(serializers.Serializer):
    """Query string of `GET /api/hotel/amenities/`."""

    # Narrows the list to amenities actually offered in one city, so the
    # filter sidebar does not show a facet that matches nothing.
    city = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default='',
    )

# ---------------------------------------------------------------------------
# Account ticket list
# ---------------------------------------------------------------------------

def serialise_booking_summary(row):
    """
    One row of the account's ticket list.

    Every mode fills the same shape - title, detail, a date, an amount - so
    the account page has one type and one card to render rather than five.
    Anything more than this belongs on the ticket itself, which the mode's
    own `bookings/<reference>/` already returns in full.

    `endDate` is only ever set by stays; the rest send null.
    """
    booking = row.booking
    stay = row.property

    nights = f"{row.nights} night{'s' if row.nights != 1 else ''}"
    rooms = f"{row.rooms} room{'s' if row.rooms != 1 else ''}"

    return {
        'reference': booking.reference,
        'mode': 'hotel',
        'status': booking.status,
        'title': stay.name,
        'detail': f'{stay.city.name} · {nights} · {rooms}',
        'travelDate': row.check_in.isoformat(),
        # The only mode with two dates; the card shows a range for stays.
        'endDate': row.check_out.isoformat(),
        'amount': money(booking.total_amount),
        'currency': booking.currency,
        'bookedAt': booking.booked_at.isoformat(),
    }
