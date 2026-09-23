"""
HTTP layer for the train module.

Each view does the same three things: validate the request, call one function
from services.py, render the result with serializers.py. No business rule and
no query lives here.

    GET  /api/train/quotas/                          Quota[]
    GET  /api/train/trains/?from=&to=&date=&quota=   TrainTrip[]
    GET  /api/train/trains/<id>/?date=&quota=        TrainTrip
    POST /api/train/quote/                           TrainFareBreakdown
    POST /api/train/bookings/                        TrainBookingConfirmation
    GET  /api/train/bookings/<pnr>/                  TrainBookingConfirmation
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from train import services
from train.exceptions import api_exception_handler
from train.models import TrainQuota
from train.serializers import (
    BookingCreateSerializer,
    QuoteSerializer,
    TrainDetailQuerySerializer,
    TrainSearchSerializer,
    money,
    serialise_confirmation,
    serialise_fare,
)


class TrainAPIView(APIView):
    """
    Base for every view in this module.

    It names the train module's own exception handler rather than reading
    `settings.EXCEPTION_HANDLER`, so this app keeps its error envelope - and
    the `detail` payload its errors carry - without depending on a global that
    another app set.
    """

    def get_exception_handler(self):
        return api_exception_handler


class QuotaListView(TrainAPIView):
    """
    The bookable quotas, with their labels, notes and premium.

    The review step shows all three. The surcharge is a column here rather
    than a constant in the front end, so this is where the Tatkal premium is
    published - a rate the client hard-codes is one that can silently stop
    matching what is charged.
    """

    def get(self, request):
        return Response([
            {
                'id': quota.code,
                'label': quota.label,
                'note': quota.note or '',
                'surchargePercent': money(quota.surcharge_percent),
            }
            for quota in TrainQuota.objects.all()
        ])


class TrainListView(TrainAPIView):
    """
    Search results.

    Backs `searchTrains(query)`. Filtering and sorting stay on the client,
    which is where the results page already does them - one route's trains for
    one day is a short list, and re-filtering it locally keeps the sidebar
    instant.

    `quota` is an extra on top of TrainSearchQuery: fares and availability are
    stored per quota, so one has to be chosen. It defaults to `general`, which
    is what the wizard starts on.
    """

    def get(self, request):
        query = TrainSearchSerializer.from_query_params(request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        return Response(services.search_trains(
            data['from_place'], data['to_place'], data['date'], data['quota'],
        ))


class TrainDetailView(TrainAPIView):
    """
    One train, for a reload or a shared link that skips the search.

    `date` is required for the same reason it is on the search: the class list
    is the availability for a date, and there is none without one.
    """

    def get(self, request, train_id):
        query = TrainDetailQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        train = services.get_train(train_id)
        quota = services.get_quota(data['quota'])

        return Response(services.trip_payload(train, data['date'], quota))


class QuoteView(TrainAPIView):
    """
    Price a class under a quota. Backs `calculateTrainFare(...)`.

    The front end computes the same figures locally so the summary updates as
    passengers are added; this is the authoritative version, and calling it
    before payment catches a fare that moved under the traveller.
    """

    def post(self, request):
        payload = QuoteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        train = services.get_train(data['trainId'])
        train_class = services.get_class(data['classCode'])
        quota = services.get_quota(data['quota'])
        availability = services.get_availability(
            train, train_class, quota, data['date'],
        )

        fare = services.calculate_fare(
            availability, data['passengerCount'], data['insured'],
        )

        return Response({
            **serialise_fare(fare),
            # Whether the quote is still bookable, so the payment step can
            # stop a traveller who sat on the page while the class filled up.
            'availability': {
                'kind': availability.availability_kind,
                'count': availability.availability_count,
                'label': availability.availability_label,
                'confirmChance': availability.confirm_chance,
            },
        })


class BookingCreateView(TrainAPIView):
    """
    Take payment, prepare the chart and issue the ticket. Backs
    `confirmTrainBooking(input)`.

    Returns 409 when the class closed or ran short while the traveller was
    filling in the form - the request was fine, the availability moved.
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

        booking, train_booking, trip, class_option, passengers, payment = (
            services.create_booking(payload.validated_data)
        )

        return Response(
            serialise_confirmation(
                booking, train_booking, trip, class_option, passengers, payment,
            ),
            status=status.HTTP_201_CREATED,
        )


class BookingDetailView(TrainAPIView):
    """Look a ticket up by its PNR.

    Requires a signed-in account, and only ever returns that
    account's own booking - a reference is short enough to guess.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pnr):
        booking, train_booking, trip, class_option, passengers, payment = (
            services.get_booking(pnr, request.user.pk)
        )

        return Response(serialise_confirmation(
            booking, train_booking, trip, class_option, passengers, payment,
        ))
