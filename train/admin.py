"""
Admin registrations for the train module.

Useful for seeding fares and availability, and for looking at a ticket without
a MySQL client. The timetable and availability are editable; bookings are
read-only, because changing an allotted berth or a fare from here would leave
the ticket the traveller already holds saying something else.

Only this module's own tables are registered. The shared ones (`booking`,
`payment`, `city`) are mapped in models.py for the foreign keys, but the bus
module already exposes them in the admin and registering a second class over
the same table would list them twice.
"""
from django.contrib import admin

from train.models import (
    Train,
    TrainAvailability,
    TrainBoardingStation,
    TrainBooking,
    TrainClass,
    TrainPassenger,
    TrainQuota,
    TrainStation,
)


@admin.register(TrainStation)
class TrainStationAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'city')
    search_fields = ('code', 'name')
    list_select_related = ('city',)


@admin.register(TrainClass)
class TrainClassAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'label', 'is_air_conditioned', 'reservation_charge',
        'sort_order',
    )
    list_filter = ('is_air_conditioned',)
    search_fields = ('code', 'label')


@admin.register(TrainQuota)
class TrainQuotaAdmin(admin.ModelAdmin):
    list_display = ('code', 'label', 'surcharge_percent')
    search_fields = ('code', 'label')


class TrainBoardingStationInline(admin.TabularInline):
    model = TrainBoardingStation
    extra = 0
    autocomplete_fields = ('station',)


@admin.register(Train)
class TrainAdmin(admin.ModelAdmin):
    list_display = (
        'number', 'name', 'origin_station', 'destination_station',
        'departure_time', 'arrival_time', 'has_pantry', 'is_active',
    )
    list_filter = ('has_pantry', 'is_active')
    search_fields = ('number', 'name')
    list_select_related = ('origin_station', 'destination_station')
    autocomplete_fields = ('origin_station', 'destination_station')
    inlines = (TrainBoardingStationInline,)
    fieldsets = (
        (None, {'fields': ('number', 'name', 'is_active')}),
        ('Route', {
            'fields': (
                'origin_station', 'destination_station',
                'departure_time', 'arrival_time',
                'duration_minutes', 'days_to_arrive',
            ),
        }),
        ('Running days', {
            'fields': (
                'runs_mon', 'runs_tue', 'runs_wed', 'runs_thu',
                'runs_fri', 'runs_sat', 'runs_sun',
            ),
        }),
        ('On board', {
            'fields': ('has_pantry', 'rating', 'cancellation_policy'),
        }),
    )


@admin.register(TrainAvailability)
class TrainAvailabilityAdmin(admin.ModelAdmin):
    list_display = (
        'train', 'train_class', 'quota', 'travel_date', 'fare',
        'availability_kind', 'availability_label', 'confirm_chance',
    )
    list_filter = ('availability_kind', 'travel_date', 'quota', 'train_class')
    search_fields = ('train__number', 'train__name')
    list_select_related = ('train', 'train_class', 'quota')
    autocomplete_fields = ('train', 'train_class', 'quota')
    date_hierarchy = 'travel_date'


class TrainPassengerInline(admin.TabularInline):
    model = TrainPassenger
    extra = 0
    can_delete = False
    readonly_fields = (
        'full_name', 'age', 'gender', 'berth_preference',
        'allotted_coach', 'allotted_berth', 'booking_status', 'sort_order',
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(TrainBooking)
class TrainBookingAdmin(admin.ModelAdmin):
    list_display = (
        'booking', 'train', 'train_class', 'quota', 'travel_date',
        'base_fare', 'is_insured',
    )
    list_filter = ('travel_date', 'quota', 'train_class', 'is_insured')
    search_fields = ('booking__reference',)
    list_select_related = ('booking', 'train', 'train_class', 'quota')
    inlines = (TrainPassengerInline,)
    date_hierarchy = 'travel_date'

    def has_add_permission(self, request):
        # Tickets are issued by POST /api/train/bookings/, which is what takes
        # the availability, prepares the chart and records the payment.
        return False

    def has_change_permission(self, request, obj=None):
        return False
