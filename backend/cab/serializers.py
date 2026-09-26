"""
Request validation and response shaping for the cab endpoints.

Two different jobs, deliberately done two different ways:

  * Incoming payloads go through DRF serializers, which is where field
    validation belongs.
  * Outgoing payloads are built by the `serialise_*` functions below, which
    return plain dicts in the exact shape of frontend/src/types/cab.types.ts -
    camelCase keys, categories identified by code. A ModelSerializer would
    need a `source=` on nearly every field to produce the same thing.

The contract these functions honour is the signature block in
frontend/src/services/cab.services.ts. Anything changed here has to change
there too.
"""
from decimal import Decimal

from rest_framework import serializers

from payments.serializers import serialise_payment
from payments.services import hold_expires_at

from cab.models import CabExtra


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


def serialise_extra(extra):
    """A CabExtra."""
    return {
        'id': extra.code,
        'label': extra.label,
        'description': extra.description or '',
        'price': money(extra.price),
    }


def serialise_estimate(estimate):
    """A TripEstimate, from the dict `services.estimate_trip` returns."""
    return {
        'distanceKm': estimate['distance_km'],
        'durationMinutes': estimate['duration_minutes'],
        'tripType': estimate['trip_type'],
        'nightTrip': estimate['night_trip'],
    }


def serialise_option(option):
    """
    A CabOption, from the dict `services.price_category` returns.

    `id` is the category's primary key as a string. The category *code*
    travels separately as `category`, which is what the booking request sends
    back - a code reads better in a payload than a row id and cannot drift.
    """
    return {
        'id': str(option['category'].pk),
        'category': option['category'].code,
        'name': option['category'].name,
        'models': option['category'].vehicle_models or '',
        'seats': option['category'].seats,
        'luggage': option['category'].luggage,
        'airConditioned': option['category'].is_air_conditioned,
        'baseFare': money(option['base_fare']),
        'includedKm': option['included_km'],
        'extraKmRate': money(option['extra_km_rate']),
        'inclusions': option['inclusions'],
        'exclusions': option['exclusions'],
        'cancellation': option['cancellation'],
        'rating': (
            float(option['category'].rating) if option['category'].rating
            else 0.0
        ),
        'etaMinutes': option['eta_minutes'],
    }


def serialise_fare(fare):
    """A CabFareBreakdown, from the dict `services.calculate_fare` returns."""
    return {
        'baseFare': money(fare['base_fare']),
        'extras': money(fare['extras']),
        'driverAllowance': money(fare['driver_allowance']),
        'tollsAndStateTax': money(fare['tolls_state_tax']),
        'nightCharge': money(fare['night_charge']),
        'gst': money(fare['gst']),
        'total': money(fare['total']),
        'payNow': money(fare['pay_now']),
        'payToDriver': money(fare['pay_to_driver']),
    }


