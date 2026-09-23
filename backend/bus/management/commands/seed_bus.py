"""
Demo data for the bus module.

    manage.py seed_bus

Safe to run twice: every insert is keyed on something natural (an operator's
name, a trip's route and departure, a seat's code) and re-running updates or
skips rather than duplicating. Nothing is ever deleted, so a seeded trip that
already has bookings against it is left alone.

The numbers are made up but the shape is not: real operators, real routes,
sleeper coaches with two decks and a 2+1 aisle, seaters with one deck and
2+2. That matters because the front end derives the aisle from which grid
columns hold no seats.
"""
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from bus.models import (
    BusAmenity,
    BusOperator,
    BusSeat,
    BusStopPoint,
    BusTrip,
    BusTripAmenity,
    City,
)

# Mirrors CITIES in frontend/src/constants/index.ts, so the search box's
# suggestions all resolve to something.
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

OPERATORS = [
    ('Sharma Travels', '4.3', 1204),
    ('Konduskar Travels', '4.1', 3820),
    ('Neeta Tours', '4.4', 2611),
    ('VRL Travels', '4.0', 4790),
    ('Orange Tours', '4.2', 1876),
    ('Paulo Travels', '3.9', 940),
    ('SRS Travels', '4.1', 2255),
    ('Hans Travels', '3.8', 712),
    ('Zingbus Plus', '4.5', 1533),
    ('IntrCity SmartBus', '4.4', 2984),
]

COACHES = [
    'Volvo 9600 Multi-Axle', 'Scania Metrolink', 'Bharat Benz A/C',
    'Mercedes-Benz Multi-Axle', 'Ashok Leyland 12M',
]

def routes():
    """
    Every ordered pair of cities, both directions.

    Not because an operator would really run all of them, but because the
    search box offers all twenty cities and a demo that answers "no buses" for
    most of what it suggests is worse than one with invented routes.

    The running time is derived from the pair rather than rolled, so Mumbai to
    Pune is the same length every time the seed is run and in both directions.
    """
    names = [name for name, _ in CITIES]
    for origin in names:
        for destination in names:
            if origin == destination:
                continue
            # A stable 3 to 13 hour run, keyed on the unordered pair.
            span = sum(ord(c) for c in ''.join(sorted((origin, destination))))
            yield origin, destination, 180 + span % 10 * 60

BOARDING_SUFFIXES = [
    ('Central Bus Stand', 'Platform 3, near the enquiry desk'),
    ('Highway Junction', 'Opposite the fuel station'),
    ('Railway Station Road', 'Beside the taxi stand'),
    ('City Mall Stop', 'Main gate, pickup bay 2'),
]
DROPPING_SUFFIXES = [
    ('Bus Terminal', 'Arrival bay 1'),
    ('Airport Road', 'Near the metro entrance'),
    ('Old Market Square', 'Beside the clock tower'),
    ('Tech Park Gate', 'Gate 4, drop-off lane'),
]

CANCELLATION_POLICIES = [
    'Free cancellation up to 12 hours before departure.',
    '90% refund up to 24 hours before departure, 50% after that.',
    '75% refund up to 6 hours before departure. No refund after.',
]

# A morning run, an afternoon one and an overnight sleeper. Three a route
# across 380 routes is already a thousand services; more is not more useful.
DEPARTURES = [(6, 30), (15, 0), (22, 15)]


def clock(minutes):
    minutes %= 1440
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


