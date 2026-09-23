"""
HTTP layer for the cab module.

Each view does the same three things: validate the request, call one function
from services.py, render the result with serializers.py. No business rule and
no query lives here.

    GET  /api/cab/extras/                                CabExtra[]
    GET  /api/cab/estimate/?pickup=&drop=&date=&time=    TripEstimate
    GET  /api/cab/cabs/?pickup=&drop=&date=&time=        CabOption[]
    POST /api/cab/quote/                                 CabFareBreakdown
    POST /api/cab/bookings/                              CabBookingConfirmation
    GET  /api/cab/bookings/<bookingId>/                  CabBookingConfirmation
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cab import services
from cab.exceptions import NoRateCard, api_exception_handler
from cab.models import CabExtra
from cab.serializers import (
    BookingCreateSerializer,
    QuoteSerializer,
    TripQuerySerializer,
    serialise_confirmation,
    serialise_estimate,
    serialise_extra,
    serialise_fare,
    serialise_option,
)


class CabAPIView(APIView):
    """
    Base for every view in this module.

    It names the cab module's own exception handler rather than reading
    `settings.EXCEPTION_HANDLER`, so this app keeps its error envelope - and
    the `detail` payload its errors carry - without depending on a global that
    another app set.
    """

    def get_exception_handler(self):
        return api_exception_handler


class ExtraListView(CabAPIView):
    """
    The extras on sale, replacing the `CAB_EXTRAS` constant in the front end.

    Prices live in `cab_extra`, so this is where they are published - a price
    the client hard-codes is one that can silently stop matching what is
    charged.
    """

    def get(self, request):
        return Response([
            serialise_extra(extra)
            for extra in CabExtra.objects.filter(is_active=True).order_by('id')
        ])


class EstimateView(CabAPIView):
    """
    Distance, duration, kind of journey and whether it runs overnight.

    Backs `estimateTrip(query)`, which is synchronous in the front end's mock
    because it invents the distance locally. The server owns it instead: every
    number here moves the fare, so a client cannot be the one deciding them.
    """

    def get(self, request):
        query = TripQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        return Response(serialise_estimate(services.estimate_trip(
            data['pickup'], data['drop'], data['time'],
        )))


class CabListView(CabAPIView):
    """
    Search results. Backs `searchCabs(query)`.

    Returns `CabOption[]` cheapest first. The trip estimate those fares are
    built on comes from `GET estimate/` with the same query - the two are kept
    apart because the front end holds them as separate pieces of state.
    """

    def get(self, request):
        query = TripQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        _, options = services.search_cabs(
            data['pickup'], data['drop'], data['date'], data['time'],
        )

        return Response([serialise_option(option) for option in options])


class QuoteView(CabAPIView):
    """
    Price one cab for a trip. Backs `calculateCabFare(...)`.

    The front end computes the same figures locally so the summary updates as
    extras are ticked; this is the authoritative version, and calling it
    before payment catches a rate card that changed under the passenger.
    """

    def post(self, request):
        payload = QuoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        category = services.get_category(data['categoryCode'])
        extras = services.get_extras(data['extras'])

        estimate = services.estimate_trip(
            data['pickup'], data['drop'], data['time'],
        )
        rate_card = services.active_rate_card(
            category, estimate['trip_type'], data['date'],
        )
        if rate_card is None:
            raise NoRateCard(detail={
                'categoryCode': category.code,
                'tripType': estimate['trip_type'],
            })

        option = services.price_category(category, rate_card, estimate)
        fare = services.calculate_fare(option, estimate, extras)

        return Response({
            **serialise_fare(fare),
            # The estimate the fare was built on, so the payment step can show
            # what it is charging for without a second call.
            'estimate': serialise_estimate(estimate),
        })


class BookingCreateView(CabAPIView):
    """
    Take the advance and record the trip. Backs `confirmCab(input)`.

    Returns 409 when nothing is priced for the journey on that date - the cab
    exists and the route is fine, but no rate card is in force.
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


class BookingDetailView(CabAPIView):
    """Look a trip voucher up by its booking id.

    Requires a signed-in account, and only ever returns that
    account's own booking - a reference is short enough to guess.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        return Response(serialise_confirmation(
            *services.get_booking(booking_id, request.user.pk)
        ))
