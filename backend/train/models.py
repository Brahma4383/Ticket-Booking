"""
Models for the train module.

Every model here is `managed = False` and points at a table that already
exists in MySQL. ../schema.sql is the source of truth: it is applied with the
mysql client, and Django maps onto the result rather than generating it. A
schema change goes into schema.sql, is applied to MySQL, and is then mirrored
here - not the other way round.

This app owns its own models outright, including its own mapping of the
tables every travel mode shares (`city`, `app_user`, `offer`, `booking`,
`booking_fare_line`, `payment`). The bus app maps the same six tables under
its own model classes. That is deliberate: neither app imports from the other,
so the train module can be changed, moved or dropped without touching bus.

Two model classes naming one table is fine here precisely because both are
unmanaged: Django's `models.E028` duplicate-table check only collects managed
models, nothing tries to create the table twice, and each app's foreign keys
stay inside its own app so no reverse accessor collides. Keep it that way - a
managed model over one of these tables would trip the check and, worse, let
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
        verbose_name = 'city (train)'
        verbose_name_plural = 'cities (train)'

    def __str__(self):
        return self.name


class AppUser(models.Model):
    """
    A registered traveller.

    Separate from django.contrib.auth.User on purpose: the schema models the
    site's own accounts. Train booking never requires it - a guest checkout
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
        verbose_name = 'app user (train)'

    def __str__(self):
        return self.full_name


