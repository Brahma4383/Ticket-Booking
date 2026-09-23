"""
Demo data for the hotel module.

    manage.py seed_hotel [--days 60]

Safe to run twice: properties, rooms and rate plans are keyed on natural
uniques, and nightly inventory is written with INSERT IGNORE, so re-running
never duplicates and never overwrites rooms already sold.

The part worth understanding is `room_inventory`. It holds one row per room
type per night, and a night with no row counts as nothing available — not as
unlimited. `--days` is how far ahead rows are loaded; past that, search goes
quiet until it is run again.
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from hotel.models import (
    City,
    HotelAmenity,
    Property,
    PropertyAmenity,
    RatePlan,
    RoomInventory,
    RoomType,
    RoomTypeAmenity,
)

# Mirrors CITIES in frontend/src/constants/index.ts, so every suggestion the
# search box offers has somewhere to stay.
CITIES = [
    ('Mumbai', 'Maharashtra'), ('Navi Mumbai', 'Maharashtra'),
    ('Pune', 'Maharashtra'), ('Nashik', 'Maharashtra'),
    ('Nagpur', 'Maharashtra'), ('Delhi', 'Delhi'),
    ('Gurugram', 'Haryana'), ('Jaipur', 'Rajasthan'),
    ('Ahmedabad', 'Gujarat'), ('Surat', 'Gujarat'),
    ('Indore', 'Madhya Pradesh'), ('Bengaluru', 'Karnataka'),
    ('Hyderabad', 'Telangana'), ('Chennai', 'Tamil Nadu'),
    ('Kochi', 'Kerala'), ('Goa', 'Goa'),
    ('Kolkata', 'West Bengal'), ('Lucknow', 'Uttar Pradesh'),
    ('Chandigarh', 'Chandigarh'), ('Dehradun', 'Uttarakhand'),
]

BRANDS = [
    'The Grand', 'Hotel Sunrise', 'Taj Residency', 'Blue Orchid',
    'Silver Sands', 'The Meridian', 'Ginger', 'Treebo Trend',
    'FabHotel', 'Zostel', 'Casa Serena', 'Lake View',
]

LOCALITIES = [
    'Airport Road', 'City Centre', 'Old Town', 'Beach Road',
    'Business District', 'Railway Colony', 'Hill View', 'Lakeside',
]

PROPERTY_TYPES = ['Hotel', 'Resort', 'Homestay', 'Hostel', 'Apartment']

BEDS = ['Single', 'Twin', 'Double', 'Queen', 'King']

# name, size, fare multiplier, guests it holds.
ROOM_TEMPLATES = [
    ('Standard Room', 180, 1.0, 2),
    ('Deluxe Room', 240, 1.35, 3),
    ('Executive Suite', 380, 2.1, 4),
]

# The amenities a property advertises, as opposed to the in-room ones.
PROPERTY_AMENITIES = [
    'Free Wi-Fi', 'Swimming pool', 'Fitness centre', 'Free parking',
    'Restaurant', 'Room service', 'Airport shuttle', 'Power backup',
]
ROOM_AMENITIES = [
    'Air conditioning', 'Flat-screen TV', 'Tea & coffee maker',
    'Work desk', 'Safe', 'Balcony',
]


def rate_plans(base, flexible):
    """
    Plans priced off the room rate. Not every property sells a flexible plan,
    which is what makes the free-cancellation filter mean something.
    """
    plans = [
        ('room-only', 'Room only', base, False, False, 'Non-refundable', False),
        ('breakfast', 'With breakfast', round(base * 1.16 / 10) * 10,
         True, False, 'Cancellation fee applies', False),
    ]
    if flexible:
        plans.append((
            'flexible', 'Breakfast + free cancellation',
            round(base * 1.32 / 10) * 10, True, True,
            'Free cancellation up to 24 hours before check-in', True,
        ))
    return plans


class Command(BaseCommand):
    help = 'Load demo properties, rooms, rate plans and nightly inventory.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days', type=int, default=60,
            help='How many nights of inventory to load, from today.',
        )
        parser.add_argument(
            '--per-city', type=int, default=6,
            help='Properties to create in each city.',
        )
        parser.add_argument('--seed', type=int, default=20240518)

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options['seed'])

        amenities = {a.name: a for a in HotelAmenity.objects.all()}
        if not amenities:
            self.stderr.write(
                'No hotel_amenity rows - apply schema.sql first, it seeds them.'
            )
            return

        properties = 0
        rooms = 0
        for city_index, (city_name, state) in enumerate(CITIES):
            city, _ = City.objects.get_or_create(
                name=city_name, defaults={'state': state, 'is_active': True},
            )

            for index in range(options['per_city']):
                brand = BRANDS[(city_index + index) % len(BRANDS)]
                kind = PROPERTY_TYPES[(city_index + index * 3) % len(PROPERTY_TYPES)]
                # Hostels and homestays are not star rated.
                stars = 0 if kind in ('Hostel', 'Homestay') else rng.randint(2, 5)

                stay, created = Property.objects.get_or_create(
                    name=f'{brand} {city_name}', city=city,
                    defaults={
                        'property_type': kind,
                        'star_rating': stars,
                        'locality': rng.choice(LOCALITIES),
                        'address': f'{rng.randint(1, 240)} {rng.choice(LOCALITIES)}, {city_name}',
                        'distance_km': Decimal(str(round(rng.random() * 12, 1))),
                        'review_score': Decimal(str(round(6.4 + rng.random() * 3.5, 1))),
                        'review_count': rng.randint(40, 3200),
                        'checkin_time': rng.choice(['12:00', '13:00', '14:00']),
                        'checkout_time': rng.choice(['10:00', '11:00', '12:00']),
                        'is_active': True,
                    },
                )
                properties += 1
                if not created:
                    continue

                PropertyAmenity.objects.bulk_create([
                    PropertyAmenity(property=stay, amenity=amenities[name])
                    for name in rng.sample(PROPERTY_AMENITIES, rng.randint(4, 7))
                    if name in amenities
                ], ignore_conflicts=True)

                nightly_base = (
                    rng.randrange(5, 16) * 50 if kind == 'Hostel'
                    else rng.randrange(18, 150) * 50 + stars * 400
                )
                # Roughly two in three properties offer a refundable plan.
                flexible = rng.random() > 0.35

                for template_index, (name, size, multiplier, guests) in enumerate(
                    ROOM_TEMPLATES
                ):
                    if template_index and rng.random() < 0.28:
                        continue

                    room = RoomType.objects.create(
                        property=stay,
                        name=('Shared Dorm Bed'
                              if kind == 'Hostel' and template_index == 0 else name),
                        size_sqft=size + rng.randint(-20, 60),
                        bed_type=rng.choice(BEDS),
                        max_guests=guests,
                        rooms_total=rng.randint(4, 20),
                    )
                    rooms += 1

                    RoomTypeAmenity.objects.bulk_create([
                        RoomTypeAmenity(room_type=room, amenity=amenities[amenity])
                        for amenity in rng.sample(ROOM_AMENITIES, rng.randint(2, 4))
                        if amenity in amenities
                    ], ignore_conflicts=True)

                    base = round(nightly_base * multiplier / 10) * 10
                    RatePlan.objects.bulk_create([
                        RatePlan(
                            room_type=room, code=code, name=plan_name,
                            price_per_night=Decimal(price),
                            breakfast_included=breakfast,
                            free_cancellation=free_cancel,
                            cancellation_note=note,
                            pay_at_hotel=pay_later,
                        )
                        for code, plan_name, price, breakfast, free_cancel, note, pay_later
                        in rate_plans(base, flexible)
                    ], ignore_conflicts=True)

        nights = self._seed_inventory(options['days'], rng)

        self.stdout.write(self.style.SUCCESS(
            f'hotel: {properties} properties, {rooms} room types, '
            f'{RatePlan.objects.count()} rate plans, {nights} inventory rows '
            f'over {options["days"]} nights'
        ))

    def _seed_inventory(self, days, rng):
        """
        One row per room type per night. Written with INSERT IGNORE so a
        reseed never resets a count that bookings have already drawn down.
        """
        today = timezone.localdate()
        rows = []

        for room in RoomType.objects.all().iterator():
            # A property runs fuller at weekends than midweek.
            for offset in range(days):
                date = today + timedelta(days=offset)
                weekend = date.weekday() >= 4
                available = max(
                    0,
                    room.rooms_total - rng.randint(0, 6 if weekend else 3),
                )
                rows.append(RoomInventory(
                    room_type=room, stay_date=date, rooms_available=available,
                ))

        created = 0
        for start in range(0, len(rows), 2000):
            chunk = rows[start:start + 2000]
            RoomInventory.objects.bulk_create(chunk, ignore_conflicts=True)
            created += len(chunk)
        return created
