"""
Request validation and response shaping for the bus endpoints.

Two different jobs, deliberately done two different ways:

  * Incoming payloads go through DRF serializers, which is where field
    validation belongs.
  * Outgoing payloads are built by the `serialise_*` functions below, which
    return plain dicts in the exact shape of frontend/src/types/bus.types.ts -
    camelCase keys, string ids, decks assembled from the seat rows. A
    ModelSerializer would need a `source=` on nearly every field to produce
    the same thing, and would still not build the deck grid.

The contract these functions honour is the signature block in
frontend/src/services/bus.services.ts. Anything changed here has to change
there too.
"""
from decimal import Decimal

from rest_framework import serializers

from payments.serializers import serialise_payment
from payments.services import hold_expires_at

from payments.serializers import serialise_payment
from payments.services import hold_expires_at

from bus.models import BusSeat, BusStopPoint


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


def serialise_stop_point(point):
    """One entry of `boardingPoints` / `droppingPoints` (StopPoint)."""
    return {
        'id': str(point.pk),
        'name': point.name,
        'landmark': point.landmark or '',
        'time': point.stop_time,
    }


def serialise_trip(trip, *, fare_from=None, seats_left=0):
    """
    A BusTrip.

    `fare_from` and `seats_left` are per date, so the caller works them out
    and passes them in. The default of 0 is for the copy embedded in a
    ticket, where live availability means nothing - `BusTrip.seatsLeft` is
    typed as a number, so it cannot simply be left out.
    """
    stop_points = list(trip.stop_points.all())

    return {
        'id': str(trip.pk),
        'operator': trip.operator.name,
        'coach': trip.coach_name,
        'kind': trip.seat_kind,
        'airConditioned': trip.is_air_conditioned,
        'layout': trip.layout,
        'departure': trip.departure_time,
        'arrival': trip.arrival_time,
        'durationMinutes': trip.duration_minutes,
        'arrivesNextDay': trip.arrives_next_day,
        'rating': float(trip.operator.rating) if trip.operator.rating else 0.0,
        'ratingCount': trip.operator.rating_count,
        'fareFrom': money(trip.base_fare if fare_from is None else fare_from),
        'seatsLeft': seats_left,
        'amenities': [link.amenity.name for link in trip.trip_amenities.all()],
        'boardingPoints': [
            serialise_stop_point(point)
            for point in stop_points
            if point.kind == BusStopPoint.BOARDING
        ],
        'droppingPoints': [
            serialise_stop_point(point)
            for point in stop_points
            if point.kind == BusStopPoint.DROPPING
        ],
        'cancellationPolicy': trip.cancellation_policy or '',
        'liveTracking': trip.has_live_tracking,
    }


def seat_status(seat, booked_codes):
    """
    The seat's status *on a given date*.

    The front end knows three states. `blocked` in the database and "already
    sold for this date" are both `booked` to a traveller - neither can be
    picked, and the map draws them the same way.
    """
    if seat.seat_code in booked_codes or seat.status == BusSeat.BLOCKED:
        return 'booked'
    if seat.status == BusSeat.LADIES:
        return 'ladies'
    return 'available'


def serialise_seat(seat, booked_codes=frozenset()):
    """One Seat. `id` is the seat code, which is what the map prints on it."""
    return {
        'id': seat.seat_code,
        'deck': seat.deck,
        'row': seat.row_no,
        'column': seat.column_no,
        'kind': seat.seat_kind,
        'status': seat_status(seat, booked_codes),
        'price': money(seat.price),
    }


# Lower first: the seat map renders decks in array order, and the lower deck
# is the one a traveller sees on boarding.
DECK_ORDER = {'lower': 0, 'upper': 1}


def serialise_decks(seats, booked_codes=frozenset()):
    """
    Group seats into the Deck[] the seat map draws.

    `rows` and `columns` are the grid's extent, and `aisles` are the columns
    inside it that hold no seats. Deriving the aisle from the data rather than
    from `layout` means a 2+2 coach with an unusual arrangement still renders
    correctly - the gap is wherever the seats aren't.
    """
    by_deck = {}
    for seat in seats:
        by_deck.setdefault(seat.deck, []).append(seat)

    decks = []
    for name in sorted(by_deck, key=lambda deck: DECK_ORDER.get(deck, 99)):
        deck_seats = by_deck[name]
        columns_used = {seat.column_no for seat in deck_seats}
        rows = max(seat.row_no for seat in deck_seats)
        columns = max(columns_used)

        decks.append({
            'name': name,
            'rows': rows,
            'columns': columns,
            'aisles': [
                column
                for column in range(1, columns + 1)
                if column not in columns_used
            ],
            'seats': [
                serialise_seat(seat, booked_codes) for seat in deck_seats
            ],
        })

    return decks


def serialise_fare(seat_total, service_fee, gst):
    """A FareBreakdown."""
    return {
        'seatTotal': money(seat_total),
        'serviceFee': money(service_fee),
        'gst': money(gst),
        'total': money(Decimal(seat_total) + Decimal(service_fee) + Decimal(gst)),
    }


