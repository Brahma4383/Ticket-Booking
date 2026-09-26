"""
Request validation and response shaping for the plane endpoints.

Two different jobs, deliberately done two different ways:

  * Incoming payloads go through DRF serializers, which is where field
    validation belongs.
  * Outgoing payloads are built by the `serialise_*` functions below, which
    return plain dicts in the exact shape of frontend/src/types/plane.types.ts
    - camelCase keys, airports and seats identified by code, the cabin grid
    assembled from the seat rows. A ModelSerializer would need a `source=` on
    nearly every field to produce the same thing, and would still not build
    the cabin.

The contract these functions honour is the signature block in
frontend/src/services/plane.services.ts. Anything changed here has to change
there too.
"""
from decimal import Decimal

from rest_framework import serializers

from payments.serializers import serialise_payment
from payments.services import hold_expires_at

from plane.models import FlightAddon, FlightTraveller


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


def _place_name(airport):
    """The city an airport serves, falling back to its own name."""
    return airport.city.name if airport.city_id else airport.name


def serialise_airport(airport, terminal):
    """
    An Airport.

    The terminal belongs to the flight, not the airport - the same airport is
    T1 for one carrier and T2 for another - so it is passed in.
    """
    return {
        'code': airport.code,
        'city': _place_name(airport),
        'name': airport.name,
        'terminal': terminal or '',
    }


def serialise_layover(stop):
    """A Layover: where the flight touches down and for how long."""
    return {
        'code': stop.airport.code,
        'city': _place_name(stop.airport),
        'layoverMinutes': stop.layover_minutes,
    }


def serialise_fare_brand(brand):
    """A FareBrand. `id` is the brand code - `saver`, `comfort` or `flexi`."""
    return {
        'id': brand.code,
        'name': brand.name,
        'price': money(brand.price),
        'cabinBaggageKg': brand.cabin_baggage_kg,
        'checkInBaggageKg': brand.checkin_baggage_kg,
        'cancellation': brand.cancellation_note or '',
        'cancellationTier': brand.cancellation_tier,
        'dateChange': brand.date_change_note or '',
        'dateChangeTier': brand.date_change_tier,
        'freeSeat': brand.free_seat_selection,
        'mealIncluded': brand.meal_included,
    }


def serialise_trip(flight, *, seats_left=0):
    """
    A FlightTrip.

    `seats_left` is per date, so the caller works it out and passes it in. The
    default of 0 is for the copy embedded in a ticket, where live availability
    means nothing - `FlightTrip.seatsLeft` is typed as a number, so it cannot
    simply be left out.
    """
    return {
        'id': str(flight.pk),
        'airline': flight.airline.name,
        'airlineCode': flight.airline.code,
        'flightNumber': flight.flight_number,
        'aircraft': flight.aircraft or '',
        'from': serialise_airport(
            flight.origin_airport, flight.origin_terminal,
        ),
        'to': serialise_airport(
            flight.destination_airport, flight.destination_terminal,
        ),
        'departure': flight.departure_time,
        'arrival': flight.arrival_time,
        'durationMinutes': flight.duration_minutes,
        'daysToArrive': flight.days_to_arrive,
        # Empty for a non-stop flight, which is how the front end tells them
        # apart - there is no separate "non-stop" flag.
        'stops': [serialise_layover(stop) for stop in flight.stops.all()],
        'cabin': flight.cabin_class,
        'fares': [serialise_fare_brand(brand) for brand in flight.fares.all()],
        'onTime': flight.on_time_percent or 0,
        'seatsLeft': seats_left,
    }


def serialise_seat(seat, occupied_codes=frozenset()):
    """One CabinSeat. `id` is the seat code, which is what the map prints."""
    return {
        'id': seat.seat_code,
        'row': seat.row_no,
        'column': seat.seat_column,
        'zone': seat.zone,
        'price': money(seat.price),
        'occupied': seat.seat_code in occupied_codes,
        'window': seat.is_window,
        'aisle': seat.is_aisle,
    }


def cabin_columns(seats):
    """
    The seat letters in order, with `null` where the aisle runs.

    Derived from the data rather than hard-coded: an aisle is the gap between
    two adjacent columns that are both marked `is_aisle`, so a 3-3 cabin comes
    out as A B C - D E F and a 2-2 as A B - C D, without the layout having to
    be described anywhere.
    """
    aisle_columns = {seat.seat_column for seat in seats if seat.is_aisle}
    letters = sorted({seat.seat_column for seat in seats})

    columns = []
    for index, letter in enumerate(letters):
        columns.append(letter)
        next_letter = letters[index + 1] if index + 1 < len(letters) else None
        if (
            next_letter is not None
            and letter in aisle_columns
            and next_letter in aisle_columns
        ):
            columns.append(None)

    return columns


