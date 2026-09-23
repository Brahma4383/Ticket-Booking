"""
Demo data for the train module.

    manage.py seed_train [--days 30]

Safe to run twice: every insert is keyed on something natural (a station code,
a train number, an availability row's train/class/quota/date) and re-running
updates or skips rather than duplicating.

The part worth understanding is `train_availability`. Fares and seats are per
date *and* per quota, so a train with no row for the date being searched is
not offered at all. `--days` is how far ahead rows are loaded; past that, the
search goes quiet until it is run again.
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from train.models import (
    City,
    Train,
    TrainAvailability,
    TrainBoardingStation,
    TrainClass,
    TrainQuota,
    TrainStation,
)

# Mirrors CITIES in frontend/src/constants/index.ts, so every suggestion the
# search box offers has a station behind it.
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

# code, name, city. Real codes where there is a real station; the rest are
# derived, because the search box offers twenty cities and a demo that answers
# "no trains" for most of them is worse than one with invented services.
STATIONS = [
    ('CSTM', 'Mumbai CSMT', 'Mumbai'),
    ('NMI', 'Navi Mumbai Junction', 'Navi Mumbai'),
    ('PUNE', 'Pune Junction', 'Pune'),
    ('NK', 'Nashik Road', 'Nashik'),
    ('NGP', 'Nagpur Junction', 'Nagpur'),
    ('NDLS', 'New Delhi', 'Delhi'),
    ('GGN', 'Gurugram', 'Gurugram'),
    ('JP', 'Jaipur Junction', 'Jaipur'),
    ('ADI', 'Ahmedabad Junction', 'Ahmedabad'),
    ('ST', 'Surat', 'Surat'),
    ('INDB', 'Indore Junction', 'Indore'),
    ('SBC', 'KSR Bengaluru', 'Bengaluru'),
    ('SC', 'Secunderabad Junction', 'Hyderabad'),
    ('MAS', 'Chennai Central', 'Chennai'),
    ('ERS', 'Ernakulam Junction', 'Kochi'),
    ('MAO', 'Madgaon', 'Goa'),
    ('HWH', 'Howrah Junction', 'Kolkata'),
    ('LKO', 'Lucknow Charbagh', 'Lucknow'),
    ('CDG', 'Chandigarh', 'Chandigarh'),
    ('DDN', 'Dehradun', 'Dehradun'),
    # A second Mumbai station, so boarding points have somewhere to be.
    ('LTT', 'Lokmanya Tilak Terminus', 'Mumbai'),
    ('DR', 'Dadar', 'Mumbai'),
]

# Names a generated service is given, picked by route so a train keeps its
# name across reseeds.
TRAIN_NAMES = [
    'Rajdhani Express', 'Shatabdi Express', 'Duronto Express',
    'Garib Rath', 'Jan Shatabdi', 'Intercity Express',
    'Sampark Kranti', 'Vande Bharat Express', 'Humsafar Express',
    'Superfast Express', 'Express', 'Mail',
]

# Premium services skip sleeper; the slower ones skip first AC.
PREMIUM_CLASSES = ['1A', '2A', '3A', 'CC']
STANDARD_CLASSES = ['SL', '3A', '2A', '2S']


SERVICES_PER_ROUTE = 2


def generated_trains():
    """
    The named expresses, plus generated services on every ordered pair.

    Routes that already have a real train get the generated ones too rather
    than being skipped: a couple of the named expresses do not run daily, and
    a major route offering one train on some days reads as a bug.
    """
    for entry in TRAINS:
        yield entry

    # One station a city. Mumbai's other two exist so boarding points have
    # somewhere to be, not so every route runs from all three.
    codes = [code for code, _, city in STATIONS
             if city != 'Mumbai' or code == 'CSTM']

    for origin_index, origin in enumerate(codes):
        for destination_index, destination in enumerate(codes):
            if origin == destination:
                continue

            # Keyed on the pair, so a route keeps its length and its services
            # across reseeds and in both directions.
            span = sum(ord(c) for c in ''.join(sorted((origin, destination))))
            duration = 180 + span % 18 * 60

            for slot in range(SERVICES_PER_ROUTE):
                # The number encodes the route, not a running counter. A
                # counter would renumber every service the moment this
                # generator changed, and `get_or_create(number=...)` would
                # then hand an existing train a different route.
                serial = f'9{origin_index:02d}{destination_index:02d}{slot}'
                premium = (span + slot) % 3 == 0
                name = TRAIN_NAMES[(span + slot) % len(TRAIN_NAMES)]
                classes = (PREMIUM_CLASSES if premium else STANDARD_CLASSES)[:3]

                yield (
                    serial, name, origin, destination,
                    f'{(6 + (span + slot * 9) % 16):02d}:{((span + slot) % 4) * 15:02d}',
                    duration + slot * 25, classes,
                )


# The real services, by number. Everything else is generated around them.
# number, name, origin, destination, departure, duration (minutes), classes.
TRAINS = [
    ('12123', 'Deccan Queen', 'CSTM', 'PUNE', '17:10', 195, ['CC', '2S']),
    ('12124', 'Deccan Queen', 'PUNE', 'CSTM', '07:15', 200, ['CC', '2S']),
    ('11007', 'Deccan Express', 'CSTM', 'PUNE', '06:40', 230, ['SL', '3A', '2S']),
    ('12127', 'Intercity Express', 'CSTM', 'PUNE', '15:25', 205, ['CC', '2S']),
    ('12951', 'Mumbai Rajdhani', 'CSTM', 'NDLS', '17:00', 955, ['1A', '2A', '3A']),
    ('12953', 'August Kranti Rajdhani', 'CSTM', 'NDLS', '17:40', 1010, ['1A', '2A', '3A']),
    ('12009', 'Shatabdi Express', 'CSTM', 'ADI', '06:25', 415, ['CC', '1A']),
    ('12933', 'Karnavati Express', 'CSTM', 'ADI', '13:40', 445, ['CC', '3A', 'SL']),
    ('11301', 'Udyan Express', 'CSTM', 'SBC', '08:10', 1425, ['SL', '3A', '2A']),
    ('12163', 'Dadar Chennai Express', 'DR', 'MAS', '20:20', 1385, ['SL', '3A', '2A']),
    ('12617', 'Mangala Lakshadweep', 'LTT', 'MAO', '10:00', 640, ['SL', '3A', '3E']),
    ('10103', 'Mandovi Express', 'CSTM', 'MAO', '07:10', 705, ['SL', '3A', '2A']),
    ('12289', 'Nagpur Duronto', 'CSTM', 'NGP', '20:40', 810, ['1A', '2A', '3A']),
    ('12139', 'Sewagram Express', 'CSTM', 'NGP', '15:50', 900, ['SL', '3A', '2A']),
    ('12617B', 'Nashik Passenger', 'CSTM', 'NK', '06:00', 265, ['SL', '2S']),
    ('12951J', 'Jaipur Superfast', 'NDLS', 'JP', '06:05', 280, ['CC', '3A', '2S']),
    ('12958', 'Swarna Jayanti Rajdhani', 'NDLS', 'ADI', '19:55', 870, ['1A', '2A', '3A']),
    ('12004', 'Lucknow Shatabdi', 'NDLS', 'LKO', '06:10', 385, ['CC', '1A']),
    ('12608', 'Lalbagh Express', 'MAS', 'SBC', '15:35', 355, ['CC', '2S']),
    ('12658', 'Bengaluru Mail', 'MAS', 'SBC', '23:30', 390, ['SL', '3A', '2A']),
    ('12759', 'Charminar Express', 'MAS', 'SC', '18:25', 780, ['SL', '3A', '2A']),
    ('12839', 'Howrah Mail', 'MAS', 'HWH', '23:30', 1660, ['SL', '3A', '2A']),
]

CANCELLATION_POLICIES = [
    'Free cancellation up to 48 hours before departure, then a flat clerkage fee applies.',
    '50% refund up to 12 hours before departure. No refund within 4 hours.',
    'Confirmed tickets: flat cancellation charge per passenger. Waitlisted tickets are refunded in full.',
]

# Fare multiplier relative to a sleeper ticket.
CLASS_MULTIPLIER = {
    '2S': 0.4, 'SL': 1.0, 'CC': 1.9, '3E': 2.3, '3A': 2.6, '2A': 3.7, '1A': 6.2,
}


def clock(minutes):
    minutes %= 1440
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


def to_minutes(value):
    hours, minutes = value.split(':')
    return int(hours) * 60 + int(minutes)


class Command(BaseCommand):
    help = 'Load demo stations, trains and dated availability for trains.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days', type=int, default=14,
            help='How many days of availability to load, from today.',
        )
        parser.add_argument(
            '--reset', action='store_true',
            help=(
                'Delete generated services (not the named expresses) before '
                'seeding. Use after changing this generator; refuses if any '
                'of them have bookings.'
            ),
        )
        parser.add_argument('--seed', type=int, default=20240518)

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options['seed'])

        if options['reset'] and not self._reset():
            return

        classes = {c.code: c for c in TrainClass.objects.all()}
        quotas = list(TrainQuota.objects.all())
        if not classes or not quotas:
            self.stderr.write(
                'No train_class / train_quota rows - apply schema.sql first, '
                'it seeds them.'
            )
            return

        cities = {}
        for name, state in CITIES:
            city, _ = City.objects.get_or_create(
                name=name, defaults={'state': state, 'is_active': True},
            )
            cities[name] = city

        stations = {}
        for code, name, city in STATIONS:
            station, _ = TrainStation.objects.get_or_create(
                code=code, defaults={'name': name, 'city': cities[city]},
            )
            stations[code] = station
        self.stdout.write(f'stations: {len(stations)}')

        trains = []
        class_codes = {}
        for entry in generated_trains():
            number, name, origin, destination, departure, duration, codes = entry
            class_codes[number] = codes
            arrival_minutes = to_minutes(departure) + duration
            train, _ = Train.objects.get_or_create(
                number=number,
                defaults={
                    'name': name,
                    'origin_station': stations[origin],
                    'destination_station': stations[destination],
                    'departure_time': departure,
                    'arrival_time': clock(arrival_minutes),
                    'duration_minutes': duration,
                    'days_to_arrive': arrival_minutes // 1440,
                    'has_pantry': rng.random() > 0.35,
                    'rating': Decimal(str(round(3.6 + rng.random() * 1.3, 1))),
                    'cancellation_policy': rng.choice(CANCELLATION_POLICIES),
                    # A few trains do not run every day, which is what makes
                    # the running-day filter mean something.
                    **self._running_days(rng),
                    'is_active': True,
                },
            )
            trains.append(train)
        self.stdout.write(f'trains: {len(trains)}')

        self._seed_boarding_stations(trains, stations, rng)
        rows = self._seed_availability(
            trains, classes, quotas, class_codes, options['days'], rng,
        )

        self.stdout.write(self.style.SUCCESS(
            f'train: {len(trains)} trains, {rows} availability rows '
            f'over {options["days"]} days'
        ))

    def _reset(self):
        """
        Drop the generated services so they can be rebuilt.

        The named expresses are left alone, and so is anything with a booking
        against it - a stale timetable is worth fixing, a sold ticket is not
        worth losing.
        """
        named = {number for number, *_ in TRAINS}
        stale = Train.objects.exclude(number__in=named)

        booked = stale.filter(bookings__isnull=False).distinct()
        if booked.exists():
            self.stderr.write(
                f'{booked.count()} generated trains have bookings; '
                'refusing to reset. Cancel or move them first.'
            )
            return False

        # Availability and boarding stations cascade with the train.
        count = stale.count()
        stale.delete()
        self.stdout.write(f'reset: removed {count} generated trains')
        return True

    def _running_days(self, rng):
        fields = Train.RUNS_FIELDS
        # Four trains in five run daily; the rest skip one or two days.
        if rng.random() > 0.2:
            return {field: True for field in fields}

        off = rng.sample(range(7), rng.randint(1, 2))
        return {field: index not in off for index, field in enumerate(fields)}

    def _seed_boarding_stations(self, trains, stations, rng):
        """
        Intermediate stops a passenger may board at instead of the origin. The
        origin itself is never stored - the API always offers it and puts it
        first.
        """
        by_city = {}
        for station in stations.values():
            by_city.setdefault(station.city_id, []).append(station)

        rows = []
        for train in trains:
            siblings = [
                station for station in by_city.get(train.origin_station.city_id, [])
                if station.pk != train.origin_station_id
            ]
            if not siblings:
                continue

            offset = 0
            for order, station in enumerate(siblings[:2]):
                offset += rng.randint(15, 40)
                minutes = to_minutes(train.departure_time) + offset
                rows.append(TrainBoardingStation(
                    train=train, station=station,
                    departure_time=clock(minutes),
                    day_offset=minutes // 1440,
                    sort_order=order,
                ))

        TrainBoardingStation.objects.bulk_create(rows, ignore_conflicts=True)

    def _seed_availability(self, trains, classes, quotas, class_codes, days, rng):
        """
        One row per train, class, quota and date.

        The label is what the railways print, and the kind drives how a
        booking is allotted: `available` gets a berth, `rac` and `waitlist` get
        a queue position instead.
        """
        today = timezone.localdate()

        rows = []
        for train in trains:
            base_sleeper_fare = rng.randrange(5, 22) * 55

            for code in class_codes[train.number]:
                train_class = classes.get(code)
                if train_class is None:
                    continue

                fare = round(base_sleeper_fare * CLASS_MULTIPLIER[code] / 5) * 5

                for offset in range(days):
                    date = today + timedelta(days=offset)
                    if not train.runs_on_date(date):
                        continue

                    for quota in quotas:
                        kind, count, label, chance = self._availability(rng, code)
                        # Tatkal opens late and is priced above general.
                        quota_fare = (
                            fare * 1.3 if quota.code == 'tatkal' else fare
                        )
                        rows.append(TrainAvailability(
                            train=train, train_class=train_class, quota=quota,
                            travel_date=date,
                            fare=Decimal(str(round(quota_fare, 2))),
                            availability_kind=kind,
                            availability_count=count,
                            availability_label=label,
                            confirm_chance=chance,
                        ))

        # Chunked: a month of four quotas across twenty-odd trains is tens of
        # thousands of rows, and one statement that size trips max_allowed_packet.
        created = 0
        for start in range(0, len(rows), 2000):
            TrainAvailability.objects.bulk_create(
                rows[start:start + 2000], ignore_conflicts=True,
            )
            created += len(rows[start:start + 2000])
        return created

    def _availability(self, rng, code):
        roll = rng.random()

        if roll > 0.52:
            count = rng.randint(1, 320)
            return 'available', count, f'AVAILABLE-{count:04d}', 100
        if roll > 0.34:
            count = rng.randint(1, 40)
            return 'rac', count, f'RAC {count}', rng.randint(70, 96)
        if roll > 0.12:
            count = rng.randint(1, 90)
            # Long waitlists rarely clear.
            return 'waitlist', count, f'GNWL {count}', max(4, 85 - count)

        # "Regret" is the railways' own wording for a closed class.
        return 'unavailable', 0, 'REGRET' if code == '1A' else 'NOT AVAILABLE', 0
