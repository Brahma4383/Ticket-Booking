"""
Request validation and response shaping for the train endpoints.

Two different jobs, deliberately done two different ways:

  * Incoming payloads go through DRF serializers, which is where field
    validation belongs.
  * Outgoing payloads are built by the `serialise_*` functions below, which
    return plain dicts in the exact shape of frontend/src/types/train.types.ts
    - camelCase keys, stations identified by code, the class list assembled
    from the availability rows. A ModelSerializer would need a `source=` on
    nearly every field to produce the same thing.

The contract these functions honour is the signature block in
frontend/src/services/train.services.ts. Anything changed here has to change
there too.
"""
from decimal import Decimal

from rest_framework import serializers

from payments.serializers import serialise_payment
from payments.services import hold_expires_at

from train.models import TrainPassenger


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def money(value):
    """
    A rupee amount as a JSON number.

    DECIMAL columns would otherwise render as strings, and the fare summary
    adds them up. Whole rupees stay ints so `formatINR` prints `1,250` rather
    than `1250.0`; insurance at ₹0.45 a head keeps its paise.
    """
    amount = Decimal(value or 0).quantize(Decimal('0.01'))
    return int(amount) if amount == amount.to_integral_value() else float(amount)


def serialise_station(station):
    """A Station: code and name, which is all the front end holds."""
    return {'code': station.code, 'name': station.name}


def serialise_boarding_station(station, time, day_offset):
    """A BoardingStation - a Station plus when the train leaves it."""
    return {
        'code': station.code,
        'name': station.name,
        'time': time,
        'dayOffset': day_offset,
    }


def serialise_boarding_stations(train, boarding_rows):
    """
    The boarding list for a train.

    The origin is always first and always offered; `train_boarding_station`
    holds only the intermediate stops, which is why the origin is prepended
    here rather than stored.
    """
    return [
        serialise_boarding_station(
            train.origin_station, train.departure_time, 0,
        ),
        *[
            serialise_boarding_station(
                row.station, row.departure_time, row.day_offset,
            )
            for row in boarding_rows
        ],
    ]


def serialise_availability(row):
    """An Availability."""
    return {
        'kind': row.availability_kind,
        'count': row.availability_count,
        'label': row.availability_label,
        'confirmChance': row.confirm_chance,
    }


def serialise_class_option(row):
    """
    A TrainClassOption, built from one availability row.

    The fare is the row's own, not the class's: the same class costs
    differently by date and quota, which is the point of the table.
    """
    return {
        'code': row.train_class.code,
        'label': row.train_class.label,
        'fare': money(row.fare),
        'availability': serialise_availability(row),
    }


def serialise_trip(train, availability_rows, boarding_rows):
    """
    A TrainTrip.

    `classes` is exactly the set of availability rows found for the date and
    quota asked for - a class with no row is not sold that day, so it is not
    listed. They arrive pre-sorted by the class's `sort_order`.
    """
    return {
        'id': str(train.pk),
        'number': train.number,
        'name': train.name,
        'from': serialise_station(train.origin_station),
        'to': serialise_station(train.destination_station),
        'departure': train.departure_time,
        'arrival': train.arrival_time,
        'durationMinutes': train.duration_minutes,
        'daysToArrive': train.days_to_arrive,
        'runsOn': train.runs_on,
        'classes': [serialise_class_option(row) for row in availability_rows],
        'pantry': train.has_pantry,
        'rating': float(train.rating) if train.rating else 0.0,
        'boardingStations': serialise_boarding_stations(train, boarding_rows),
        'cancellationPolicy': train.cancellation_policy or '',
    }


def serialise_fare(fare):
    """A TrainFareBreakdown, from the dict `services.calculate_fare` returns."""
    return {
        'baseFare': money(fare['base_fare']),
        'quotaSurcharge': money(fare['quota_surcharge']),
        'reservationCharge': money(fare['reservation_charge']),
        'insurance': money(fare['insurance']),
        'gst': money(fare['gst']),
        'total': money(fare['total']),
    }


def serialise_passenger(passenger):
    """
    An AllottedPassenger: what was asked for, plus what the chart gave.

    `id` is the row's primary key as a string. The front end only uses it as a
    list key, and reading a ticket back has to produce the same object the
    booking call returned.
    """
    return {
        'id': str(passenger.pk),
        'name': passenger.full_name,
        # The passenger form holds age as a string; it goes back the same way
        # so the object can be fed straight into that form.
        'age': str(passenger.age) if passenger.age else '',
        'gender': passenger.gender or 'male',
        'berth': passenger.berth_preference,
        'coach': passenger.allotted_coach or '—',
        'status': passenger.booking_status,
        'allottedBerth': passenger.allotted_berth or 'Not allotted yet',
    }