def serialise_cabin(seats, occupied_codes=frozenset()):
    """
    A CabinLayout: the column ruler plus one entry per row.

    A row is an exit row when its seats say so; the schema marks it per seat,
    and every seat in a row carries the same flag.
    """
    by_row = {}
    for seat in seats:
        by_row.setdefault(seat.row_no, []).append(seat)

    return {
        'columns': cabin_columns(seats),
        'rows': [
            {
                'number': number,
                'exitRow': any(seat.is_exit_row for seat in by_row[number]),
                'seats': [
                    serialise_seat(seat, occupied_codes)
                    for seat in sorted(by_row[number], key=lambda s: s.seat_column)
                ],
            }
            for number in sorted(by_row)
        ],
    }


def serialise_addon(addon):
    """An AddOn."""
    return {
        'id': addon.code,
        'label': addon.label,
        'description': addon.description or '',
        'price': money(addon.price),
    }


def serialise_fare(fare):
    """A PlaneFareBreakdown, from the dict `services.calculate_fare` returns."""
    return {
        'baseFare': money(fare['base_fare']),
        'taxes': money(fare['taxes']),
        'seats': money(fare['seats']),
        'addOns': money(fare['addons']),
        'convenienceFee': money(fare['convenience_fee']),
        'total': money(fare['total']),
    }


def serialise_traveller(traveller):
    """
    A TicketedTraveller: who is flying, where they sit and their e-ticket.

    `id` is the row's primary key as a string. The front end only uses it as a
    list key, and reading a ticket back has to produce the same object the
    booking call returned.
    """
    return {
        'id': str(traveller.pk),
        'type': traveller.traveller_type,
        'title': traveller.title or 'Mr',
        'firstName': traveller.first_name,
        'lastName': traveller.last_name,
        'dateOfBirth': (
            traveller.date_of_birth.isoformat()
            if traveller.date_of_birth else ''
        ),
        # Null rather than empty: the type says so, and an infant genuinely
        # has no seat rather than a blank one.
        'seatId': traveller.seat.seat_code if traveller.seat_id else None,
        'eTicket': traveller.eticket_number or '',
    }


