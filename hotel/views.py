"""
HTTP layer for the hotel module.

Each view does the same three things: validate the request, call one function
from services.py, render the result with serializers.py. No business rule and
no query lives here.

    GET  /api/hotel/amenities/?city=                    string[]
    GET  /api/hotel/stays/?city=&checkIn=&checkOut=&guests=  Property[]
    GET  /api/hotel/stays/<id>/?checkIn=&checkOut=      Property
    POST /api/hotel/quote/                              HotelFareBreakdown
    POST /api/hotel/bookings/                           HotelBookingConfirmation
    GET  /api/hotel/bookings/<bookingId>/               HotelBookingConfirmation
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hotel import services
from hotel.exceptions import api_exception_handler
from hotel.models import HotelAmenity
from hotel.serializers import (
    AmenityQuerySerializer,
    BookingCreateSerializer,
    QuoteSerializer,
    StayDetailQuerySerializer,
    StaySearchSerializer,
    serialise_confirmation,
    serialise_fare,
)


class HotelAPIView(APIView):
    """
    Base for every view in this module.

    It names the hotel module's own exception handler rather than reading
    `settings.EXCEPTION_HANDLER`, so this app keeps its error envelope - and
    the `detail` payload its errors carry - without depending on a global that
    another app set.
    """

    def get_exception_handler(self):
        return api_exception_handler


class AmenityListView(HotelAPIView):
    """
    Amenity names for the filter sidebar, replacing the `HOTEL_AMENITIES`
    constant in the front end.

    With `?city=`, only the amenities properties in that city actually offer,
    so the sidebar never shows a facet that would match nothing.
    """

    def get(self, request):
        query = AmenityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        city = query.validated_data['city'].strip()

        amenities = HotelAmenity.objects.all()
        if city:
            amenities = amenities.filter(
                property_links__property__city__name__iexact=city,
                property_links__property__is_active=True,
            ).distinct()

        return Response(list(amenities.order_by('name').values_list('name', flat=True)))


class StayListView(HotelAPIView):
    """
    Search results.

    Backs `searchStays(query)`. Filtering and sorting stay on the client,
    which is where the results page already does them - one city's stays for
    one date range is a short list, and re-filtering it locally keeps the
    sidebar instant.
    """

    def get(self, request):
        query = StaySearchSerializer.from_query_params(request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        return Response(services.search_stays(
            data['city'], data['checkIn'], data['checkOut'], data['guests'],
        ))


class StayDetailView(HotelAPIView):
    """
    One property, for a reload or a shared link that skips the search.

    The dates are required for the same reason they are on the search:
    `roomsLeft` is the number free across the whole stay, and there is no such
    number without a range.
    """

    def get(self, request, property_id):
        query = StayDetailQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        stay = services.get_property(property_id)

        return Response(services.property_payload(
            stay, data['checkIn'], data['checkOut'],
        ))


class QuoteView(HotelAPIView):
    """
    Price a stay. Backs `calculateStayFare(...)`.

    The front end computes the same figures locally so the summary updates as
    rooms and dates change; this is the authoritative version, and calling it
    before payment catches a rate that moved under the guest.
    """

    def post(self, request):
        payload = QuoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        room = services.get_room_type_by_id(data['roomTypeId'])
        rate_plan = services.get_rate_plan(room, data['ratePlanCode'])

        nights = services.nights_between(data['checkIn'], data['checkOut'])
        fare = services.calculate_fare(rate_plan, nights, data['rooms'])

        rooms_left = services.rooms_left_by_type(
            [room.pk], data['checkIn'], data['checkOut'],
        ).get(room.pk, 0)

        return Response({
            **serialise_fare(fare),
            # Whether the quote is still bookable, so the payment step can
            # stop a guest who sat on the page while the hotel filled up.
            'roomsLeft': rooms_left,
            'bookable': rooms_left >= data['rooms'],
        })


class BookingCreateView(HotelAPIView):
    """
    Take payment, hold the rooms and issue the voucher. Backs
    `confirmStay(input)`.

    Returns 409 when the rooms went while the guest was filling in the form -
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

        result = services.create_booking(payload.validated_data)

        return Response(
            serialise_confirmation(*result),
            status=status.HTTP_201_CREATED,
        )


class BookingDetailView(HotelAPIView):
    """Look a voucher up by its booking id.

    Requires a signed-in account, and only ever returns that
    account's own booking - a reference is short enough to guess.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        return Response(serialise_confirmation(
            *services.get_booking(booking_id, request.user.pk)
        ))
