"""
Demo data for the plane module.

    manage.py seed_plane

Safe to run twice: every insert is keyed on something natural (an IATA code, a
carrier's flight number, a seat's code) and re-running skips rather than
duplicating.

One flight per ordered pair of cities, both directions. Not because a carrier
would really fly all of them, but because the search box offers twenty cities
and a demo that answers "no flights" for most of what it suggests is worse
than one with invented routes.
"""
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from plane.models import (
    Airline,
    Airport,
    City,
    FareBrand,
    Flight,
    FlightSeat,
    FlightStop,
)

# Mirrors CITIES in frontend/src/constants/index.ts. Gurugram and Navi Mumbai
# have no airport of their own in life; here they get one so every suggestion
# resolves.
AIRPORTS = [
    ('BOM', 'Chhatrapati Shivaji Maharaj International', 'Mumbai', 'Maharashtra'),
    ('NMI', 'Navi Mumbai International', 'Navi Mumbai', 'Maharashtra'),
    ('PNQ', 'Pune', 'Pune', 'Maharashtra'),
    ('ISK', 'Nashik Ozar', 'Nashik', 'Maharashtra'),
    ('NAG', 'Dr. Babasaheb Ambedkar International', 'Nagpur', 'Maharashtra'),
    ('DEL', 'Indira Gandhi International', 'Delhi', 'Delhi'),
    ('GGN', 'Gurugram Heliport', 'Gurugram', 'Haryana'),
    ('JAI', 'Jaipur International', 'Jaipur', 'Rajasthan'),
    ('AMD', 'Sardar Vallabhbhai Patel International', 'Ahmedabad', 'Gujarat'),
    ('STV', 'Surat', 'Surat', 'Gujarat'),
    ('IDR', 'Devi Ahilyabai Holkar', 'Indore', 'Madhya Pradesh'),
    ('BLR', 'Kempegowda International', 'Bengaluru', 'Karnataka'),
    ('HYD', 'Rajiv Gandhi International', 'Hyderabad', 'Telangana'),
    ('MAA', 'Chennai International', 'Chennai', 'Tamil Nadu'),
    ('COK', 'Cochin International', 'Kochi', 'Kerala'),
    ('GOI', 'Goa International', 'Goa', 'Goa'),
    ('CCU', 'Netaji Subhas Chandra Bose International', 'Kolkata', 'West Bengal'),
    ('LKO', 'Chaudhary Charan Singh International', 'Lucknow', 'Uttar Pradesh'),
    ('IXC', 'Chandigarh International', 'Chandigarh', 'Chandigarh'),
    ('DED', 'Jolly Grant', 'Dehradun', 'Uttarakhand'),
]

AIRLINES = [
    ('6E', 'IndiGo'), ('AI', 'Air India'), ('UK', 'Vistara'),
    ('SG', 'SpiceJet'), ('QP', 'Akasa Air'), ('IX', 'Air India Express'),
]

AIRCRAFT = [
    'Airbus A320neo', 'Airbus A321neo', 'Boeing 737 MAX 8',
    'Boeing 737-800', 'ATR 72-600',
]

# The three fare families, as the fare cards read them.
BRANDS = [
    {
        'code': 'saver', 'name': 'Saver', 'multiplier': 1.0,
        'cabin_baggage_kg': 7, 'checkin_baggage_kg': 15,
        'cancellation_note': 'Cancellation fee applies', 'cancellation_tier': 'fee',
        'date_change_note': 'Date change fee applies', 'date_change_tier': 'fee',
        'free_seat_selection': False, 'meal_included': False,
    },
    {
        'code': 'comfort', 'name': 'Comfort', 'multiplier': 1.24,
        'cabin_baggage_kg': 7, 'checkin_baggage_kg': 20,
        'cancellation_note': 'Lower cancellation fee', 'cancellation_tier': 'reduced',
        'date_change_note': 'Lower date change fee', 'date_change_tier': 'reduced',
        'free_seat_selection': True, 'meal_included': True,
    },
    {
        'code': 'flexi', 'name': 'Flexi', 'multiplier': 1.55,
        'cabin_baggage_kg': 10, 'checkin_baggage_kg': 25,
        'cancellation_note': 'Free cancellation up to 24h before departure',
        'cancellation_tier': 'free',
        'date_change_note': 'Free date change up to 24h before departure',
        'date_change_tier': 'free',
        'free_seat_selection': True, 'meal_included': True,
    },
]

# A single-aisle 3-3 cabin. `is_aisle` on C and D is what the API reads to put
# the gap in the column ruler, so it is not decoration.
COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F']
ROW_COUNT = 12
EXIT_ROWS = [6, 7]

SEAT_PRICE = {
    'front': {'aisle_or_window': 600, 'middle': 450},
    'extra-legroom': {'aisle_or_window': 850, 'middle': 700},
    'standard': {'aisle_or_window': 200, 'middle': 0},
}


def clock(minutes):
    minutes %= 1440
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