def serialise_confirmation(booking, bus_booking, trip, booked_seats, payment):
    """
    A BookingConfirmation - what the ticket screen renders.

    The trip, seats and stop points are embedded rather than referenced: the
    ticket has to keep reading correctly after the timetable changes, and the
    front end holds this object in state with nothing left to fetch.
    """
    seats = [entry.seat for entry in booked_seats]

    return {
        'pnr': booking.reference,
        'bookedAt': booking.booked_at.isoformat(),
        'status': booking.status,
        # The trip as it was sold: the fare paid, not today's cheapest seat.
        'trip': serialise_trip(
            trip,
            fare_from=min((seat.price for seat in seats), default=trip.base_fare),
        ),
        'query': {
            'from': trip.origin_city.name,
            'to': trip.destination_city.name,
            'date': bus_booking.travel_date.isoformat(),
        },
        # Every seat on a confirmed ticket is sold, whatever its standing
        # status was when it was picked.
        'seats': [
            {**serialise_seat(entry.seat), 'status': 'booked',
             'price': money(entry.fare)}
            for entry in booked_seats
        ],
        'passengers': [
            {
                'seatId': entry.seat.seat_code,
                'name': entry.passenger_name,
                # The passenger form holds age as a string; it goes back the
                # same way so the object can be fed straight into that form.
                'age': str(entry.passenger_age) if entry.passenger_age else '',
                'gender': entry.passenger_gender or 'male',
            }
            for entry in booked_seats
        ],
        'contact': {
            'email': booking.contact_email,
            'phone': booking.contact_phone,
        },
        'boardingPoint': (
            serialise_stop_point(bus_booking.boarding_point)
            if bus_booking.boarding_point_id else None
        ),
        'droppingPoint': (
            serialise_stop_point(bus_booking.dropping_point)
            if bus_booking.dropping_point_id else None
        ),
        'fare': serialise_fare(
            bus_booking.seat_total, bus_booking.service_fee, bus_booking.gst,
        ),
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
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

class TripSearchSerializer(serializers.Serializer):
    """
    Query string of `GET /api/bus/trips/`. Mirrors BusSearchQuery.

    The wire names are `from` and `to`, which are not usable as Python
    identifiers, so `from_query_params` renames them on the way in. That is
    the only place the two spellings meet.
    """

    from_city = serializers.CharField(max_length=120)
    to_city = serializers.CharField(max_length=120)
    date = serializers.DateField()

    @classmethod
    def from_query_params(cls, params):
        return cls(data={
            'from_city': params.get('from', ''),
            'to_city': params.get('to', ''),
            'date': params.get('date', ''),
        })

    def validate(self, attrs):
        if attrs['from_city'].strip().casefold() == attrs['to_city'].strip().casefold():
            raise serializers.ValidationError(
                'The origin and destination have to be different cities.'
            )
        return attrs


class SeatMapQuerySerializer(serializers.Serializer):
    """Query string of `GET /api/bus/trips/<id>/seats/`."""

    date = serializers.DateField()


class QuoteSerializer(serializers.Serializer):
    """Body of `POST /api/bus/quote/`."""

    tripId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    seatIds = serializers.ListField(
        child=serializers.CharField(max_length=10),
        allow_empty=True, max_length=6,
    )


class PassengerSerializer(serializers.Serializer):
    """One row of the traveller details form."""

    seatId = serializers.CharField(max_length=10)
    name = serializers.CharField(max_length=150)
    # The form keeps age as a string; IntegerField takes "29" happily. The
    # bounds match the CHECK constraint on bus_booking_seat.
    age = serializers.IntegerField(min_value=1, max_value=120)
    gender = serializers.ChoiceField(choices=['male', 'female', 'other'])


class ContactSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    # Ten digits, matching the `pattern` on the phone input.
    phone = serializers.RegexField(r'^\d{10}$', max_length=15)


class BookingCreateSerializer(serializers.Serializer):
    """
    Body of `POST /api/bus/bookings/`. Mirrors ConfirmBookingInput, with ids
    in place of the objects the front end holds in state.

    Cross-field checks that need the database - seat belongs to trip, seat
    still free, ladies seat gets a female passenger - live in services.py,
    where they run inside the transaction that reserves the seats.
    """

    # Six is the common operator cap and is what MAX_SEATS enforces on screen.
    MAX_SEATS = 6

    tripId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    seatIds = serializers.ListField(
        child=serializers.CharField(max_length=10),
        allow_empty=False, max_length=MAX_SEATS,
    )
    passengers = PassengerSerializer(many=True)
    contact = ContactSerializer()
    boardingPointId = serializers.IntegerField(min_value=1)
    droppingPointId = serializers.IntegerField(min_value=1)

    def validate_seatIds(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError('The same seat was sent twice.')
        return value

    def validate(self, attrs):
        seat_ids = attrs['seatIds']
        passenger_seats = [passenger['seatId'] for passenger in attrs['passengers']]

        if sorted(passenger_seats) != sorted(seat_ids):
            raise serializers.ValidationError(
                'Send one passenger per selected seat, matched by seatId.'
            )
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
    trip = row.trip

    return {
        'reference': booking.reference,
        'mode': 'bus',
        'status': booking.status,
        'title': f'{trip.origin_city.name} → {trip.destination_city.name}',
        'detail': trip.operator.name,
        'travelDate': row.travel_date.isoformat(),
        'endDate': None,
        'amount': money(booking.total_amount),
        'currency': booking.currency,
        'bookedAt': booking.booked_at.isoformat(),
    }
