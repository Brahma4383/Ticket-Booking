"""
Demo data for the cab module.

    manage.py seed_cab

Safe to run twice: rate cards are keyed on (category, trip type, validity) and
re-running updates rather than duplicating.

`schema.sql` already seeds the four categories and the three extras. What it
does not seed is `cab_rate_card`, and **a category with no card in force is
not offered at all** — which is why searching cabs returns nothing until this
has run. The card is where the per-km rate, the minimum, the driver allowance
and the night charge live.

Nothing here is per date or per city: a cab is priced by category and by what
kind of journey it is, and the journey is worked out from the addresses.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from cab.models import CabCategory, CabExtra, CabRateCard

# category code -> per-km rate for an outstation run. The other two journey
# types are priced off this.
PER_KM = {
    'hatchback': Decimal('12.00'),
    'sedan': Decimal('14.00'),
    'suv': Decimal('18.00'),
    'premium': Decimal('23.00'),
}

# trip type -> (rate multiplier, minimum km, cancellation terms).
#
# An airport transfer is dearer a kilometre but has a low minimum: it is a
# short run and the driver deadheads back. An outstation run is the opposite -
# cheaper a kilometre, but you pay for 100 whether you use them or not.
TRIP_TYPES = {
    'outstation': (
        Decimal('1.00'), 100,
        'Free cancellation up to 2 hours before pickup',
    ),
    'airport': (
        Decimal('1.45'), 20,
        'Free cancellation up to 1 hour before pickup',
    ),
    'local': (
        Decimal('1.25'), 15,
        'Free cancellation up to 30 minutes before pickup',
    ),
}

# Only an outstation run can keep the driver overnight, so only that card
# carries an allowance. The night charge applies to any 22:00-06:00 pickup.
DRIVER_ALLOWANCE = {'outstation': Decimal('300.00')}
NIGHT_CHARGE = {
    'outstation': Decimal('250.00'),
    'airport': Decimal('150.00'),
    'local': Decimal('150.00'),
}

# Ratings are not in the seed schema, so they are set here - the results card
# shows one per category.
RATINGS = {
    'hatchback': Decimal('4.1'),
    'sedan': Decimal('4.4'),
    'suv': Decimal('4.5'),
    'premium': Decimal('4.7'),
}


class Command(BaseCommand):
    help = 'Load demo rate cards for every cab category and journey type.'

    @transaction.atomic
    def handle(self, *args, **options):
        categories = list(CabCategory.objects.all())
        if not categories:
            self.stderr.write(
                'No cab_category rows - apply schema.sql first, it seeds them.'
            )
            return

        extras = CabExtra.objects.count()
        cards = 0

        for category in categories:
            if category.rating is None:
                category.rating = RATINGS.get(category.code, Decimal('4.2'))
                category.save(update_fields=['rating'])

            per_km = PER_KM.get(category.code)
            if per_km is None:
                self.stderr.write(f'no per-km rate for {category.code}, skipped')
                continue

            for trip_type, (multiplier, minimum_km, note) in TRIP_TYPES.items():
                rate = (per_km * multiplier).quantize(Decimal('0.01'))
                CabRateCard.objects.update_or_create(
                    category=category, trip_type=trip_type, valid_from=None,
                    defaults={
                        'per_km_rate': rate,
                        'minimum_km': minimum_km,
                        # A kilometre past the included distance costs a little
                        # more than one inside it.
                        'extra_km_rate': (rate * Decimal('1.1')).quantize(
                            Decimal('0.01')
                        ),
                        'driver_allowance': DRIVER_ALLOWANCE.get(
                            trip_type, Decimal('0.00')
                        ),
                        'night_charge': NIGHT_CHARGE[trip_type],
                        'cancellation_note': note,
                        'valid_to': None,
                    },
                )
                cards += 1

        self.stdout.write(self.style.SUCCESS(
            f'cab: {len(categories)} categories, {cards} rate cards, '
            f'{extras} extras'
        ))
