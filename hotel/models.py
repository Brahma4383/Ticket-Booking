"""
Models for the hotel module.

Every model here is `managed = False` and points at a table that already
exists in MySQL. ../schema.sql is the source of truth: it is applied with the
mysql client, and Django maps onto the result rather than generating it. A
schema change goes into schema.sql, is applied to MySQL, and is then mirrored
here - not the other way round.

This app owns its own models outright, including its own mapping of the tables
every travel mode shares (`city`, `app_user`, `offer`, `booking`,
`booking_fare_line`, `payment`). The bus, train and plane apps map the same six
tables under their own model classes. That is deliberate: no module imports
another, so any one of them can be changed, moved or dropped on its own.

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
        verbose_name = 'city (hotel)'
        verbose_name_plural = 'cities (hotel)'

    def __str__(self):
        return self.name


class AppUser(models.Model):
    """
    A registered traveller.

    Separate from django.contrib.auth.User on purpose: the schema models the
    site's own accounts. Booking a stay never requires it - a guest checkout
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
        verbose_name = 'app user (hotel)'

    def __str__(self):
        return self.full_name


class Offer(models.Model):
    """
    A discount code. Referenced by `booking.offer_id`; the hotel endpoints do
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
        verbose_name = 'offer (hotel)'

    def __str__(self):
        return self.code


class Booking(models.Model):
    """The supertype row every travel mode shares."""

    HOTEL = 'hotel'
    MODES = [
        ('bus', 'Bus'), ('train', 'Train'), ('plane', 'Plane'),
        (HOTEL, 'Hotel'), ('cab', 'Cab'),
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

    # An eight-character property booking id, e.g. 'HTN75YLS'.
    reference = models.CharField(max_length=20, unique=True)
    mode = models.CharField(max_length=10, choices=MODES)
    # NULL for a guest checkout.
    user = models.ForeignKey(
        AppUser, on_delete=models.DO_NOTHING, db_column='user_id',
        null=True, blank=True, related_name='stay_bookings',
    )
    status = models.CharField(max_length=15, choices=STATUSES, default=PENDING)
    contact_email = models.EmailField(max_length=254)
    contact_phone = models.CharField(max_length=15)
    offer = models.ForeignKey(
        Offer, on_delete=models.DO_NOTHING, db_column='offer_id',
        null=True, blank=True, related_name='stay_bookings',
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
        verbose_name = 'booking (hotel)'

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
        verbose_name = 'booking fare line (hotel)'

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
        verbose_name = 'payment (hotel)'

    def __str__(self):
        return f'{self.method} {self.amount}'


# ---------------------------------------------------------------------------
# Stays - mirrors frontend/src/types/hotel.types.ts
# ---------------------------------------------------------------------------

class HotelAmenity(models.Model):
    """Shared by properties and room types; the same table serves both."""

    name = models.CharField(max_length=100, unique=True)

    class Meta:
        managed = False
        db_table = 'hotel_amenity'
        ordering = ['name']
        verbose_name_plural = 'hotel amenities'

    def __str__(self):
        return self.name


class Property(models.Model):
    """A place to stay: hotel, resort, homestay, hostel or apartment."""

    TYPES = [
        ('Hotel', 'Hotel'), ('Resort', 'Resort'), ('Homestay', 'Homestay'),
        ('Hostel', 'Hostel'), ('Apartment', 'Apartment'),
    ]

    name = models.CharField(max_length=200)
    property_type = models.CharField(max_length=20, choices=TYPES)
    # 0 for hostels and homestays, which are not star rated.
    star_rating = models.SmallIntegerField(default=0)
    locality = models.CharField(max_length=150, null=True, blank=True)
    city = models.ForeignKey(
        City, on_delete=models.DO_NOTHING,
        db_column='city_id', related_name='properties',
    )
    address = models.CharField(max_length=500, null=True, blank=True)
    distance_km = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
    )
    # Out of 10, the usual convention for stays.
    review_score = models.DecimalField(
        max_digits=3, decimal_places=1, null=True, blank=True,
    )
    review_count = models.PositiveIntegerField(default=0)
    checkin_time = models.CharField(max_length=5, default='14:00')
    checkout_time = models.CharField(max_length=5, default='11:00')
    is_active = models.BooleanField(default=True)

    amenities = models.ManyToManyField(
        HotelAmenity, through='PropertyAmenity', related_name='properties',
    )

    class Meta:
        managed = False
        db_table = 'property'
        ordering = ['name']
        verbose_name_plural = 'properties'
        constraints = [
            models.UniqueConstraint(
                fields=['name', 'city'], name='uq_property_name_city',
            ),
        ]

    def __str__(self):
        return self.name


class PropertyAmenity(models.Model):
    """Join table. The schema keys it on (property_id, amenity_id)."""

    pk = models.CompositePrimaryKey('property_id', 'amenity_id')
    property = models.ForeignKey(
        Property, on_delete=models.CASCADE,
        db_column='property_id', related_name='property_amenities',
    )
    amenity = models.ForeignKey(
        HotelAmenity, on_delete=models.CASCADE,
        db_column='amenity_id', related_name='property_links',
    )

    class Meta:
        managed = False
        db_table = 'property_amenity'
        verbose_name_plural = 'property amenities'


class RoomType(models.Model):
    """
    A category of room at a property. `rooms_total` is how many exist; how
    many are free on a given night comes from RoomInventory.
    """

    BEDS = [
        ('Single', 'Single'), ('Twin', 'Twin'), ('Double', 'Double'),
        ('Queen', 'Queen'), ('King', 'King'),
    ]

    property = models.ForeignKey(
        Property, on_delete=models.CASCADE,
        db_column='property_id', related_name='room_types',
    )
    name = models.CharField(max_length=150)
    size_sqft = models.SmallIntegerField(null=True, blank=True)
    bed_type = models.CharField(
        max_length=10, choices=BEDS, null=True, blank=True,
    )
    max_guests = models.SmallIntegerField(default=2)
    rooms_total = models.SmallIntegerField(default=0)

    amenities = models.ManyToManyField(
        HotelAmenity, through='RoomTypeAmenity', related_name='room_types',
    )

    class Meta:
        managed = False
        db_table = 'room_type'
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['property', 'name'], name='uq_room_type',
            ),
        ]

    def __str__(self):
        return self.name


class RoomTypeAmenity(models.Model):
    """Join table. The schema keys it on (room_type_id, amenity_id)."""

    pk = models.CompositePrimaryKey('room_type_id', 'amenity_id')
    room_type = models.ForeignKey(
        RoomType, on_delete=models.CASCADE,
        db_column='room_type_id', related_name='room_amenities',
    )
    amenity = models.ForeignKey(
        HotelAmenity, on_delete=models.CASCADE,
        db_column='amenity_id', related_name='room_links',
    )

    class Meta:
        managed = False
        db_table = 'room_type_amenity'
        verbose_name_plural = 'room type amenities'


class RatePlan(models.Model):
    """
    The same room sold under different terms. Not every property offers a
    flexible plan, which is what makes the free-cancellation filter mean
    something.
    """

    ROOM_ONLY = 'room-only'
    BREAKFAST = 'breakfast'
    FLEXIBLE = 'flexible'
    CODES = [
        (ROOM_ONLY, 'Room only'), (BREAKFAST, 'With breakfast'),
        (FLEXIBLE, 'Breakfast + free cancellation'),
    ]

    room_type = models.ForeignKey(
        RoomType, on_delete=models.CASCADE,
        db_column='room_type_id', related_name='rate_plans',
    )
    code = models.CharField(max_length=20, choices=CODES)
    name = models.CharField(max_length=150)
    price_per_night = models.DecimalField(max_digits=10, decimal_places=2)
    breakfast_included = models.BooleanField(default=False)
    free_cancellation = models.BooleanField(default=False)
    cancellation_note = models.CharField(
        max_length=200, null=True, blank=True,
    )
    # Settle at the property instead of now.
    pay_at_hotel = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'rate_plan'
        ordering = ['price_per_night']
        constraints = [
            models.UniqueConstraint(
                fields=['room_type', 'code'], name='uq_rate_plan',
            ),
        ]

    def __str__(self):
        return f'{self.name} {self.price_per_night}'


class RoomInventory(models.Model):
    """
    Rooms free on one night.

    A stay spanning several nights needs a row for each of them; the number
    bookable is the smallest count across the run, and a missing row means
    nothing is loaded for that night rather than that everything is free.
    """

    room_type = models.ForeignKey(
        RoomType, on_delete=models.CASCADE,
        db_column='room_type_id', related_name='inventory',
    )
    stay_date = models.DateField()
    rooms_available = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'room_inventory'
        ordering = ['stay_date']
        verbose_name_plural = 'room inventory'
        constraints = [
            models.UniqueConstraint(
                fields=['room_type', 'stay_date'], name='uq_room_inventory',
            ),
        ]

    def __str__(self):
        return f'{self.room_type_id} on {self.stay_date}: {self.rooms_available}'


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class HotelBooking(models.Model):
    """The stay half of a booking. Shares its primary key with `booking`."""

    booking = models.OneToOneField(
        Booking, on_delete=models.CASCADE, primary_key=True,
        db_column='booking_id', related_name='hotel_booking',
    )
    property = models.ForeignKey(
        Property, on_delete=models.DO_NOTHING,
        db_column='property_id', related_name='bookings',
    )
    room_type = models.ForeignKey(
        RoomType, on_delete=models.DO_NOTHING,
        db_column='room_type_id', related_name='bookings',
    )
    rate_plan = models.ForeignKey(
        RatePlan, on_delete=models.DO_NOTHING,
        db_column='rate_plan_id', related_name='bookings',
    )
    check_in = models.DateField()
    check_out = models.DateField()
    nights = models.SmallIntegerField()
    rooms = models.SmallIntegerField(default=1)
    guests = models.SmallIntegerField(default=1)
    room_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # 12 below Rs 7,500 a night, 18 at or above - the Indian slab.
    tax_rate_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=12,
    )
    taxes = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    property_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )
    arrival_window = models.CharField(max_length=40, null=True, blank=True)
    special_requests = models.CharField(
        max_length=400, null=True, blank=True,
    )

    class Meta:
        managed = False
        db_table = 'hotel_booking'

    def __str__(self):
        return f'stay booking {self.pk}'


class HotelGuest(models.Model):
    """
    A guest on a booking. The booking is held under the lead guest's name,
    which is the one the guest-details form collects.
    """

    # `party`, not `guests`: HotelBooking.guests is the head count, and a
    # reverse accessor of the same name would shadow it.
    booking = models.ForeignKey(
        HotelBooking, on_delete=models.CASCADE,
        db_column='booking_id', related_name='party',
    )
    full_name = models.CharField(max_length=150)
    is_lead = models.BooleanField(default=False)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'hotel_guest'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.full_name