def serialise_confirmation(booking, cab_booking, option, extra_rows, payment):
    """
    A CabBookingConfirmation - what the trip voucher renders.

    The option and the estimate are embedded rather than referenced: the
    voucher has to keep reading correctly after the rate card is replaced, and
    the front end holds this object in state with nothing left to fetch.
    """
    pickup_at = cab_booking.pickup_at

    return {
        'bookingId': booking.reference,
        'bookedAt': booking.booked_at.isoformat(),
        'status': booking.status,
        # `option` arrives as the dict services.py builds, models and all - it
        # has to go through the serializer like any other option.
        'option': serialise_option(option),
        'query': {
            'pickup': cab_booking.pickup_address,
            'drop': cab_booking.drop_address,
            'date': pickup_at.date().isoformat(),
            'time': pickup_at.strftime('%H:%M'),
        },
        'estimate': {
            'distanceKm': cab_booking.distance_km,
            'durationMinutes': cab_booking.duration_minutes,
            'tripType': cab_booking.trip_type,
            'nightTrip': cab_booking.is_night_trip,
        },
        'details': {
            'pickupAddress': cab_booking.pickup_address,
            'dropAddress': cab_booking.drop_address,
            'date': pickup_at.date().isoformat(),
            'time': pickup_at.strftime('%H:%M'),
            'name': cab_booking.passenger_name,
            'phone': cab_booking.passenger_phone,
            'email': booking.contact_email,
        },
        'extras': [row.extra.code for row in extra_rows],
        'fare': {
            'baseFare': money(cab_booking.base_fare),
            'extras': money(cab_booking.extras_total),
            'driverAllowance': money(cab_booking.driver_allowance),
            'tollsAndStateTax': money(cab_booking.tolls_state_tax),
            'nightCharge': money(cab_booking.night_charge),
            'gst': money(cab_booking.gst),
            'total': money(booking.total_amount),
            'payNow': money(cab_booking.pay_now),
            'payToDriver': money(cab_booking.pay_to_driver),
        },
        # Empty until the payments module has taken a payment that went
        # through: a declined attempt does not put its instrument on the
        # ticket. `payment` below carries every state.
        'paymentMethod': (
            (payment.instrument or payment.get_method_display())
            if payment is not None and payment.status == 'success' else ''
        ),
        'payment': serialise_payment(payment, booking.currency),
        # While the booking is pending: when its hold on the inventory runs
        # out. Null once it is paid for or closed.
        'holdExpiresAt': hold_expires_at(booking),
        # Beyond CabBookingConfirmation: the schema carries these and they are
        # filled in two hours before pickup, so the voucher can poll for them
        # rather than only showing ARRIVAL_BUFFER_NOTE.
        'driver': (
            {
                'name': cab_booking.driver_name,
                'phone': cab_booking.driver_phone,
                'vehicleNumber': cab_booking.vehicle_number,
            }
            if cab_booking.driver_name else None
        ),
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

class TripQuerySerializer(serializers.Serializer):
    """
    Query string of `GET /api/cab/cabs/` and `GET /api/cab/estimate/`.
    Mirrors CabSearchQuery.
    """

    pickup = serializers.CharField(max_length=500)
    drop = serializers.CharField(max_length=500)
    date = serializers.DateField()
    # 24-hour 'HH:MM', as the time input produces.
    time = serializers.TimeField(input_formats=['%H:%M', '%H:%M:%S'])


class QuoteSerializer(serializers.Serializer):
    """Body of `POST /api/cab/quote/`."""

    categoryCode = serializers.CharField(max_length=20)
    pickup = serializers.CharField(max_length=500)
    drop = serializers.CharField(max_length=500)
    date = serializers.DateField()
    time = serializers.TimeField(input_formats=['%H:%M', '%H:%M:%S'])
    extras = serializers.ListField(
        child=serializers.CharField(max_length=20),
        allow_empty=True, max_length=len(CabExtra.CODES), default=list,
    )


class TripDetailsSerializer(serializers.Serializer):
    """The trip-details form. Mirrors CabTripDetails."""

    pickupAddress = serializers.CharField(max_length=500)
    dropAddress = serializers.CharField(max_length=500)
    name = serializers.CharField(max_length=150)
    # Ten digits, matching the `pattern` on the phone input.
    phone = serializers.RegexField(r'^\d{10}$', max_length=15)
    email = serializers.EmailField(max_length=254)


class BookingCreateSerializer(serializers.Serializer):
    """
    Body of `POST /api/cab/bookings/`. Mirrors ConfirmCabInput, with a category
    code in place of the option object the front end holds in state.

    The `estimate` is not accepted: distance, duration, trip type and the
    night flag are all worked out server-side from the addresses and the
    pickup time, because every one of them moves the fare. Everything that
    needs the database - the category is on sale, a rate card is in force, the
    extras exist - lives in services.py.
    """

    categoryCode = serializers.CharField(max_length=20)
    date = serializers.DateField()
    time = serializers.TimeField(input_formats=['%H:%M', '%H:%M:%S'])
    details = TripDetailsSerializer()
    extras = serializers.ListField(
        child=serializers.CharField(max_length=20),
        allow_empty=True, max_length=len(CabExtra.CODES), default=list,
    )

    def validate_extras(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError('The same extra was sent twice.')
        return value

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

    # The stored addresses run to 500 characters. The first segment is the
    # landmark someone would recognise; the rest is the postal tail.
    def landmark(address):
        return address.split(',')[0].strip() or address.strip()

    return {
        'reference': booking.reference,
        'mode': 'cab',
        'status': booking.status,
        'title': (
            f'{landmark(row.pickup_address)} → '
            f'{landmark(row.drop_address)}'
        ),
        'detail': f'{row.category.name} · {row.distance_km} km',
        'travelDate': row.pickup_at.isoformat(),
        'endDate': None,
        'amount': money(booking.total_amount),
        'currency': booking.currency,
        'bookedAt': booking.booked_at.isoformat(),
    }
