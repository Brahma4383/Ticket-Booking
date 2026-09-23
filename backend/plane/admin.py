"""
Admin registrations for the plane module.

Useful for seeding the schedule, fares and cabin, and for looking at a ticket
without a MySQL client. The inventory is editable; bookings are read-only,
because changing an assigned seat or a fare from here would leave the ticket
the traveller already holds saying something else.

Only this module's own tables are registered. The shared ones (`booking`,
`payment`, `city`) are mapped in models.py for the foreign keys, but the bus
module already exposes them in the admin and registering a second class over
the same table would list them twice.
"""
from django.contrib import admin

from plane.models import (
    Airline,
    Airport,
    FareBrand,
    Flight,
    FlightAddon,
    FlightBooking,
    FlightBookingAddon,
    FlightSeat,
    FlightStop,
    FlightTraveller,
)


@admin.register(Airline)
class AirlineAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('code', 'name')


@admin.register(Airport)
class AirportAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'city')
    search_fields = ('code', 'name')
    list_select_related = ('city',)


@admin.register(FlightAddon)
class FlightAddonAdmin(admin.ModelAdmin):
    list_display = ('code', 'label', 'price', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('code', 'label')


class FlightStopInline(admin.TabularInline):
    model = FlightStop
    extra = 0
    autocomplete_fields = ('airport',)


class FareBrandInline(admin.TabularInline):
    model = FareBrand
    extra = 0


@admin.register(Flight)
class FlightAdmin(admin.ModelAdmin):
    list_display = (
        'flight_number', 'airline', 'origin_airport', 'destination_airport',
        'departure_time', 'arrival_time', 'cabin_class', 'is_active',
    )
    list_filter = ('cabin_class', 'is_active', 'airline')
    search_fields = ('flight_number', 'airline__name', 'aircraft')
    list_select_related = (
        'airline', 'origin_airport', 'destination_airport',
    )
    autocomplete_fields = (
        'airline', 'origin_airport', 'destination_airport',
    )
    inlines = (FareBrandInline, FlightStopInline)


@admin.register(FlightSeat)
class FlightSeatAdmin(admin.ModelAdmin):
    list_display = (
        'seat_code', 'flight', 'row_no', 'seat_column', 'zone', 'price',
        'is_window', 'is_aisle', 'is_exit_row',
    )
    list_filter = ('zone', 'is_window', 'is_aisle', 'is_exit_row')
    search_fields = ('seat_code',)
    list_select_related = ('flight',)


class FlightTravellerInline(admin.TabularInline):
    model = FlightTraveller
    extra = 0
    can_delete = False
    readonly_fields = (
        'traveller_type', 'title', 'first_name', 'last_name',
        'date_of_birth', 'seat', 'seat_price', 'eticket_number', 'sort_order',
    )

    def has_add_permission(self, request, obj=None):
        return False


class FlightBookingAddonInline(admin.TabularInline):
    model = FlightBookingAddon
    extra = 0
    can_delete = False
    readonly_fields = ('addon', 'quantity', 'amount')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(FlightBooking)
class FlightBookingAdmin(admin.ModelAdmin):
    list_display = (
        'booking', 'flight', 'fare_brand', 'travel_date',
        'base_fare', 'taxes', 'seat_total',
    )
    list_filter = ('travel_date', 'fare_brand__code')
    search_fields = ('booking__reference',)
    list_select_related = ('booking', 'flight', 'fare_brand')
    inlines = (FlightTravellerInline, FlightBookingAddonInline)
    date_hierarchy = 'travel_date'

    def has_add_permission(self, request):
        # Tickets are issued by POST /api/plane/bookings/, which is what takes
        # the seats and records the payment.
        return False

    def has_change_permission(self, request, obj=None):
        return False
