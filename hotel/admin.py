"""
Admin registrations for the hotel module.

Useful for seeding properties, rates and nightly inventory, and for looking at
a booking without a MySQL client. The inventory is editable; bookings are
read-only, because changing a held room or a rate from here would leave the
voucher the guest already holds saying something else.

Only this module's own tables are registered. The shared ones (`booking`,
`payment`, `city`) are mapped in models.py for the foreign keys, but the bus
module already exposes them in the admin and registering a second class over
the same table would list them twice.
"""
from django.contrib import admin

from hotel.models import (
    HotelAmenity,
    HotelBooking,
    HotelGuest,
    Property,
    PropertyAmenity,
    RatePlan,
    RoomInventory,
    RoomType,
)


@admin.register(HotelAmenity)
class HotelAmenityAdmin(admin.ModelAdmin):
    search_fields = ('name',)
    list_display = ('name',)


class PropertyAmenityInline(admin.TabularInline):
    """
    Amenities are edited through the join model rather than with
    `filter_horizontal`, which the admin will not offer for a many-to-many
    that names its own through model.
    """

    model = PropertyAmenity
    extra = 0
    autocomplete_fields = ('amenity',)


class RoomTypeInline(admin.TabularInline):
    model = RoomType
    extra = 0
    show_change_link = True


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'property_type', 'star_rating', 'city', 'locality',
        'review_score', 'review_count', 'is_active',
    )
    list_filter = ('property_type', 'star_rating', 'is_active')
    search_fields = ('name', 'locality', 'address')
    list_select_related = ('city',)
    inlines = (PropertyAmenityInline, RoomTypeInline)


class RatePlanInline(admin.TabularInline):
    model = RatePlan
    extra = 0


@admin.register(RoomType)
class RoomTypeAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'property', 'bed_type', 'size_sqft', 'max_guests',
        'rooms_total',
    )
    list_filter = ('bed_type',)
    search_fields = ('name', 'property__name')
    list_select_related = ('property',)
    inlines = (RatePlanInline,)


@admin.register(RoomInventory)
class RoomInventoryAdmin(admin.ModelAdmin):
    list_display = ('room_type', 'stay_date', 'rooms_available')
    list_filter = ('stay_date',)
    search_fields = ('room_type__name', 'room_type__property__name')
    list_select_related = ('room_type',)
    date_hierarchy = 'stay_date'


class HotelGuestInline(admin.TabularInline):
    model = HotelGuest
    extra = 0
    can_delete = False
    readonly_fields = ('full_name', 'is_lead', 'sort_order')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(HotelBooking)
class HotelBookingAdmin(admin.ModelAdmin):
    list_display = (
        'booking', 'property', 'room_type', 'check_in', 'check_out',
        'nights', 'rooms', 'guests', 'room_total',
    )
    list_filter = ('check_in', 'rate_plan__code')
    search_fields = ('booking__reference', 'property__name')
    list_select_related = ('booking', 'property', 'room_type', 'rate_plan')
    inlines = (HotelGuestInline,)
    date_hierarchy = 'check_in'

    def has_add_permission(self, request):
        # Bookings are made by POST /api/hotel/bookings/, which is what holds
        # the rooms and records the payment.
        return False

    def has_change_permission(self, request, obj=None):
        return False
