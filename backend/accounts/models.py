"""
Models for the accounts module.

`app_user` is the site's own account table, mapped here the same way every
travel module maps the tables it needs: `managed = False`, over a table
../schema.sql already made.

This app is deliberately the only one that *writes* to it. The five booking
modules each map `app_user` too, but only so their `booking.user_id` foreign
key resolves - they never create or authenticate one.
"""
from django.db import models


class AppUser(models.Model):
    """
    A registered traveller.

    Separate from `django.contrib.auth.User` on purpose: the schema models the
    site's own accounts, and every booking references this table. Django's own
    user model still exists behind `/admin/` and is a different thing.
    """

    full_name = models.CharField(max_length=150)
    email = models.EmailField(max_length=254, unique=True)
    phone = models.CharField(max_length=15, null=True, blank=True, unique=True)
    # Never the password itself - this holds what `make_password` produced.
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'app_user'
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} <{self.email}>'

    # DRF's permission classes ask these of whatever `request.user` is. An
    # AppUser only ever reaches a request by way of a valid token, so it is by
    # definition authenticated; `AnonymousUser` answers the opposite.
    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False


class SavedTraveller(models.Model):
    """
    Someone a signed-in user books for repeatedly.

    Not used by any endpoint yet - the booking forms still take details afresh
    each time - but the table exists and the relation belongs here rather than
    being discovered later.
    """

    user = models.ForeignKey(
        AppUser, on_delete=models.CASCADE,
        db_column='user_id', related_name='saved_travellers',
    )
    full_name = models.CharField(max_length=150)
    age = models.SmallIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=10, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'saved_traveller'
        ordering = ['full_name']

    def __str__(self):
        return self.full_name