class Command(BaseCommand):
    help = 'Load demo operators, trips, stop points and seat maps for buses.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--seed', type=int, default=20240518,
            help='Random seed, so a reseed produces the same data.',
        )
        parser.add_argument(
            '--reset', action='store_true',
            help=(
                'Delete seeded trips before seeding. Use after changing this '
                'generator; refuses if any of them have bookings.'
            ),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options['seed'])

        if options['reset'] and not self._reset():
            return

        cities = {}
        for name, state in CITIES:
            city, _ = City.objects.get_or_create(
                name=name, defaults={'state': state, 'is_active': True},
            )
            cities[name] = city
        self.stdout.write(f'cities: {len(cities)}')

        operators = []
        for name, rating, count in OPERATORS:
            operator, _ = BusOperator.objects.get_or_create(
                name=name,
                defaults={'rating': Decimal(rating), 'rating_count': count},
            )
            operators.append(operator)
        self.stdout.write(f'operators: {len(operators)}')

        amenities = list(BusAmenity.objects.all())
        if not amenities:
            self.stderr.write(
                'No bus_amenity rows - apply schema.sql first, it seeds them.'
            )
            return

        trips = 0
        for route_index, (origin, destination, base_minutes) in enumerate(routes()):
            for slot, (hour, minute) in enumerate(DEPARTURES):
                # The overnight slot is the sleeper; the day runs are seaters.
                kind = 'sleeper' if slot == 2 else 'seater'
                departure_minutes = hour * 60 + minute
                duration = base_minutes + rng.choice([-20, 0, 15, 30])
                arrival_minutes = departure_minutes + duration
                operator = operators[(route_index * 3 + slot) % len(operators)]

                trip, created = BusTrip.objects.get_or_create(
                    operator=operator,
                    origin_city=cities[origin],
                    destination_city=cities[destination],
                    departure_time=clock(departure_minutes),
                    defaults={
                        'coach_name': rng.choice(COACHES),
                        'seat_kind': kind,
                        'is_air_conditioned': kind == 'sleeper' or rng.random() > 0.3,
                        'layout': '2+1' if kind == 'sleeper' else '2+2',
                        'arrival_time': clock(arrival_minutes),
                        'duration_minutes': duration,
                        'arrives_next_day': arrival_minutes >= 1440,
                        'base_fare': Decimal(
                            rng.randrange(8, 32) * 50 + (200 if kind == 'sleeper' else 0)
                        ),
                        'cancellation_policy': rng.choice(CANCELLATION_POLICIES),
                        'has_live_tracking': rng.random() > 0.4,
                        'is_active': True,
                    },
                )
                trips += 1
                if not created:
                    continue

                self._seed_amenities(trip, amenities, rng)
                self._seed_stop_points(
                    trip, origin, destination, departure_minutes,
                    arrival_minutes, rng,
                )
                self._seed_seats(trip, kind, rng)

        self.stdout.write(self.style.SUCCESS(
            f'bus: {trips} trips, {BusSeat.objects.count()} seats, '
            f'{BusStopPoint.objects.count()} stop points'
        ))

    def _reset(self):
        """
        Drop the seeded trips so they can be rebuilt.

        Anything with a booking against it is left alone - a stale timetable is
        worth fixing, a sold ticket is not worth losing.
        """
        stale = BusTrip.objects.all()
        booked = stale.filter(bookings__isnull=False).distinct()
        if booked.exists():
            self.stderr.write(
                f'{booked.count()} trips have bookings; refusing to reset. '
                'Cancel or move them first.'
            )
            return False

        # Seats, stop points and fares cascade with the trip.
        count = stale.count()
        stale.delete()
        self.stdout.write(f'reset: removed {count} trips')
        return True

    def _seed_amenities(self, trip, amenities, rng):
        chosen = rng.sample(amenities, rng.randint(4, min(6, len(amenities))))
        BusTripAmenity.objects.bulk_create(
            [BusTripAmenity(trip=trip, amenity=amenity) for amenity in chosen],
            ignore_conflicts=True,
        )

    def _seed_stop_points(
        self, trip, origin, destination, departure_minutes, arrival_minutes, rng,
    ):
        """
        Boarding points run backwards from the departure, dropping points
        forwards from the arrival, so both lists read chronologically.
        """
        points = []

        offset = 0
        boarding = rng.randint(2, 4)
        for index in range(boarding):
            offset += rng.randint(10, 25)
            name, landmark = BOARDING_SUFFIXES[index % len(BOARDING_SUFFIXES)]
            points.append(BusStopPoint(
                trip=trip, kind=BusStopPoint.BOARDING,
                name=f'{origin} {name}', landmark=landmark,
                stop_time=clock(departure_minutes - offset),
                # Furthest from the departure is boarded first.
                sort_order=boarding - index - 1,
            ))

        offset = 0
        for index in range(rng.randint(2, 3)):
            offset += rng.randint(10, 25)
            name, landmark = DROPPING_SUFFIXES[index % len(DROPPING_SUFFIXES)]
            points.append(BusStopPoint(
                trip=trip, kind=BusStopPoint.DROPPING,
                name=f'{destination} {name}', landmark=landmark,
                stop_time=clock(arrival_minutes + offset),
                sort_order=index,
            ))

        BusStopPoint.objects.bulk_create(points)

    def _seed_seats(self, trip, kind, rng):
        """
        A sleeper gets two decks in 2+1, a seater one deck in 2+2. The aisle is
        the grid column left empty - column 3 either way - because that is what
        the seat map reads to draw the gap.
        """
        sleeper = kind == 'sleeper'
        decks = ['lower', 'upper'] if sleeper else ['lower']
        rows = 6 if sleeper else 10
        columns = [1, 2, 4] if sleeper else [1, 2, 4, 5]

        seats = []
        for deck in decks:
            prefix = 'L' if deck == 'lower' else 'U'
            # Upper berths are the cheaper ones on most operators.
            deck_price = trip.base_fare + (0 if deck == 'upper' else 120)
            counter = 1

            for row in range(1, rows + 1):
                for column in columns:
                    roll = rng.random()
                    if roll > 0.94:
                        status = BusSeat.BLOCKED
                    elif roll > 0.86:
                        status = BusSeat.LADIES
                    else:
                        status = BusSeat.AVAILABLE

                    seats.append(BusSeat(
                        trip=trip, seat_code=f'{prefix}{counter}',
                        deck=deck, row_no=row, column_no=column,
                        seat_kind=kind, status=status,
                        # Front rows carry a small premium.
                        price=deck_price + (60 if row <= 2 else 0),
                    ))
                    counter += 1

        BusSeat.objects.bulk_create(seats, ignore_conflicts=True)