class Command(BaseCommand):
    help = 'Load demo airlines, airports, flights, fares and cabins.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flights-per-route', type=int, default=3,
            help='Departures a day on each route.',
        )
        parser.add_argument(
            '--reset', action='store_true',
            help=(
                'Delete seeded flights before seeding. Use after changing this '
                'generator; refuses if any of them have bookings.'
            ),
        )
        parser.add_argument('--seed', type=int, default=20240518)

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options['seed'])

        if options['reset'] and not self._reset():
            return

        airports = {}
        for code, name, city_name, state in AIRPORTS:
            city, _ = City.objects.get_or_create(
                name=city_name, defaults={'state': state, 'is_active': True},
            )
            airport, _ = Airport.objects.get_or_create(
                code=code, defaults={'name': name, 'city': city},
            )
            airports[code] = airport
        self.stdout.write(f'airports: {len(airports)}')

        airlines = []
        for code, name in AIRLINES:
            airline, _ = Airline.objects.get_or_create(
                code=code, defaults={'name': name, 'is_active': True},
            )
            airlines.append(airline)
        self.stdout.write(f'airlines: {len(airlines)}')

        codes = list(airports)
        per_route = options['flights_per_route']
        flights = 0
        number = 100

        for origin in codes:
            for destination in codes:
                if origin == destination:
                    continue

                # Keyed on the pair, so a route keeps its length and its price
                # band across reseeds and in both directions.
                span = sum(ord(c) for c in ''.join(sorted((origin, destination))))
                non_stop_minutes = 60 + span % 150

                for slot in range(per_route):
                    number += 1
                    airline = airlines[(span + slot) % len(airlines)]
                    departure = (5 + (span + slot * 7) % 18) * 60 + slot * 25

                    stop_count = 1 if (span + slot) % 7 == 0 else 0
                    layover = rng.randint(45, 150) if stop_count else 0
                    duration = round(
                        (non_stop_minutes * (0.9 + rng.random() * 0.25) + layover) / 5
                    ) * 5
                    arrival = departure + duration

                    flight, created = Flight.objects.get_or_create(
                        airline=airline, flight_number=str(number),
                        defaults={
                            'aircraft': rng.choice(AIRCRAFT),
                            'origin_airport': airports[origin],
                            'origin_terminal': f'T{1 + span % 3}',
                            'destination_airport': airports[destination],
                            'destination_terminal': f'T{1 + (span + 1) % 3}',
                            'departure_time': clock(departure),
                            'arrival_time': clock(arrival),
                            'duration_minutes': duration,
                            'days_to_arrive': arrival // 1440,
                            'cabin_class': 'economy',
                            'on_time_percent': rng.randint(62, 96),
                            'is_active': True,
                        },
                    )
                    flights += 1
                    if not created:
                        continue

                    # Non-stop flights command a premium; a stop is the cheap
                    # option.
                    base = rng.randrange(22, 78) * 50 + (900 if not stop_count else 0)
                    self._seed_fares(flight, base, rng)
                    self._seed_seats(flight)

                    if stop_count:
                        via = codes[(span * 3) % len(codes)]
                        if via not in (origin, destination):
                            FlightStop.objects.get_or_create(
                                flight=flight, airport=airports[via],
                                defaults={
                                    'layover_minutes': layover, 'sort_order': 0,
                                },
                            )

        self.stdout.write(self.style.SUCCESS(
            f'plane: {flights} flights, {FareBrand.objects.count()} fares, '
            f'{FlightSeat.objects.count()} seats'
        ))

    def _reset(self):
        """
        Drop the seeded flights so they can be rebuilt.

        Anything with a booking against it is left alone - a stale timetable is
        worth fixing, a sold ticket is not worth losing.
        """
        stale = Flight.objects.all()
        booked = stale.filter(bookings__isnull=False).distinct()
        if booked.exists():
            self.stderr.write(
                f'{booked.count()} flights have bookings; refusing to reset. '
                'Cancel or move them first.'
            )
            return False

        # Seats, stops and fares cascade with the flight.
        count = stale.count()
        stale.delete()
        self.stdout.write(f'reset: removed {count} flights')
        return True

    def _seed_fares(self, flight, base, rng):
        FareBrand.objects.bulk_create([
            FareBrand(
                flight=flight,
                code=brand['code'], name=brand['name'],
                price=Decimal(round(base * brand['multiplier'] / 10) * 10),
                cabin_baggage_kg=brand['cabin_baggage_kg'],
                checkin_baggage_kg=brand['checkin_baggage_kg'],
                cancellation_note=brand['cancellation_note'],
                cancellation_tier=brand['cancellation_tier'],
                date_change_note=brand['date_change_note'],
                date_change_tier=brand['date_change_tier'],
                free_seat_selection=brand['free_seat_selection'],
                meal_included=brand['meal_included'],
            )
            for brand in BRANDS
        ], ignore_conflicts=True)

    def _seed_seats(self, flight):
        """
        Front rows and exit rows cost most; middle seats are free. Occupancy is
        not stored — a seat is taken when a traveller on a booking for that
        date holds it.
        """
        seats = []
        for row in range(1, ROW_COUNT + 1):
            exit_row = row in EXIT_ROWS
            zone = 'extra-legroom' if exit_row else 'front' if row <= 2 else 'standard'

            for column in COLUMNS:
                window = column in ('A', 'F')
                aisle = column in ('C', 'D')
                band = 'aisle_or_window' if window or aisle else 'middle'

                seats.append(FlightSeat(
                    flight=flight, seat_code=f'{row}{column}',
                    row_no=row, seat_column=column, zone=zone,
                    price=Decimal(SEAT_PRICE[zone][band]),
                    is_window=window, is_aisle=aisle, is_exit_row=exit_row,
                ))

        FlightSeat.objects.bulk_create(seats, ignore_conflicts=True)
