"""
Models for the bus module.

Every model here is `managed = False` and points at a table that already
exists in MySQL. ../schema.sql is the source of truth: it is applied with the
mysql client, and Django maps onto the result rather than generating it. That
keeps the CHECK constraints, the composite unique keys and the exact column
types the schema was written for, none of which survive a round trip through
Django's migration autodetector.

Two consequences worth knowing:

  * `makemigrations` produces nothing for these tables, and `migrate` only
    creates Django's own admin/auth/session tables.
  * A schema change is made in schema.sql and applied to MySQL first, then
    mirrored here.

The shared tables (city, app_user, offer, booking, booking_fare_line, payment)
are defined in this app because the bus module is the first one built and it
needs them. When the train and flight modules land, they belong in a shared
app that all three import from.
"""
from django.db import models


# ---------------------------------------------------------------------------
# Shared reference data
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
        verbose_name_plural = 'cities'

    def __str__(self):
        return self.name


class AppUser(models.Model):
    """
    A registered traveller.

    Separate from django.contrib.auth.User on purpose: the schema models the
    site's own accounts, and bookings reference this table. Bus booking never
    requires it - a guest checkout leaves booking.user_id NULL.
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

    def __str__(self):
        return self.full_name


class Offer(models.Model):
    """
    A discount code. Referenced by `booking.offer_id`; the bus endpoints do not
    apply coupons yet, so the column stays NULL on the bookings they create.
    """

    PERCENT = 'percent'
    FLAT = 'flat'
    DISCOUNT_TYPES = [(PERCENT, 'Percent'), (FLAT, 'Flat')]

    code = models.CharField(max_length=32, unique=True)
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=500, null=True, blank=True)
    applies_to_mode = models.CharField(max_length=10, null=True, blank=True)
    discount_type = models.CharField(
        max_length=10, choices=DISCOUNT_TYPES, default=PERCENT,
    )
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

    def __str__(self):
        return self.code


# ---------------------------------------------------------------------------
# Bus inventory - mirrors frontend/src/types/bus.types.ts
# ---------------------------------------------------------------------------

SEATER = 'seater'
SLEEPER = 'sleeper'
SEAT_KINDS = [(SEATER, 'Seater'), (SLEEPER, 'Sleeper')]

LOWER = 'lower'
UPPER = 'upper'
DECKS = [(LOWER, 'Lower'), (UPPER, 'Upper')]


class BusOperator(models.Model):
    name = models.CharField(max_length=150, unique=True)
    rating = models.DecimalField(
        max_digits=2, decimal_places=1, null=True, blank=True,
    )
    rating_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'bus_operator'
        ordering = ['name']

    def __str__(self):
        return self.name


class BusAmenity(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        managed = False
        db_table = 'bus_amenity'
        ordering = ['name']
        verbose_name_plural = 'bus amenities'

    def __str__(self):
        return self.name


class BusTrip(models.Model):
    """
    A scheduled service: a route plus a timetable, not one day's run. The date
    a traveller picks lives on the booking, which is why the same trip row is
    searchable on any date.
    """

    operator = models.ForeignKey(
        BusOperator, on_delete=models.DO_NOTHING,
        db_column='operator_id', related_name='trips',
    )
    coach_name = models.CharField(max_length=150)
    seat_kind = models.CharField(max_length=10, choices=SEAT_KINDS)
    is_air_conditioned = models.BooleanField(default=True)
    layout = models.CharField(max_length=10, help_text="e.g. '2+1'")
    origin_city = models.ForeignKey(
        City, on_delete=models.DO_NOTHING,
        db_column='origin_city_id', related_name='bus_departures',
    )
    destination_city = models.ForeignKey(
        City, on_delete=models.DO_NOTHING,
        db_column='destination_city_id', related_name='bus_arrivals',
    )
    # Wall-clock 'HH:MM' on a timetable, not an instant - stored as written.
    departure_time = models.CharField(max_length=5)
    arrival_time = models.CharField(max_length=5)
    duration_minutes = models.PositiveIntegerField()
    arrives_next_day = models.BooleanField(default=False)
    base_fare = models.DecimalField(max_digits=10, decimal_places=2)
    cancellation_policy = models.CharField(
        max_length=500, null=True, blank=True,
    )
    has_live_tracking = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    amenities = models.ManyToManyField(
        BusAmenity, through='BusTripAmenity', related_name='trips',
    )

    class Meta:
        managed = False
        db_table = 'bus_trip'
        ordering = ['departure_time']

    def __str__(self):
        return f'trip {self.pk} at {self.departure_time}'


class BusTripAmenity(models.Model):
    """Join table. The schema keys it on (trip_id, amenity_id) with no id."""

    pk = models.CompositePrimaryKey('trip_id', 'amenity_id')
    trip = models.ForeignKey(
        BusTrip, on_delete=models.CASCADE,
        db_column='trip_id', related_name='trip_amenities',
    )
    amenity = models.ForeignKey(
        BusAmenity, on_delete=models.CASCADE,
        db_column='amenity_id', related_name='trip_amenities',
    )

    class Meta:
        managed = False
        db_table = 'bus_trip_amenity'
        verbose_name_plural = 'bus trip amenities'


class BusStopPoint(models.Model):
    """
    Boarding and dropping points share a table and are told apart by `kind`,
    which is how the schema stores them.
    """

    BOARDING = 'boarding'
    DROPPING = 'dropping'
    KINDS = [(BOARDING, 'Boarding'), (DROPPING, 'Dropping')]

    trip = models.ForeignKey(
        BusTrip, on_delete=models.CASCADE,
        db_column='trip_id', related_name='stop_points',
    )
    kind = models.CharField(max_length=10, choices=KINDS)
    name = models.CharField(max_length=200)
    landmark = models.CharField(max_length=200, null=True, blank=True)
    stop_time = models.CharField(max_length=5)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'bus_stop_point'
        ordering = ['sort_order', 'stop_time']

    def __str__(self):
        return f'{self.name} ({self.stop_time})'


class BusSeat(models.Model):
    """
    One seat on the map. `status` is the seat's standing sale state; whether it
    is taken on a given date comes from BusBookingSeat.
    """

    AVAILABLE = 'available'
    BLOCKED = 'blocked'
    LADIES = 'ladies'
    STATUSES = [
        (AVAILABLE, 'Available'),
        (BLOCKED, 'Blocked'),
        (LADIES, 'Ladies only'),
    ]

    trip = models.ForeignKey(
        BusTrip, on_delete=models.CASCADE,
        db_column='trip_id', related_name='seats',
    )
    # Unique within the trip, e.g. 'L4' - this is the id the front end uses.
    seat_code = models.CharField(max_length=10)
    deck = models.CharField(max_length=10, choices=DECKS)
    row_no = models.SmallIntegerField()
    column_no = models.SmallIntegerField()
    seat_kind = models.CharField(max_length=10, choices=SEAT_KINDS)
    status = models.CharField(max_length=10, choices=STATUSES, default=AVAILABLE)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        managed = False
        db_table = 'bus_seat'
        ordering = ['deck', 'row_no', 'column_no']
        constraints = [
            models.UniqueConstraint(
                fields=['trip', 'seat_code'], name='uq_bus_seat',
            ),
        ]

    def __str__(self):
        return self.seat_code


# ---------------------------------------------------------------------------
# Bookings
#
# `booking` is the supertype every mode shares; `bus_booking` carries what is
# specific to a bus ticket and keys on the same id.
# ---------------------------------------------------------------------------

class Booking(models.Model):
    BUS = 'bus'
    MODES = [
        (BUS, 'Bus'), ('train', 'Train'), ('plane', 'Plane'),
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

    # What the ticket prints, e.g. 'SBG28T5X'.
    reference = models.CharField(max_length=20, unique=True)
    mode = models.CharField(max_length=10, choices=MODES)
    # NULL for a guest checkout.
    user = models.ForeignKey(
        AppUser, on_delete=models.DO_NOTHING, db_column='user_id',
        null=True, blank=True, related_name='bookings',
    )
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    contact_email = models.EmailField(max_length=254)
    contact_phone = models.CharField(max_length=15)
    offer = models.ForeignKey(
        Offer, on_delete=models.DO_NOTHING, db_column='offer_id',
        null=True, blank=True, related_name='bookings',
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

    def __str__(self):
        return f'{self.method} {self.amount}'


class BusBooking(models.Model):
    """The bus half of a booking. Shares its primary key with `booking`."""

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, primary_key=True,
        db_column='booking_id', related_name='bus_booking',
    )
    trip = models.ForeignKey(
        BusTrip, on_delete=models.DO_NOTHING,
        db_column='trip_id', related_name='bookings',
    )
    travel_date = models.DateField()
    boarding_point = models.ForeignKey(
        BusStopPoint, on_delete=models.DO_NOTHING,
        db_column='boarding_point_id', null=True, blank=True,
        related_name='boarding_bookings',
    )
    dropping_point = models.ForeignKey(
        BusStopPoint, on_delete=models.DO_NOTHING,
        db_column='dropping_point_id', null=True, blank=True,
        related_name='dropping_bookings',
    )
    seat_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    service_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    gst = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        managed = False
        db_table = 'bus_booking'

    def __str__(self):
        return f'bus booking {self.pk}'


class BusBookingSeat(models.Model):
    """
    One seat sold, carrying the passenger sitting in it.

    The (seat_id, travel_date) unique key in the schema is what actually stops
    a seat being sold twice on the same day; the row locking in services.py
    keeps that from being the first line of defence.
    """

    booking = models.ForeignKey(
        BusBooking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='booked_seats',
    )
    seat = models.ForeignKey(
        BusSeat, on_delete=models.DO_NOTHING,
        db_column='seat_id', related_name='bookings',
    )
    travel_date = models.DateField()
    passenger_name = models.CharField(max_length=150)
    passenger_age = models.SmallIntegerField(null=True, blank=True)
    passenger_gender = models.CharField(max_length=10, null=True, blank=True)
    fare = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        managed = False
        db_table = 'bus_booking_seat'
        constraints = [
            models.UniqueConstraint(
                fields=['seat', 'travel_date'], name='uq_bus_seat_per_date',
            ),
        ]

    def __str__(self):
        return f'{self.seat_id} on {self.travel_date}'