def serialise_confirmation(
    booking, flight_booking, trip, travellers, addon_rows, payment,
):
    """
    A PlaneBookingConfirmation - what the ticket screen renders.

    The trip and the fare brand are embedded rather than referenced: the
    ticket has to keep reading correctly after the timetable and the fares
    move on, and the front end holds this object in state with nothing left to
    fetch.
    """
    return {
        'reference': booking.reference,
        'bookedAt': booking.booked_at.isoformat(),
        'status': booking.status,
        'trip': trip,
        'query': {
            # The search box holds a city, so that is what goes back - the
            # airport code is already on `trip.from`.
            'from': _place_name(flight_booking.flight.origin_airport),
            'to': _place_name(flight_booking.flight.destination_airport),
            'date': flight_booking.travel_date.isoformat(),
            'travellers': len(travellers),
        },
        'fareBrand': serialise_fare_brand(flight_booking.fare_brand),
        'travellers': [serialise_traveller(t) for t in travellers],
        'contact': {
            'email': booking.contact_email,
            'phone': booking.contact_phone,
        },
        'addOns': [row.addon.code for row in addon_rows],
        'fare': {
            'baseFare': money(flight_booking.base_fare),
            'taxes': money(flight_booking.taxes),
            'seats': money(flight_booking.seat_total),
            'addOns': money(flight_booking.addon_total),
            'convenienceFee': money(flight_booking.convenience_fee),
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
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

# Airlines cap a single booking at nine travellers, which is what
# MAX_TRAVELLERS enforces on screen.
MAX_TRAVELLERS = 9


class FlightSearchSerializer(serializers.Serializer):
    """
    Query string of `GET /api/plane/flights/`. Mirrors PlaneSearchQuery.

    The wire names are `from` and `to`, which are not usable as Python
    identifiers, so `from_query_params` renames them on the way in. That is
    the only place the two spellings meet.
    """

    from_place = serializers.CharField(max_length=150)
    to_place = serializers.CharField(max_length=150)
    date = serializers.DateField()
    # Seeded from the home search panel. It does not narrow the results - a
    # flight is listed whatever its seat count - but it is echoed back on the
    # confirmation's `query`, and a party larger than the cabin has left is
    # caught at booking.
    travellers = serializers.IntegerField(
        min_value=1, max_value=MAX_TRAVELLERS, default=1,
    )

    @classmethod
    def from_query_params(cls, params):
        return cls(data={
            'from_place': params.get('from', ''),
            'to_place': params.get('to', ''),
            'date': params.get('date', ''),
            'travellers': params.get('travellers') or 1,
        })

    def validate(self, attrs):
        if attrs['from_place'].strip().casefold() == attrs['to_place'].strip().casefold():
            raise serializers.ValidationError(
                'The origin and destination have to be different places.'
            )
        return attrs


class DateQuerySerializer(serializers.Serializer):
    """Query string of the endpoints that need only a travel date."""

    date = serializers.DateField()


class QuoteSerializer(serializers.Serializer):
    """Body of `POST /api/plane/quote/`."""

    flightId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    fareBrandCode = serializers.CharField(max_length=20)
    travellerCount = serializers.IntegerField(
        min_value=0, max_value=MAX_TRAVELLERS,
    )
    seatIds = serializers.ListField(
        child=serializers.CharField(max_length=10),
        allow_empty=True, max_length=MAX_TRAVELLERS, default=list,
    )
    addOns = serializers.ListField(
        child=serializers.CharField(max_length=20),
        allow_empty=True, max_length=len(FlightAddon.CODES), default=list,
    )


class TravellerSerializer(serializers.Serializer):
    """One row of the traveller form."""

    # The front end's own key (`t1`, `t2`), used to match `seatByTraveller`.
    # It is not stored; each traveller comes back with its row's id.
    id = serializers.CharField(max_length=40)
    type = serializers.ChoiceField(
        choices=[choice for choice, _ in FlightTraveller.TYPES],
        default=FlightTraveller.ADULT,
    )
    title = serializers.ChoiceField(
        choices=[choice for choice, _ in FlightTraveller.TITLES],
    )
    firstName = serializers.CharField(max_length=100)
    lastName = serializers.CharField(max_length=100)
    # Required for children and infants, which is a CHECK constraint in the
    # schema as well as a rule here.
    dateOfBirth = serializers.DateField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        if attrs['type'] != FlightTraveller.ADULT and not attrs['dateOfBirth']:
            raise serializers.ValidationError({
                'dateOfBirth':
                    'A date of birth is required for children and infants.',
            })
        return attrs


class ContactSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    # Ten digits, matching the `pattern` on the phone input.
    phone = serializers.RegexField(r'^\d{10}$', max_length=15)


class BookingCreateSerializer(serializers.Serializer):
    """
    Body of `POST /api/plane/bookings/`. Mirrors ConfirmFlightBookingInput,
    with ids and codes in place of the objects the front end holds in state.

    `seatTotal` is accepted and ignored if sent: the server prices the seats it
    actually assigns. Cross-field checks that need the database - the brand
    belongs to this flight, the seats are free, the add-on exists - live in
    services.py, where they run inside the transaction that takes the seats.
    """

    flightId = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    fareBrandCode = serializers.CharField(max_length=20)
    travellers = TravellerSerializer(
        many=True, allow_empty=False, max_length=MAX_TRAVELLERS,
    )
    # Traveller id -> seat code. Travellers without a seat are absent, and
    # infants must be.
    seatByTraveller = serializers.DictField(
        child=serializers.CharField(max_length=10), default=dict,
    )
    addOns = serializers.ListField(
        child=serializers.CharField(max_length=20),
        allow_empty=True, max_length=len(FlightAddon.CODES), default=list,
    )
    contact = ContactSerializer()

    def validate(self, attrs):
        travellers = attrs['travellers']
        ids = [traveller['id'] for traveller in travellers]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError({
                'travellers': 'Two travellers were sent with the same id.',
            })

        seat_by_traveller = attrs['seatByTraveller']

        unknown = sorted(set(seat_by_traveller) - set(ids))
        if unknown:
            raise serializers.ValidationError({
                'seatByTraveller':
                    f'No traveller was sent for {", ".join(unknown)}.',
            })

        seat_codes = list(seat_by_traveller.values())
        if len(set(seat_codes)) != len(seat_codes):
            raise serializers.ValidationError({
                'seatByTraveller': 'The same seat was given to two travellers.',
            })

        # An infant travels on a lap - the schema refuses a seat for one.
        infants = [
            traveller['id'] for traveller in travellers
            if traveller['type'] == FlightTraveller.INFANT
            and traveller['id'] in seat_by_traveller
        ]
        if infants:
            raise serializers.ValidationError({
                'seatByTraveller': 'An infant cannot be given a seat.',
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
    flight = row.flight

    return {
        'reference': booking.reference,
        'mode': 'plane',
        'status': booking.status,
        'title': (
            f'{flight.origin_airport.code} → '
            f'{flight.destination_airport.code}'
        ),
        'detail': f'{flight.airline.name} {flight.flight_number}',
        'travelDate': row.travel_date.isoformat(),
        'endDate': None,
        'amount': money(booking.total_amount),
        'currency': booking.currency,
        'bookedAt': booking.booked_at.isoformat(),
    }
