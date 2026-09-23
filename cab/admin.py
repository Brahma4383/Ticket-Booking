"""
Admin registrations for the cab module.

Useful for seeding categories and rate cards, and for looking at a trip
without a MySQL client. Pricing is editable; bookings are read-only, except
for the driver and vehicle, which are assigned two hours before pickup and are
the one thing an operator legitimately fills in by hand.

Only this module's own tables are registered. The shared ones (`booking`,
`payment`, `city`) are mapped in models.py for the foreign keys, but the bus
module already exposes them in the admin and registering a second class over
the same table would list them twice.
"""
from django.contrib import admin

from cab.models import (
    CabBooking,
    CabBookingExtra,
    CabCategory,
    CabExtra,
    CabRateCard,
)


class CabRateCardInline(admin.TabularInline):
    model = CabRateCard
    extra = 0


@admin.register(CabCategory)
class CabCategoryAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'name', 'vehicle_models', 'seats', 'luggage',
        'is_air_conditioned', 'rating', 'is_active',
    )
    list_filter = ('is_active', 'is_air_conditioned')
    search_fields = ('code', 'name', 'vehicle_models')
    inlines = (CabRateCardInline,)


@admin.register(CabRateCard)
class CabRateCardAdmin(admin.ModelAdmin):
    list_display = (
        'category', 'trip_type', 'per_km_rate', 'minimum_km', 'extra_km_rate',
        'driver_allowance', 'night_charge', 'valid_from', 'valid_to',
    )
    list_filter = ('trip_type', 'category')
    list_select_related = ('category',)
    autocomplete_fields = ('category',)


@admin.register(CabExtra)
class CabExtraAdmin(admin.ModelAdmin):
    list_display = ('code', 'label', 'price', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('code', 'label')


class CabBookingExtraInline(admin.TabularInline):
    model = CabBookingExtra
    extra = 0
    can_delete = False
    readonly_fields = ('extra', 'amount')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(CabBooking)
class CabBookingAdmin(admin.ModelAdmin):
    list_display = (
        'booking', 'category', 'trip_type', 'pickup_at', 'distance_km',
        'pay_now', 'pay_to_driver', 'driver_name', 'vehicle_number',
    )
    list_filter = ('trip_type', 'is_night_trip', 'category')
    search_fields = (
        'booking__reference', 'passenger_name', 'passenger_phone',
        'vehicle_number',
    )
    list_select_related = ('booking', 'category')
    inlines = (CabBookingExtraInline,)
    date_hierarchy = 'pickup_at'

    # Everything the booking endpoint wrote. The driver and vehicle are left
    # editable: dispatch assigns them after the trip is taken, and this is
    # where that happens until there is a dispatch system.
    readonly_fields = (
        'booking', 'category', 'rate_card', 'trip_type',
        'pickup_address', 'drop_address', 'pickup_at',
        'distance_km', 'duration_minutes', 'is_night_trip',
        'passenger_name', 'passenger_phone',
        'base_fare', 'extras_total', 'driver_allowance', 'tolls_state_tax',
        'night_charge', 'gst', 'pay_now', 'pay_to_driver',
    )

    def has_add_permission(self, request):
        # Trips are taken by POST /api/cab/bookings/, which is what prices the
        # journey and records the advance.
        return False
