"""
Models for the payments module.

The three shared tables every travel mode writes - `booking`,
`booking_fare_line` and `payment` - mapped under this app's own classes, plus
`app_user` so `booking.user_id` resolves. All `managed = False`, over tables
../schema.sql already made, exactly as every travel module maps them.

This app never creates a booking. It reads one to find what is owed, writes a
`payment` row for every attempt to pay it, and moves `booking.status` on:
`pending` to `confirmed` when a payment goes through, `pending` to `failed`
when the hold runs out unpaid.
"""
from django.db import models


class AppUser(models.Model):
    """Read only here, so `booking.user_id` has something to point at."""

    full_name = models.CharField(max_length=150)
    email = models.EmailField(max_length=254, unique=True)
    phone = models.CharField(max_length=15, null=True, blank=True, unique=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'app_user'
        verbose_name = 'account (payments)'

    def __str__(self):
        return f'{self.full_name} <{self.email}>'


class Booking(models.Model):
    """The supertype row every travel mode shares."""

    MODES = [
        ('bus', 'Bus'), ('train', 'Train'), ('plane', 'Plane'),
        ('hotel', 'Hotel'), ('cab', 'Cab'),
    ]

    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'
    FAILED = 'failed'
    STATUSES = [
        (PENDING, 'Pending'), (CONFIRMED, 'Confirmed'),
        (CANCELLED, 'Cancelled'), (COMPLETED, 'Completed'), (FAILED, 'Failed'),
    ]

    reference = models.CharField(max_length=20, unique=True)
    mode = models.CharField(max_length=10, choices=MODES)
    user = models.ForeignKey(
        AppUser, on_delete=models.DO_NOTHING, db_column='user_id',
        null=True, blank=True, related_name='payment_bookings',
    )
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    contact_email = models.EmailField(max_length=254)
    contact_phone = models.CharField(max_length=15)
    discount_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    total_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    currency = models.CharField(max_length=3, default='INR')
    booked_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'booking'
        ordering = ['-booked_at']
        verbose_name = 'booking (payments)'

    def __str__(self):
        return self.reference


class BookingFareLine(models.Model):
    """One visible row of the fare breakdown, as the receipt prints it."""

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='fare_lines',
    )
    label = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'booking_fare_line'
        ordering = ['sort_order']
        verbose_name = 'fare line (payments)'

    def __str__(self):
        return f'{self.label}: {self.amount}'


class Payment(models.Model):
    """
    One attempt to pay for a booking.

    A booking can have several: a declined card followed by a UPI payment
    that went through is two rows, one `failed` and one `success`. The
    successful one is what the ticket prints, and the one a cancellation
    later flips to `refunded`.
    """

    UPI = 'upi'
    CARD = 'card'
    NETBANKING = 'netbanking'
    WALLET = 'wallet'
    METHODS = [
        (UPI, 'UPI'), (CARD, 'Card'),
        (NETBANKING, 'Netbanking'), (WALLET, 'Wallet'),
    ]

    PENDING = 'pending'
    SUCCESS = 'success'
    FAILED = 'failed'
    REFUNDED = 'refunded'
    STATUSES = [
        (PENDING, 'Pending'), (SUCCESS, 'Success'),
        (FAILED, 'Failed'), (REFUNDED, 'Refunded'),
    ]

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='payments',
    )
    method = models.CharField(max_length=15, choices=METHODS)
    # The bank or wallet chosen, the UPI handle used, or a masked card.
    instrument = models.CharField(max_length=100, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    transaction_ref = models.CharField(max_length=64, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'payment'
        verbose_name = 'payment (payments)'

    def __str__(self):
        return f'{self.transaction_ref or "-"} {self.method} {self.amount} {self.status}'
