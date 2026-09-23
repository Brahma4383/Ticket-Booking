"""
HTTP layer for the plane module.

Each view does the same three things: validate the request, call one function
from services.py, render the result with serializers.py. No business rule and
no query lives here.

    GET  /api/plane/addons/                             AddOn[]
    GET  /api/plane/flights/?from=&to=&date=&travellers= FlightTrip[]
    GET  /api/plane/flights/<id>/?date=                 FlightTrip
    GET  /api/plane/flights/<id>/seats/?date=           CabinLayout
    POST /api/plane/quote/                              PlaneFareBreakdown
    POST /api/plane/bookings/                           PlaneBookingConfirmation
    GET  /api/plane/bookings/<reference>/               PlaneBookingConfirmation
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from plane import services
from plane.exceptions import InvalidSelection, api_exception_handler
from plane.models import FlightAddon
from plane.serializers import (
    BookingCreateSerializer,
    DateQuerySerializer,
    FlightSearchSerializer,
    QuoteSerializer,
    serialise_addon,
    serialise_cabin,
    serialise_confirmation,
    serialise_fare,
    serialise_trip,
)


class PlaneAPIView(APIView):
    """
    Base for every view in this module.

    It names the plane module's own exception handler rather than reading
    `settings.EXCEPTION_HANDLER`, so this app keeps its error envelope - and
    the `detail` payload its errors carry - without depending on a global that
    another app set.
    """

    def get_exception_handler(self):
        return api_exception_handler


class AddOnListView(PlaneAPIView):
    """
    The add-ons on sale, replacing the `ADD_ONS` constant in the front end.

    Prices are charged per traveller and live in `flight_addon`, so this is
    where they are published - a price the client hard-codes is one that can
    silently stop matching what is charged.
    """

    def get(self, request):
        return Response([
            serialise_addon(addon)
            for addon in FlightAddon.objects.filter(is_active=True).order_by('id')
        ])


class FlightListView(PlaneAPIView):
    """
    Search results.

    Backs `searchFlights(query)`. Filtering and sorting stay on the client,
    which is where the results page already does them - one route's departures
    for one day is a short list, and re-filtering it locally keeps the sidebar
    instant.
    """

    def get(self, request):
        query = FlightSearchSerializer.from_query_params(request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        return Response(services.search_flights(
            data['from_place'], data['to_place'], data['date'],
        ))


class FlightDetailView(PlaneAPIView):
    """
    One flight, for a reload or a shared link that skips the search.

    `date` is required for the same reason it is on the search: `seatsLeft`
    means nothing without one.
    """

    def get(self, request, flight_id):
        query = DateQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        flight = services.get_flight(flight_id)
        seats, taken = services.cabin(flight, query.validated_data['date'])

        return Response(serialise_trip(
            flight, seats_left=len(seats) - len(taken),
        ))


class CabinView(PlaneAPIView):
    """
    The cabin map for one flight on one date. Backs `fetchCabinLayout(trip)`.

    The date matters: `occupied` is per date, because a seat sold for Tuesday
    is free again on Wednesday.
    """

    def get(self, request, flight_id):
        query = DateQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        flight = services.get_flight(flight_id)
        seats, taken = services.cabin(flight, query.validated_data['date'])

        return Response(serialise_cabin(seats, taken))


class QuoteView(PlaneAPIView):
    """
    Price a fare brand. Backs `calculatePlaneFare(...)`.

    The front end computes the same figures locally so the summary updates as
    travellers and add-ons are picked; this is the authoritative version, and
    calling it before payment catches a seat or a price that moved under the
    traveller.
    """

    def post(self, request):
        payload = QuoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        flight = services.get_flight(data['flightId'])
        fare_brand = services.get_fare_brand(flight, data['fareBrandCode'])
        addons = services.get_addons(data['addOns'])

        seats, taken = services.cabin(flight, data['date'])
        by_code = {seat.seat_code: seat for seat in seats}

        missing = [code for code in data['seatIds'] if code not in by_code]
        if missing:
            raise InvalidSelection(
                'Some of those seats are not on this aircraft.',
                detail={'seatIds': missing},
            )

        seat_total = sum(by_code[code].price for code in data['seatIds'])
        fare = services.calculate_fare(
            fare_brand, data['travellerCount'], seat_total, addons,
        )

        return Response({
            **serialise_fare(fare),
            # Whether the quote is still bookable, so the payment step can stop
            # a traveller who sat on the page while the cabin filled up.
            'unavailableSeatIds': [
                code for code in data['seatIds'] if code in taken
            ],
        })


class BookingCreateView(PlaneAPIView):
    """
    Take payment and issue the tickets. Backs `confirmFlightBooking(input)`.

    Returns 409 when a seat went while the traveller was filling in the form -
    the request was fine, the cabin moved.
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

        result = services.create_booking(payload.validated_data)

        return Response(
            serialise_confirmation(*result),
            status=status.HTTP_201_CREATED,
        )


class BookingDetailView(PlaneAPIView):
    """Look a ticket up by its booking reference.

    Requires a signed-in account, and only ever returns that
    account's own booking - a reference is short enough to guess.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, reference):
        return Response(serialise_confirmation(
            *services.get_booking(reference, request.user.pk)
        ))
