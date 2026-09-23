"""
Admin registrations for the bus module.

Useful for seeding and for looking at a booking without a MySQL client. The
inventory tables are editable; bookings are read-only, because changing a sold
seat or a fare from here would leave the ticket the traveller already holds
saying something else.
"""
from django.contrib import admin

from bus.models import (
    Booking,
    BusAmenity,
    BusBooking,
    BusBookingSeat,
    BusOperator,
    BusSeat,
    BusStopPoint,
    BusTrip,
    BusTripAmenity,
    City,
)


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ('name', 'state', 'is_active')
    list_filter = ('is_active', 'state')
    search_fields = ('name',)


@admin.register(BusOperator)
class BusOperatorAdmin(admin.ModelAdmin):
    list_display = ('name', 'rating', 'rating_count', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(BusAmenity)
class BusAmenityAdmin(admin.ModelAdmin):
    search_fields = ('name',)


class BusStopPointInline(admin.TabularInline):
    model = BusStopPoint
    extra = 0


class BusTripAmenityInline(admin.TabularInline):
    """
    Amenities are edited through the join model rather than with
    `filter_horizontal`, which the admin will not offer for a many-to-many
    that names its own through model.
    """

    model = BusTripAmenity
    extra = 0
    autocomplete_fields = ('amenity',)


@admin.register(BusTrip)
class BusTripAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'operator', 'origin_city', 'destination_city',
        'departure_time', 'arrival_time', 'seat_kind', 'base_fare', 'is_active',
    )
    list_filter = ('seat_kind', 'is_air_conditioned', 'is_active')
    search_fields = ('coach_name', 'operator__name')
    list_select_related = ('operator', 'origin_city', 'destination_city')
    autocomplete_fields = ('operator', 'origin_city', 'destination_city')
    inlines = (BusTripAmenityInline, BusStopPointInline)


@admin.register(BusSeat)
class BusSeatAdmin(admin.ModelAdmin):
    list_display = ('seat_code', 'trip', 'deck', 'row_no', 'column_no',
                    'seat_kind', 'status', 'price')
    list_filter = ('deck', 'seat_kind', 'status')
    search_fields = ('seat_code',)
    list_select_related = ('trip',)


class BusBookingSeatInline(admin.TabularInline):
    model = BusBookingSeat
    extra = 0
    can_delete = False
    readonly_fields = (
        'seat', 'travel_date', 'passenger_name',
        'passenger_age', 'passenger_gender', 'fare',
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(BusBooking)
class BusBookingAdmin(admin.ModelAdmin):
    list_display = ('booking', 'trip', 'travel_date', 'seat_total', 'gst')
    list_filter = ('travel_date',)
    search_fields = ('booking__reference',)
    list_select_related = ('booking', 'trip')
    inlines = (BusBookingSeatInline,)

    def has_add_permission(self, request):
        # Bookings are created by POST /api/bus/bookings/, which is what
        # reserves the seats and records the payment.
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('reference', 'mode', 'status', 'contact_email',
                    'total_amount', 'booked_at')
    list_filter = ('mode', 'status')
    search_fields = ('reference', 'contact_email', 'contact_phone')
    date_hierarchy = 'booked_at'

    def has_add_permission(self, request):
        return False
