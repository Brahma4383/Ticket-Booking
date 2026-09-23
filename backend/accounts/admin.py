"""
Admin registrations for the accounts module.

Accounts are visible and can be deactivated, but the password hash is never
editable here: a value typed into that box would be stored verbatim and would
lock the account out, because `check_password` expects a hash.
"""
from django.contrib import admin

from accounts.models import AppUser, SavedTraveller


class SavedTravellerInline(admin.TabularInline):
    model = SavedTraveller
    extra = 0


@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = (
        'full_name', 'email', 'phone', 'is_active',
        'email_verified', 'phone_verified', 'created_at', 'last_login_at',
    )
    list_filter = ('is_active', 'email_verified', 'phone_verified')
    search_fields = ('full_name', 'email', 'phone')
    date_hierarchy = 'created_at'
    inlines = (SavedTravellerInline,)
    readonly_fields = ('password_hash', 'created_at', 'last_login_at')
    fields = (
        'full_name', 'email', 'phone', 'is_active',
        'email_verified', 'phone_verified',
        'password_hash', 'created_at', 'last_login_at',
    )

    def has_add_permission(self, request):
        # Accounts are made by POST /api/auth/register/, which is what hashes
        # the password. One added here would have no usable one.
        return False
