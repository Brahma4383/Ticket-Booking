"""
Models for the plane module.

Every model here is `managed = False` and points at a table that already
exists in MySQL. ../schema.sql is the source of truth: it is applied with the
mysql client, and Django maps onto the result rather than generating it. A
schema change goes into schema.sql, is applied to MySQL, and is then mirrored
here - not the other way round.

This app owns its own models outright, including its own mapping of the tables
every travel mode shares (`city`, `app_user`, `offer`, `booking`,
`booking_fare_line`, `payment`). The bus and train apps map the same six tables
under their own model classes. That is deliberate: no module imports another,
so any one of them can be changed, moved or dropped on its own.

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
        verbose_name = 'city (plane)'
        verbose_name_plural = 'cities (plane)'

    def __str__(self):
        return self.name


class AppUser(models.Model):
    """
    A registered traveller.

    Separate from django.contrib.auth.User on purpose: the schema models the
    site's own accounts. Booking a flight never requires it - a guest checkout
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
        verbose_name = 'app user (plane)'

    def __str__(self):
        return self.full_name


class Offer(models.Model):
    """
    A discount code. Referenced by `booking.offer_id`; the plane endpoints do
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
        verbose_name = 'offer (plane)'

    def __str__(self):
        return self.code


class Booking(models.Model):
    """The supertype row every travel mode shares."""

    PLANE = 'plane'
    MODES = [
        ('bus', 'Bus'), ('train', 'Train'), (PLANE, 'Plane'),
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

    # A six-character airline booking reference, e.g. 'S7YH3U'.
    reference = models.CharField(max_length=20, unique=True)
    mode = models.CharField(max_length=10, choices=MODES)
    # NULL for a guest checkout.
    user = models.ForeignKey(
        AppUser, on_delete=models.DO_NOTHING, db_column='user_id',
        null=True, blank=True, related_name='flight_bookings',
    )
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    contact_email = models.EmailField(max_length=254)
    contact_phone = models.CharField(max_length=15)
    offer = models.ForeignKey(
        Offer, on_delete=models.DO_NOTHING, db_column='offer_id',
        null=True, blank=True, related_name='flight_bookings',
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
        verbose_name = 'booking (plane)'

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
        verbose_name = 'booking fare line (plane)'

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
        verbose_name = 'payment (plane)'

    def __str__(self):
        return f'{self.method} {self.amount}'


# ---------------------------------------------------------------------------
# Network - mirrors frontend/src/types/plane.types.ts
# ---------------------------------------------------------------------------

ECONOMY = 'economy'
PREMIUM = 'premium'
BUSINESS = 'business'
CABIN_CLASSES = [
    (ECONOMY, 'Economy'), (PREMIUM, 'Premium'), (BUSINESS, 'Business'),
]


class Airline(models.Model):
    # Two-character carrier code, e.g. '6E'.
    code = models.CharField(max_length=5, unique=True)
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'airline'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.code})'


class Airport(models.Model):
    """
    An airport. `code` is the IATA code the ticket prints and what the API
    takes as the identifier - the front end's `Airport` has no id.
    """

    code = models.CharField(max_length=5, unique=True)
    name = models.CharField(max_length=150)
    city = models.ForeignKey(
        City, on_delete=models.DO_NOTHING, db_column='city_id',
        null=True, blank=True, related_name='airports',
    )

    class Meta:
        managed = False
        db_table = 'airport'
        ordering = ['code']

    def __str__(self):
        return f'{self.name} ({self.code})'


class Flight(models.Model):
    """
    A scheduled service: a carrier, a number, a route and a timetable. What is
    free on a given date comes from the travellers already seated on it.
    """

    airline = models.ForeignKey(
        Airline, on_delete=models.DO_NOTHING,
        db_column='airline_id', related_name='flights',
    )
    flight_number = models.CharField(max_length=10)
    aircraft = models.CharField(max_length=120, null=True, blank=True)
    origin_airport = models.ForeignKey(
        Airport, on_delete=models.DO_NOTHING,
        db_column='origin_airport_id', related_name='departures',
    )
    origin_terminal = models.CharField(max_length=10, null=True, blank=True)
    destination_airport = models.ForeignKey(
        Airport, on_delete=models.DO_NOTHING,
        db_column='destination_airport_id', related_name='arrivals',
    )
    destination_terminal = models.CharField(
        max_length=10, null=True, blank=True,
    )
    # Wall-clock 'HH:MM' on a timetable, not an instant - stored as written.
    departure_time = models.CharField(max_length=5)
    arrival_time = models.CharField(max_length=5)
    duration_minutes = models.PositiveIntegerField()
    # 0 when it lands the same day.
    days_to_arrive = models.SmallIntegerField(default=0)
    cabin_class = models.CharField(
        max_length=10, choices=CABIN_CLASSES, default=ECONOMY,
    )
    # Percentage of departures on time over the last month.
    on_time_percent = models.SmallIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'flight'
        ordering = ['departure_time']
        constraints = [
            models.UniqueConstraint(
                fields=['airline', 'flight_number'], name='uq_flight',
            ),
        ]

    def __str__(self):
        return f'{self.airline_id}{self.flight_number}'


class FlightStop(models.Model):
    """
    An intermediate stop. A non-stop flight has no rows here, which is what
    makes `stops` empty rather than absent on the front end.
    """

    flight = models.ForeignKey(
        Flight, on_delete=models.CASCADE,
        db_column='flight_id', related_name='stops',
    )
    airport = models.ForeignKey(
        Airport, on_delete=models.DO_NOTHING,
        db_column='airport_id', related_name='layovers',
    )
    # Time on the ground.
    layover_minutes = models.PositiveIntegerField()
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'flight_stop'
        ordering = ['sort_order']

    def __str__(self):
        return f'{self.airport_id} ({self.layover_minutes}m)'


class FareBrand(models.Model):
    """
    A fare family: the same seat sold under different baggage and change
    rules. A flight carries one row per brand it offers.
    """

    SAVER = 'saver'
    COMFORT = 'comfort'
    FLEXI = 'flexi'
    CODES = [(SAVER, 'Saver'), (COMFORT, 'Comfort'), (FLEXI, 'Flexi')]

    FEE = 'fee'
    REDUCED = 'reduced'
    FREE = 'free'
    # How favourable each rule is, worst to best.
    TIERS = [(FEE, 'Fee'), (REDUCED, 'Reduced'), (FREE, 'Free')]

    flight = models.ForeignKey(
        Flight, on_delete=models.CASCADE,
        db_column='flight_id', related_name='fares',
    )
    code = models.CharField(max_length=20, choices=CODES)
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    cabin_baggage_kg = models.SmallIntegerField(default=7)
    checkin_baggage_kg = models.SmallIntegerField(default=15)
    cancellation_note = models.CharField(
        max_length=200, null=True, blank=True,
    )
    cancellation_tier = models.CharField(
        max_length=10, choices=TIERS, default=FEE,
    )
    date_change_note = models.CharField(max_length=200, null=True, blank=True)
    date_change_tier = models.CharField(
        max_length=10, choices=TIERS, default=FEE,
    )
    free_seat_selection = models.BooleanField(default=False)
    meal_included = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'fare_brand'
        ordering = ['price']
        constraints = [
            models.UniqueConstraint(
                fields=['flight', 'code'], name='uq_fare_brand',
            ),
        ]

    def __str__(self):
        return f'{self.name} {self.price}'


class FlightSeat(models.Model):
    """
    One seat in the cabin. Whether it is taken on a given date comes from
    FlightTraveller, not from a column here.
    """

    FRONT = 'front'
    EXTRA_LEGROOM = 'extra-legroom'
    STANDARD = 'standard'
    ZONES = [
        (FRONT, 'Front'), (EXTRA_LEGROOM, 'Extra legroom'),
        (STANDARD, 'Standard'),
    ]

    flight = models.ForeignKey(
        Flight, on_delete=models.CASCADE,
        db_column='flight_id', related_name='seats',
    )
    # Unique within the flight, e.g. '12A' - this is the id the front end uses.
    seat_code = models.CharField(max_length=10)
    row_no = models.SmallIntegerField()
    seat_column = models.CharField(max_length=1)
    zone = models.CharField(max_length=20, choices=ZONES, default=STANDARD)
    # Zero means the seat is free to pick.
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_window = models.BooleanField(default=False)
    is_aisle = models.BooleanField(default=False)
    is_exit_row = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'flight_seat'
        ordering = ['row_no', 'seat_column']
        constraints = [
            models.UniqueConstraint(
                fields=['flight', 'seat_code'], name='uq_flight_seat',
            ),
        ]

    def __str__(self):
        return self.seat_code


class FlightAddon(models.Model):
    """Mirrors ADD_ONS in frontend/src/services/plane.services.ts."""

    MEAL = 'meal'
    BAGGAGE = 'baggage'
    PRIORITY = 'priority'
    CODES = [(MEAL, 'Meal'), (BAGGAGE, 'Baggage'), (PRIORITY, 'Priority')]

    code = models.CharField(max_length=20, choices=CODES, unique=True)
    label = models.CharField(max_length=150)
    description = models.CharField(max_length=300, null=True, blank=True)
    # Charged once per traveller.
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'flight_addon'
        ordering = ['id']

    def __str__(self):
        return self.code


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class FlightBooking(models.Model):
    """The air half of a booking. Shares its primary key with `booking`."""

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, primary_key=True,
        db_column='booking_id', related_name='flight_booking',
    )
    flight = models.ForeignKey(
        Flight, on_delete=models.DO_NOTHING,
        db_column='flight_id', related_name='bookings',
    )
    fare_brand = models.ForeignKey(
        FareBrand, on_delete=models.DO_NOTHING,
        db_column='fare_brand_id', related_name='bookings',
    )
    travel_date = models.DateField()
    base_fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Airline surcharges plus government levies.
    taxes = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    seat_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    addon_total = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    convenience_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )

    class Meta:
        managed = False
        db_table = 'flight_booking'

    def __str__(self):
        return f'flight booking {self.pk}'


class FlightTraveller(models.Model):
    """
    One person on a ticket, with the seat they took and their e-ticket number.

    An infant never gets a seat, and anyone who is not an adult must have a
    date of birth - both are CHECK constraints in the schema.
    """

    ADULT = 'adult'
    CHILD = 'child'
    INFANT = 'infant'
    TYPES = [(ADULT, 'Adult'), (CHILD, 'Child'), (INFANT, 'Infant')]

    TITLES = [
        ('Mr', 'Mr'), ('Ms', 'Ms'), ('Mrs', 'Mrs'),
        ('Master', 'Master'), ('Miss', 'Miss'),
    ]

    booking = models.ForeignKey(
        FlightBooking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='travellers',
    )
    traveller_type = models.CharField(
        max_length=10, choices=TYPES, default=ADULT,
    )
    title = models.CharField(
        max_length=10, choices=TITLES, null=True, blank=True,
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    # Required for children and infants.
    date_of_birth = models.DateField(null=True, blank=True)
    # NULL when no seat was chosen; infants never get one.
    seat = models.ForeignKey(
        FlightSeat, on_delete=models.DO_NOTHING,
        db_column='seat_id', null=True, blank=True,
        related_name='travellers',
    )
    seat_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    eticket_number = models.CharField(max_length=30, null=True, blank=True)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'flight_traveller'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.first_name} {self.last_name}'


class FlightBookingAddon(models.Model):
    """
    An add-on taken on a booking. The schema keys it on
    (booking_id, addon_id) with no id of its own.
    """

    pk = models.CompositePrimaryKey('booking_id', 'addon_id')
    booking = models.ForeignKey(
        FlightBooking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='addons',
    )
    addon = models.ForeignKey(
        FlightAddon, on_delete=models.DO_NOTHING,
        db_column='addon_id', related_name='bookings',
    )
    # Charged once per traveller, so this is the traveller count.
    quantity = models.SmallIntegerField(default=1)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        managed = False
        db_table = 'flight_booking_addon'

    def __str__(self):
        return f'{self.addon_id} x{self.quantity}'