def serialise_confirmation(
    booking, train_booking, trip, class_option, passengers, payment,
):
    """
    A TrainBookingConfirmation - what the ticket screen renders.

    The trip and the class option are embedded rather than referenced: the
    ticket has to keep reading correctly after the timetable or the
    availability moves on, and the front end holds this object in state with
    nothing left to fetch.
    """
    return {
        'pnr': booking.reference,
        'bookedAt': booking.booked_at.isoformat(),
        'status': booking.status,
        'trip': trip,
        'query': {
            'from': train_booking.train.origin_station.name,
            'to': train_booking.train.destination_station.name,
            'date': train_booking.travel_date.isoformat(),
        },
        'classOption': class_option,
        'quota': train_booking.quota.code,
        'boardingStation': (
            serialise_boarding_station(
                train_booking.boarding_station,
                # A boarding station's departure time is the train's own when
                # it is the origin, and the intermediate row's otherwise.
                train_booking.boarding_departure_time,
                train_booking.boarding_day_offset,
            )
            if train_booking.boarding_station_id else None
        ),
        'passengers': [serialise_passenger(p) for p in passengers],
        'contact': {
            'email': booking.contact_email,
            'phone': booking.contact_phone,
        },
        'fare': {
            'baseFare': money(train_booking.base_fare),
            'quotaSurcharge': money(train_booking.quota_surcharge),
            'reservationCharge': money(train_booking.reservation_charge),
            'insurance': money(train_booking.insurance),
            'gst': money(train_booking.gst),
            'total': money(booking.total_amount),
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
        'insured': train_booking.is_insured,
        'chartStatus': train_booking.chart_status or '',
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

# Six passengers on one ticket, which is what MAX_PASSENGERS enforces on
# screen and what the railways allow with a berth.
MAX_PASSENGERS = 6

DEFAULT_QUOTA = 'general'


class TrainSearchSerializer(serializers.Serializer):
    """
    Query string of `GET /api/train/trains/`. Mirrors TrainSearchQuery.

    The wire names are `from` and `to`, which are not usable as Python
    identifiers, so `from_query_params` renames them on the way in. That is
    the only place the two spellings meet.

    `quota` is not part of TrainSearchQuery. Availability and fare are stored
    per quota, so one has to be chosen to show a class list at all; it
    defaults to the same `general` the booking wizard starts on, and the
    review step re-queries when the traveller switches.
    """

    from_place = serializers.CharField(max_length=150)
    to_place = serializers.CharField(max_length=150)
    date = serializers.DateField()
    quota = serializers.CharField(max_length=20, default=DEFAULT_QUOTA)

    @classmethod
    def from_query_params(cls, params):
        return cls(data={
            'from_place': params.get('from', ''),
            'to_place': params.get('to', ''),
            'date': params.get('date', ''),
            'quota': params.get('quota') or DEFAULT_QUOTA,
        })

    def validate(self, attrs):
        if attrs['from_place'].strip().casefold() == attrs['to_place'].strip().casefold():
            raise serializers.ValidationError(
                'The origin and destination have to be different places.'
            )
        return attrs


class TrainDetailQuerySerializer(serializers.Serializer):
    """Query string of `GET /api/train/trains/<id>/`."""

    date = serializers.DateField()
    quota = serializers.CharField(max_length=20, default=DEFAULT_QUOTA)


class QuoteSerializer(serializers.Serializer):
    """Body of `POST /api/train/quote/`."""

    trainId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    classCode = serializers.CharField(max_length=10)
    quota = serializers.CharField(max_length=20, default=DEFAULT_QUOTA)
    passengerCount = serializers.IntegerField(min_value=0, max_value=MAX_PASSENGERS)
    insured = serializers.BooleanField(default=False)


class PassengerSerializer(serializers.Serializer):
    """One row of the passenger form."""

    name = serializers.CharField(max_length=150)
    # The form keeps age as a string; IntegerField takes "29" happily. The
    # bounds match the CHECK constraint on train_passenger.
    age = serializers.IntegerField(min_value=1, max_value=120)
    gender = serializers.ChoiceField(choices=['male', 'female', 'other'])
    berth = serializers.ChoiceField(
        choices=[choice for choice, _ in TrainPassenger.BERTH_PREFERENCES],
        default=TrainPassenger.NO_PREFERENCE,
    )


class ContactSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    # Ten digits, matching the `pattern` on the phone input.
    phone = serializers.RegexField(r'^\d{10}$', max_length=15)


class BookingCreateSerializer(serializers.Serializer):
    """
    Body of `POST /api/train/bookings/`. Mirrors ConfirmTrainBookingInput,
    with codes and ids in place of the objects the front end holds in state.

    Cross-field checks that need the database - the class is sold on this
    date, the quota exists, the boarding station is on this route, enough
    seats are left - live in services.py, where they run inside the
    transaction that takes the availability.
    """

    trainId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    classCode = serializers.CharField(max_length=10)
    quota = serializers.CharField(max_length=20, default=DEFAULT_QUOTA)
    boardingStationCode = serializers.CharField(max_length=10)
    passengers = PassengerSerializer(
        many=True, allow_empty=False, max_length=MAX_PASSENGERS,
    )
    contact = ContactSerializer()
    insured = serializers.BooleanField(default=False)

    def validate(self, attrs):
        # A ladies-quota ticket is women-only, and the passenger form already
        # forces every row to female when that quota is picked.
        if attrs['quota'].strip().casefold() == 'ladies':
            wrong = [
                passenger['name']
                for passenger in attrs['passengers']
                if passenger['gender'] != 'female'
            ]
            if wrong:
                raise serializers.ValidationError({
                    'passengers':
                        'The ladies quota is for women travellers only.',
                })
        return attrs

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
    train = row.train

    return {
        'reference': booking.reference,
        'mode': 'train',
        'status': booking.status,
        'title': (
            f'{train.origin_station.name} → '
            f'{train.destination_station.name}'
        ),
        'detail': f'{train.number} {train.name}',
        'travelDate': row.travel_date.isoformat(),
        'endDate': None,
        'amount': money(booking.total_amount),
        'currency': booking.currency,
        'bookedAt': booking.booked_at.isoformat(),
    }
