"""
Models for the cab module.

Every model here is `managed = False` and points at a table that already
exists in MySQL. ../schema.sql is the source of truth: it is applied with the
mysql client, and Django maps onto the result rather than generating it. A
schema change goes into schema.sql, is applied to MySQL, and is then mirrored
here - not the other way round.

This app owns its own models outright, including its own mapping of the tables
every travel mode shares (`city`, `app_user`, `offer`, `booking`,
`booking_fare_line`, `payment`). The bus, train, plane and hotel apps map the
same six tables under their own model classes. That is deliberate: no module
imports another, so any one of them can be changed, moved or dropped on its
own.

Several model classes naming one table is fine here precisely because they are
all unmanaged: Django's `models.E028` duplicate-table check only collects
managed models, nothing tries to create a table twice, and each app's foreign
keys stay inside its own app so no reverse accessor collides. Keep it that way
- a managed model over one of these tables would trip the check and, worse, let
`migrate` rewrite a table schema.sql owns.
"""
from django.db import models


# ---------------------------------------------------------------------------
# Shared tables, mapped for this app's own use
# ---------------------------------------------------------------------------

class City(models.Model):
    """Mirrors CITIES in frontend/src/constants/index.ts."""

    name = models.CharField(max_length=120, unique=True)
    state = models.CharField(max_length=120, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'city'
        ordering = ['name']
        verbose_name = 'city (cab)'
        verbose_name_plural = 'cities (cab)'

    def __str__(self):
        return self.name


class AppUser(models.Model):
    """
    A registered traveller.

    Separate from django.contrib.auth.User on purpose: the schema models the
    site's own accounts. Booking a cab never requires it - a guest checkout
    leaves booking.user_id NULL.
    """

    full_name = models.CharField(max_length=150)
    email = models.EmailField(max_length=254, unique=True)
    phone = models.CharField(max_length=15, null=True, blank=True, unique=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'app_user'
        verbose_name = 'app user (cab)'

    def __str__(self):
        return self.full_name


class Offer(models.Model):
    """
    A discount code. Referenced by `booking.offer_id`; the cab endpoints do
    not apply coupons yet, so the column stays NULL on the bookings they make.
    """

    code = models.CharField(max_length=32, unique=True)
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=500, null=True, blank=True)
    applies_to_mode = models.CharField(max_length=10, null=True, blank=True)
    discount_type = models.CharField(max_length=10, default='percent')
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    max_discount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
    )
    min_booking_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'offer'
        verbose_name = 'offer (cab)'

    def __str__(self):
        return self.code


