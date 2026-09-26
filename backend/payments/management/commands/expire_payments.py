"""
Release every booking whose payment hold has run out.

    manage.py expire_payments

The API already does this lazily - for one account whenever its bookings or
transactions are listed, and for one booking whenever someone tries to pay
for it - so a traveller never sees a stale hold. What that leaves behind is
inventory held by accounts that simply walked away. Run this on a schedule
(every few minutes is plenty) to give it back.
"""
from django.core.management.base import BaseCommand

from payments.services import expire_stale, hold_minutes


class Command(BaseCommand):
    help = 'Close pending bookings whose payment hold has run out.'

    def handle(self, *args, **options):
        expired = expire_stale()
        self.stdout.write(
            f'Released {expired} booking(s) unpaid for more than '
            f'{hold_minutes()} minutes.'
        )