class Offer(models.Model):
    """
    A discount code. Referenced by `booking.offer_id`; the train endpoints do
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
        verbose_name = 'offer (train)'

    def __str__(self):
        return self.code


class Booking(models.Model):
    """The supertype row every travel mode shares."""

    TRAIN = 'train'
    MODES = [
        ('bus', 'Bus'), (TRAIN, 'Train'), ('plane', 'Plane'),
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

    # A railway PNR is ten digits.
    reference = models.CharField(max_length=20, unique=True)
    mode = models.CharField(max_length=10, choices=MODES)
    # NULL for a guest checkout.
    user = models.ForeignKey(
        AppUser, on_delete=models.DO_NOTHING, db_column='user_id',
        null=True, blank=True, related_name='train_bookings',
    )
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    contact_email = models.EmailField(max_length=254)
    contact_phone = models.CharField(max_length=15)
    offer = models.ForeignKey(
        Offer, on_delete=models.DO_NOTHING, db_column='offer_id',
        null=True, blank=True, related_name='train_bookings',
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
        verbose_name = 'booking (train)'

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
        verbose_name = 'booking fare line (train)'

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
        verbose_name = 'payment (train)'

    def __str__(self):
        return f'{self.method} {self.amount}'


# ---------------------------------------------------------------------------
# Rail network - mirrors frontend/src/types/train.types.ts
# ---------------------------------------------------------------------------

class TrainStation(models.Model):
    """
    A station. `code` is what the ticket prints and what the API takes as the
    identifier - the front end's `Station` has a code and a name, no id.
    """

    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=150)
    city = models.ForeignKey(
        City, on_delete=models.DO_NOTHING, db_column='city_id',
        null=True, blank=True, related_name='stations',
    )

    class Meta:
        managed = False
        db_table = 'train_station'
        ordering = ['code']

    def __str__(self):
        return f'{self.name} ({self.code})'


class TrainClass(models.Model):
    """
    A reservation class: 1A, 2A, 3A, 3E, CC, SL, 2S.

    `reservation_charge` and `is_air_conditioned` are the two pricing inputs -
    the charge is per passenger, and only air-conditioned classes attract GST.
    """

    code = models.CharField(max_length=10, unique=True)
    label = models.CharField(max_length=100)
    is_air_conditioned = models.BooleanField(default=False)
    reservation_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    # The order the classes appear on a train card.
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'train_class'
        ordering = ['sort_order', 'code']
        verbose_name_plural = 'train classes'

    def __str__(self):
        return self.code


class TrainQuota(models.Model):
    """General, Tatkal, Ladies or Senior citizen."""

    code = models.CharField(max_length=20, unique=True)
    label = models.CharField(max_length=100)
    note = models.CharField(max_length=300, null=True, blank=True)
    # Tatkal carries a premium; the rest are priced as general. A percentage,
    # so 30.00 means a 30% premium on the base fare.
    surcharge_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
    )

    class Meta:
        managed = False
        db_table = 'train_quota'
        ordering = ['id']

    def __str__(self):
        return self.code


class Train(models.Model):
    """
    A scheduled service: a number, a route and a timetable. What is free on a
    given date lives in TrainAvailability, not here.
    """

    number = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=150)
    origin_station = models.ForeignKey(
        TrainStation, on_delete=models.DO_NOTHING,
        db_column='origin_station_id', related_name='departures',
    )
    destination_station = models.ForeignKey(
        TrainStation, on_delete=models.DO_NOTHING,
        db_column='destination_station_id', related_name='arrivals',
    )
    # Wall-clock 'HH:MM' on a timetable, not an instant - stored as written.
    departure_time = models.CharField(max_length=5)
    arrival_time = models.CharField(max_length=5)
    duration_minutes = models.PositiveIntegerField()
    # Nights on board; 0 means it arrives the same day.
    days_to_arrive = models.SmallIntegerField(default=0)
    has_pantry = models.BooleanField(default=False)
    rating = models.DecimalField(
        max_digits=2, decimal_places=1, null=True, blank=True,
    )
    runs_mon = models.BooleanField(default=True)
    runs_tue = models.BooleanField(default=True)
    runs_wed = models.BooleanField(default=True)
    runs_thu = models.BooleanField(default=True)
    runs_fri = models.BooleanField(default=True)
    runs_sat = models.BooleanField(default=True)
    runs_sun = models.BooleanField(default=True)
    cancellation_policy = models.CharField(
        max_length=500, null=True, blank=True,
    )
    is_active = models.BooleanField(default=True)

    # Monday first, matching `TrainTrip.runsOn` and `date.weekday()`.
    RUNS_FIELDS = (
        'runs_mon', 'runs_tue', 'runs_wed', 'runs_thu',
        'runs_fri', 'runs_sat', 'runs_sun',
    )

    class Meta:
        managed = False
        db_table = 'train'
        ordering = ['departure_time']

    def __str__(self):
        return f'{self.number} {self.name}'

    @property
    def runs_on(self):
        """The seven running-day flags as a list, Monday first."""
        return [getattr(self, field) for field in self.RUNS_FIELDS]

    def runs_on_date(self, travel_date):
        """`date.weekday()` is 0 for Monday, which is the order above."""
        return getattr(self, self.RUNS_FIELDS[travel_date.weekday()])


class TrainBoardingStation(models.Model):
    """
    An intermediate station a passenger may board at instead of the origin.

    The origin is not stored here - it is always available and is added by the
    serializer, which is what puts it first in `boardingStations`.
    """

    train = models.ForeignKey(
        Train, on_delete=models.CASCADE,
        db_column='train_id', related_name='boarding_stations',
    )
    station = models.ForeignKey(
        TrainStation, on_delete=models.DO_NOTHING,
        db_column='station_id', related_name='boarding_for',
    )
    departure_time = models.CharField(max_length=5)
    # Days after the journey date, for a train that boards past midnight.
    day_offset = models.SmallIntegerField(default=0)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'train_boarding_station'
        ordering = ['sort_order', 'departure_time']
        constraints = [
            models.UniqueConstraint(
                fields=['train', 'station'], name='uq_train_boarding',
            ),
        ]

    def __str__(self):
        return f'{self.station_id} at {self.departure_time}'


class TrainAvailability(models.Model):
    """
    Fare and live availability for one train, class, quota and date.

    This is the table search reads from: a train with no rows for a date has
    nothing to sell that day, and the class list on a train card is exactly
    the set of rows found.
    """

    AVAILABLE = 'available'
    RAC = 'rac'
    WAITLIST = 'waitlist'
    UNAVAILABLE = 'unavailable'
    KINDS = [
        (AVAILABLE, 'Available'), (RAC, 'RAC'),
        (WAITLIST, 'Waitlist'), (UNAVAILABLE, 'Unavailable'),
    ]

    train = models.ForeignKey(
        Train, on_delete=models.CASCADE,
        db_column='train_id', related_name='availability',
    )
    train_class = models.ForeignKey(
        TrainClass, on_delete=models.DO_NOTHING,
        db_column='class_id', related_name='availability',
    )
    quota = models.ForeignKey(
        TrainQuota, on_delete=models.DO_NOTHING,
        db_column='quota_id', related_name='availability',
    )
    travel_date = models.DateField()
    fare = models.DecimalField(max_digits=10, decimal_places=2)
    availability_kind = models.CharField(max_length=15, choices=KINDS)
    # Seats free, or the RAC/waitlist position.
    availability_count = models.IntegerField(default=0)
    # What the railways print, e.g. 'AVAILABLE-0042', 'RAC 12', 'GNWL 25'.
    availability_label = models.CharField(max_length=30)
    # Percent likelihood of confirming; only meaningful for RAC and waitlist.
    confirm_chance = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'train_availability'
        verbose_name_plural = 'train availability'
        constraints = [
            models.UniqueConstraint(
                fields=['train', 'train_class', 'quota', 'travel_date'],
                name='uq_train_availability',
            ),
        ]

    def __str__(self):
        return f'{self.train_id} {self.train_class_id} {self.availability_label}'


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class TrainBooking(models.Model):
    """The rail half of a booking. Shares its primary key with `booking`."""

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, primary_key=True,
        db_column='booking_id', related_name='train_booking',
    )
    train = models.ForeignKey(
        Train, on_delete=models.DO_NOTHING,
        db_column='train_id', related_name='bookings',
    )
    train_class = models.ForeignKey(
        TrainClass, on_delete=models.DO_NOTHING,
        db_column='class_id', related_name='bookings',
    )
    quota = models.ForeignKey(
        TrainQuota, on_delete=models.DO_NOTHING,
        db_column='quota_id', related_name='bookings',
    )
    travel_date = models.DateField()
    boarding_station = models.ForeignKey(
        TrainStation, on_delete=models.DO_NOTHING,
        db_column='boarding_station_id', null=True, blank=True,
        related_name='boarding_bookings',
    )
    base_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    quota_surcharge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    reservation_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    insurance = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    gst = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_insured = models.BooleanField(default=False)
    chart_status = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'train_booking'

    def __str__(self):
        return f'train booking {self.pk}'


class TrainPassenger(models.Model):
    """
    One traveller on a ticket, with the berth they asked for and the one the
    chart gave them. There is no seat map: the railways allot on confirmation,
    which is why the request and the allotment can differ.
    """

    NO_PREFERENCE = 'no-preference'
    BERTH_PREFERENCES = [
        (NO_PREFERENCE, 'No preference'),
        ('lower', 'Lower'), ('middle', 'Middle'), ('upper', 'Upper'),
        ('side-lower', 'Side lower'), ('side-upper', 'Side upper'),
    ]

    booking = models.ForeignKey(
        TrainBooking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='passengers',
    )
    full_name = models.CharField(max_length=150)
    age = models.SmallIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=10, null=True, blank=True)
    berth_preference = models.CharField(
        max_length=20, choices=BERTH_PREFERENCES, default=NO_PREFERENCE,
    )
    allotted_coach = models.CharField(max_length=10, null=True, blank=True)
    allotted_berth = models.CharField(max_length=60, null=True, blank=True)
    # 'CNF', 'RAC 5', 'WL 3'.
    booking_status = models.CharField(max_length=20, default='CNF')
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'train_passenger'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.full_name} ({self.booking_status})'


class MasterTrain(models.Model):
    """
    The Indian Railways station code index, backing the station dropdowns on
    the search form. Distinct from `TrainStation`, which only holds the
    stations that appear on a seeded route.
    """

    station_name = models.CharField(max_length=150)
    station_code = models.CharField(max_length=10, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'master_train'
        ordering = ['station_name']

    def __str__(self):
        return f'{self.station_name} ({self.station_code})'