class Booking(models.Model):
    """The supertype row every travel mode shares."""

    CAB = 'cab'
    MODES = [
        ('bus', 'Bus'), ('train', 'Train'), ('plane', 'Plane'),
        ('hotel', 'Hotel'), (CAB, 'Cab'),
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

    # An eight-character trip id, e.g. 'CBCMBFRE'.
    reference = models.CharField(max_length=20, unique=True)
    mode = models.CharField(max_length=10, choices=MODES)
    # NULL for a guest checkout.
    user = models.ForeignKey(
        AppUser, on_delete=models.DO_NOTHING, db_column='user_id',
        null=True, blank=True, related_name='cab_bookings',
    )
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    contact_email = models.EmailField(max_length=254)
    contact_phone = models.CharField(max_length=15)
    offer = models.ForeignKey(
        Offer, on_delete=models.DO_NOTHING, db_column='offer_id',
        null=True, blank=True, related_name='cab_bookings',
    )
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
        verbose_name = 'booking (cab)'

    def __str__(self):
        return self.reference


class BookingFareLine(models.Model):
    """One visible row of the fare breakdown, as the summary card renders it."""

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
        verbose_name = 'booking fare line (cab)'

    def __str__(self):
        return f'{self.label}: {self.amount}'


class Payment(models.Model):
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
    # The bank or wallet chosen, or the UPI handle used.
    instrument = models.CharField(max_length=100, null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    transaction_ref = models.CharField(max_length=64, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'payment'
        verbose_name = 'payment (cab)'

    def __str__(self):
        return f'{self.method} {self.amount}'


# ---------------------------------------------------------------------------
# Fleet and pricing - mirrors frontend/src/types/cab.types.ts
# ---------------------------------------------------------------------------

OUTSTATION = 'outstation'
AIRPORT = 'airport'
LOCAL = 'local'
TRIP_TYPES = [
    (OUTSTATION, 'Outstation'), (AIRPORT, 'Airport'), (LOCAL, 'Local'),
]


class CabCategory(models.Model):
    """
    A class of vehicle. `code` is what the front end calls `category`, and is
    the identifier the API takes.
    """

    HATCHBACK = 'hatchback'
    SEDAN = 'sedan'
    SUV = 'suv'
    PREMIUM = 'premium'
    CODES = [
        (HATCHBACK, 'Hatchback'), (SEDAN, 'Sedan'),
        (SUV, 'SUV'), (PREMIUM, 'Premium SUV'),
    ]

    code = models.CharField(max_length=20, choices=CODES, unique=True)
    name = models.CharField(max_length=100)
    # Representative models, e.g. 'Swift Dzire, Etios or similar'. The column
    # is `models`, but a field of that name would rebind the `models` module
    # inside this class body and break every field declared after it.
    vehicle_models = models.CharField(
        max_length=200, null=True, blank=True, db_column='models',
    )
    seats = models.SmallIntegerField(default=4)
    # Number of large bags that fit.
    luggage = models.SmallIntegerField(default=2)
    is_air_conditioned = models.BooleanField(default=True)
    rating = models.DecimalField(
        max_digits=2, decimal_places=1, null=True, blank=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'cab_category'
        ordering = ['id']
        verbose_name_plural = 'cab categories'

    def __str__(self):
        return self.name


class CabRateCard(models.Model):
    """
    What a category costs for a kind of journey.

    Pricing varies by both, which is why the rate card is a table rather than
    a column on the category: an SUV to the airport and the same SUV on a
    500 km run are not the same product.

    `valid_from` and `valid_to` let a new card be loaded before it takes
    effect; a NULL on either side means open-ended.
    """

    category = models.ForeignKey(
        CabCategory, on_delete=models.CASCADE,
        db_column='category_id', related_name='rate_cards',
    )
    trip_type = models.CharField(max_length=20, choices=TRIP_TYPES)
    per_km_rate = models.DecimalField(max_digits=10, decimal_places=2)
    # Charged even on a shorter run - a 40 km trip on a 100 km minimum pays
    # for 100.
    minimum_km = models.SmallIntegerField(default=100)
    extra_km_rate = models.DecimalField(max_digits=10, decimal_places=2)
    # Paid to the driver on trips that keep him overnight.
    driver_allowance = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    night_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    cancellation_note = models.CharField(
        max_length=200, null=True, blank=True,
    )
    valid_from = models.DateField(null=True, blank=True)
    valid_to = models.DateField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'cab_rate_card'
        ordering = ['category_id', 'trip_type', '-valid_from']
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'trip_type', 'valid_from'],
                name='uq_cab_rate_card',
            ),
        ]

    def __str__(self):
        return f'{self.category_id} {self.trip_type} @ {self.per_km_rate}'


class CabExtra(models.Model):
    """Mirrors CAB_EXTRAS in frontend/src/services/cab.services.ts."""

    CARRIER = 'carrier'
    CHILD_SEAT = 'childSeat'
    EXTRA_STOP = 'extraStop'
    CODES = [
        (CARRIER, 'Roof carrier'), (CHILD_SEAT, 'Child seat'),
        (EXTRA_STOP, 'One extra stop'),
    ]

    code = models.CharField(max_length=20, choices=CODES, unique=True)
    label = models.CharField(max_length=150)
    description = models.CharField(max_length=300, null=True, blank=True)
    # Charged once for the trip, not per passenger.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'cab_extra'
        ordering = ['id']

    def __str__(self):
        return self.code


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class CabBooking(models.Model):
    """The cab half of a booking. Shares its primary key with `booking`."""

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, primary_key=True,
        db_column='booking_id', related_name='cab_booking',
    )
    category = models.ForeignKey(
        CabCategory, on_delete=models.DO_NOTHING,
        db_column='category_id', related_name='bookings',
    )
    # The card the fare was quoted from. Nullable so a booking survives a card
    # being retired, which would otherwise take the trip's history with it.
    rate_card = models.ForeignKey(
        CabRateCard, on_delete=models.DO_NOTHING,
        db_column='rate_card_id', null=True, blank=True,
        related_name='bookings',
    )
    trip_type = models.CharField(max_length=20, choices=TRIP_TYPES)
    pickup_address = models.CharField(max_length=500)
    drop_address = models.CharField(max_length=500)
    pickup_at = models.DateTimeField()
    distance_km = models.PositiveIntegerField(default=0)
    duration_minutes = models.PositiveIntegerField(default=0)
    is_night_trip = models.BooleanField(default=False)
    passenger_name = models.CharField(max_length=150)
    passenger_phone = models.CharField(max_length=15)
    base_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    extras_total = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    driver_allowance = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    # Estimated; settled against actual receipts.
    tolls_state_tax = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    night_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    gst = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # The fare splits: an advance online, the balance paid to the driver.
    pay_now = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pay_to_driver = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    # Filled in once a vehicle is assigned, two hours before pickup.
    driver_name = models.CharField(max_length=120, null=True, blank=True)
    driver_phone = models.CharField(max_length=15, null=True, blank=True)
    vehicle_number = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'cab_booking'

    def __str__(self):
        return f'cab booking {self.pk}'


class CabBookingExtra(models.Model):
    """
    An extra taken on a trip. The schema keys it on (booking_id, extra_id)
    with no id of its own.
    """

    pk = models.CompositePrimaryKey('booking_id', 'extra_id')
    booking = models.ForeignKey(
        CabBooking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='extras',
    )
    extra = models.ForeignKey(
        CabExtra, on_delete=models.DO_NOTHING,
        db_column='extra_id', related_name='bookings',
    )
    # The price as charged, kept so the trip still adds up after the
    # catalogue price moves.
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        managed = False
        db_table = 'cab_booking_extra'

    def __str__(self):
        return f'{self.extra_id}: {self.amount}'
