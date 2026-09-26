"""
HTTP layer for the payments module.

    GET  /api/payments/                         every attempt this account made
    GET  /api/payments/<txn>/                   one attempt, with fare lines
    GET  /api/payments/<mode>/<reference>/      what a pending booking still owes
    POST /api/payments/<mode>/<reference>/      pay for it

Every route needs a signed-in account: a payment is always for a booking,
and a booking always belongs to one. Each view validates, calls one function
from services.py and renders it; no rule and no query lives here.
"""
from importlib import import_module

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from payments import services
from payments.exceptions import api_exception_handler
from payments.serializers import (
    PaymentRequestSerializer,
    serialise_order,
    serialise_payment,
    serialise_receipt,
    serialise_transaction,
)


class PaymentsAPIView(APIView):
    """Base for every view here: an account is required, and errors take
    this module's envelope rather than the global one."""

    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return api_exception_handler


def _confirmation(mode, reference, user_id):
    """
    The travel module's own BookingConfirmation, exactly as its
    `bookings/<reference>/` returns it.

    Handed back with the payment so the screen that just paid has the whole
    ticket - now `confirmed`, with the payment on it - and nothing left to
    fetch. Each module's `get_booking` returns the positional arguments its
    own `serialise_confirmation` takes, which is what makes this generic.
    """
    mod_services = services.module_for(mode)
    mod_serializers = import_module(f'{mode}.serializers')
    return mod_serializers.serialise_confirmation(
        *mod_services.get_booking(reference, user_id)
    )


class PayView(PaymentsAPIView):
    """
    Pay for a pending booking, or ask what it still owes.

    `POST` answers 200 with `{ payment, booking }` when the money went
    through; 402 `payment_declined` when it did not, with the failed attempt's
    reference in `detail`; 409 `payment_expired` when the hold ran out first.

    `GET` is for the account page's "complete payment" link: the amount due,
    the deadline, every attempt so far and the fare lines to show beside the
    form.
    """

    def get(self, request, mode, reference):
        booking, amount, payments, fare_lines = services.order(
            request.user.pk, mode, reference,
        )
        return Response(serialise_order(booking, amount, payments, fare_lines))

    def post(self, request, mode, reference):
        payload = PaymentRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        payment, booking = services.pay(
            request.user.pk, mode, reference, data['method'], data,
        )

        return Response({
            'payment': serialise_payment(payment, booking.currency),
            'booking': _confirmation(mode, booking.reference, request.user.pk),
        })


class TransactionListView(PaymentsAPIView):
    """Every attempt, succeeded or not, newest first. Backs the account's
    Payments tab."""

    def get(self, request):
        return Response({
            'transactions': [
                serialise_transaction(payment)
                for payment in services.list_transactions(request.user.pk)
            ],
        })


class TransactionDetailView(PaymentsAPIView):
    """One attempt with the fare it paid for - the receipt."""

    def get(self, request, transaction_ref):
        payment, fare_lines = services.get_transaction(
            request.user.pk, transaction_ref,
        )
        return Response(serialise_receipt(payment, fare_lines))
