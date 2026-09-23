"""
HTTP layer for the bus module.

Each view does the same three things: validate the request, call one function
from services.py, render the result with serializers.py. No business rule and
no query lives here.

    GET  /api/bus/trips/?from=&to=&date=        BusTrip[]
    GET  /api/bus/trips/<id>/?date=             BusTrip
    GET  /api/bus/trips/<id>/seats/?date=       Deck[]
    POST /api/bus/quote/                        FareBreakdown
    POST /api/bus/bookings/                     BookingConfirmation
    GET  /api/bus/bookings/<pnr>/               BookingConfirmation
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bus import services
from bus.exceptions import InvalidSeatSelection
from bus.serializers import (
    BookingCreateSerializer,
    QuoteSerializer,
    SeatMapQuerySerializer,
    TripSearchSerializer,
    serialise_confirmation,
    serialise_decks,
    serialise_fare,
    serialise_trip,
)


class TripListView(APIView):
    """
    Search results.

    Backs `searchBuses(query)`. Filtering and sorting stay on the client, which
    is where the results page already does them - the whole day's services for
    one route is a small list, and re-filtering it locally keeps the sidebar
    instant.
    """

    def get(self, request):
        query = TripSearchSerializer.from_query_params(request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        results = services.search_trips(
            data['from_city'], data['to_city'], data['date'],
        )

        return Response([
            serialise_trip(
                result['trip'],
                fare_from=result['fare_from'],
                seats_left=result['seats_left'],
            )
            for result in results
        ])


class TripDetailView(APIView):
    """
    One service, for a reload or a shared link that skips the search.

    `date` is required for the same reason it is on the search: `fareFrom` and
    `seatsLeft` mean nothing without one.
    """

    def get(self, request, trip_id):
        query = SeatMapQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        trip = services.get_trip(trip_id)
        seats, taken = services.seat_map(trip, query.validated_data['date'])
        free = [
            seat for seat in seats
            if seat.status != seat.BLOCKED and seat.seat_code not in taken
        ]

        return Response(serialise_trip(
            trip,
            fare_from=min(
                (seat.price for seat in free), default=trip.base_fare,
            ),
            seats_left=len(free),
        ))


class SeatMapView(APIView):
    """
    The seat map for one service on one date. Backs `fetchSeatLayout(trip)`.

    The date matters: `status` is per date, because a seat sold for Tuesday is
    still on sale for Wednesday.
    """

    def get(self, request, trip_id):
        query = SeatMapQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        trip = services.get_trip(trip_id)
        seats, taken = services.seat_map(trip, query.validated_data['date'])

        return Response(serialise_decks(seats, taken))


class QuoteView(APIView):
    """
    Price a seat selection. Backs `calculateFare(seats)`.

    The front end computes the same figures locally so the summary updates as
    seats are ticked; this is the authoritative version, and calling it before
    payment catches a price that moved under the traveller.
    """

    def post(self, request):
        payload = QuoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        trip = services.get_trip(data['tripId'])
        seats, taken = services.seat_map(trip, data['date'])
        by_code = {seat.seat_code: seat for seat in seats}

        missing = [code for code in data['seatIds'] if code not in by_code]
        if missing:
            raise InvalidSeatSelection(
                'Some of those seats are not on this bus.',
                detail={'seatIds': missing},
            )

        fare = services.calculate_fare(
            [by_code[code].price for code in data['seatIds']]
        )

        return Response({
            **serialise_fare(fare['seat_total'], fare['service_fee'], fare['gst']),
            # Whether the quote is still bookable, so the payment step can stop
            # a traveller who sat on the page while the bus filled up.
            'unavailableSeatIds': [
                code for code in data['seatIds'] if code in taken
                or by_code[code].status == by_code[code].BLOCKED
            ],
        })


class BookingCreateView(APIView):
    """
    Take payment and issue the ticket. Backs `confirmBooking(input)`.

    Returns 409 when a seat went while the traveller was filling in the form -
    the request was fine, the inventory moved.
    Requires a signed-in account. DRF answers an anonymous request with 401
    and a `WWW-Authenticate: Bearer` header, which is the front end's cue to
    offer a sign-in rather than an error.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = BookingCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        # The account comes from the token, never from the payload - a
        # client does not get to book in someone else's name.
        payload.validated_data['userId'] = request.user.pk

        booking, bus_booking, trip, booked_seats, payment = (
            services.create_booking(payload.validated_data)
        )

        return Response(
            serialise_confirmation(
                booking, bus_booking, trip, booked_seats, payment,
            ),
            status=status.HTTP_201_CREATED,
        )


class BookingDetailView(APIView):
    """Look a ticket up by its PNR.

    Requires a signed-in account, and only ever returns that
    account's own booking - a reference is short enough to guess.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, reference):
        booking, bus_booking, trip, booked_seats, payment = (
            services.get_booking(reference, request.user.pk)
        )

        return Response(serialise_confirmation(
            booking, bus_booking, trip, booked_seats, payment,
        ))
