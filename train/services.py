"""
The train module's business rules.

Views stay thin: they validate input, call one function from here, and render
the result. Everything that touches more than one table - searching a route on
a date, pricing a class under a quota, preparing the chart, taking the
availability - lives here so it can be reasoned about without a request in
hand.
"""
import random
import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from django.utils import timezone

from accounts.cancellation import ensure_cancellable, mark_cancelled
from accounts.exceptions import BookingNotFound

from train.exceptions import (
    BookingNotFound,
    ClassUnavailable,
    InvalidSelection,
    TrainNotFound,
)
from train.models import (
    Booking,
    BookingFareLine,
    Payment,
    Train,
    TrainAvailability,
    TrainBoardingStation,
    TrainBooking,
    TrainClass,
    TrainPassenger,
    TrainQuota,
)
from train.serializers import (
    serialise_class_option,
    serialise_trip,
)


# ---------------------------------------------------------------------------
# Fare rules
#
# These mirror `calculateTrainFare` in frontend/src/services/train.services.ts
# so the summary can update as passengers are added without a round trip. What
# differs is where the numbers come from: the per-class reservation charge and
# the Tatkal premium are columns here (`train_class.reservation_charge`,
# `train_quota.surcharge_percent`), not hard-coded tables. The server
# recomputes on booking and its answer is the one that is charged.
# ---------------------------------------------------------------------------

INSURANCE_PER_PASSENGER = Decimal('0.45')
GST_RATE = Decimal('0.05')

# Whole rupees, matching the `Math.round` the front end applies.
RUPEE = Decimal('1')
PAISE = Decimal('0.01')


def calculate_fare(availability, passenger_count, insured):
    """
    Price a class under a quota for a number of passengers.

    GST is levied on air-conditioned classes only, and on the fare before
    insurance - travel insurance is not a taxable supply here.
    """
    if availability is None or passenger_count == 0:
        zero = Decimal('0.00')
        return {
            'base_fare': zero, 'quota_surcharge': zero,
            'reservation_charge': zero, 'insurance': zero,
            'gst': zero, 'total': zero,
        }

    count = Decimal(passenger_count)
    base_fare = Decimal(availability.fare) * count
    quota_surcharge = (
        base_fare * Decimal(availability.quota.surcharge_percent) / Decimal('100')
    ).quantize(RUPEE, rounding=ROUND_HALF_UP)
    reservation_charge = (
        Decimal(availability.train_class.reservation_charge) * count
    )
    insurance = (
        (INSURANCE_PER_PASSENGER * count).quantize(PAISE, rounding=ROUND_HALF_UP)
        if insured else Decimal('0.00')
    )

    taxable = base_fare + quota_surcharge + reservation_charge
    gst = (
        (taxable * GST_RATE).quantize(RUPEE, rounding=ROUND_HALF_UP)
        if availability.train_class.is_air_conditioned else Decimal('0.00')
    )

    return {
        'base_fare': base_fare,
        'quota_surcharge': quota_surcharge,
        'reservation_charge': reservation_charge,
        'insurance': insurance,
        'gst': gst,
        'total': taxable + insurance + gst,
    }


# ---------------------------------------------------------------------------
# Reading the timetable
# ---------------------------------------------------------------------------

def get_quota(code):
    quota = TrainQuota.objects.filter(code__iexact=code.strip()).first()
    if quota is None:
        raise InvalidSelection(
            'That quota does not exist.', detail={'quota': code},
        )
    return quota


def get_class(code):
    train_class = TrainClass.objects.filter(code__iexact=code.strip()).first()
    if train_class is None:
        raise InvalidSelection(
            'That reservation class does not exist.',
            detail={'classCode': code},
        )
    return train_class


def _train_queryset():
    """Every train read pulls the same related rows."""
    return (
        Train.objects
        .select_related(
            'origin_station', 'origin_station__city',
            'destination_station', 'destination_station__city',
        )
        .prefetch_related(
            Prefetch(
                'boarding_stations',
                queryset=(
                    TrainBoardingStation.objects
                    .select_related('station')
                    .order_by('sort_order', 'departure_time')
                ),
            ),
        )
    )


def _place_filter(prefix, place):
    """
    Match a place against a station.

    The search box offers city names, but a traveller may well type a station
    name or its code, and all three identify the same platform. `city__name`
    is what the home page actually sends.
    """
    place = place.strip()
    return (
        Q(**{f'{prefix}__city__name__iexact': place})
        | Q(**{f'{prefix}__name__iexact': place})
        | Q(**{f'{prefix}__code__iexact': place})
    )


def _availability_by_train(train_ids, travel_date, quota):
    """
    Availability rows for a page of trains, keyed by train id.

    One query for however many trains matched. Ordered by the class's own
    `sort_order`, which is the order a train card lists its classes in.
    """
    rows = (
        TrainAvailability.objects
        .filter(train_id__in=train_ids, travel_date=travel_date, quota=quota)
        .select_related('train_class', 'quota')
        .order_by('train_class__sort_order', 'train_class__code')
    )

    by_train = {}
    for row in rows:
        by_train.setdefault(row.train_id, []).append(row)
    return by_train


def search_trains(from_place, to_place, travel_date, quota_code):
    """
    Trains running between two places on a date, with fares and availability.

    Two things narrow the list beyond the route. A train is only offered on a
    day it actually runs, and only if it has availability rows for that date
    and quota - a train with no rows has nothing to sell, so listing it with
    an empty class list would be worse than leaving it out.
    """
    quota = get_quota(quota_code)

    candidates = [
        train for train in (
            _train_queryset()
            .filter(is_active=True)
            .filter(_place_filter('origin_station', from_place))
            .filter(_place_filter('destination_station', to_place))
            .order_by('departure_time')
        )
        if train.runs_on_date(travel_date)
    ]

    by_train = _availability_by_train(
        [train.pk for train in candidates], travel_date, quota,
    )

    return [
        serialise_trip(
            train, by_train[train.pk], list(train.boarding_stations.all()),
        )
        for train in candidates
        if by_train.get(train.pk)
    ]


def get_train(train_id, *, active_only=True):
    """
    One train with its related rows.

    `active_only` is on for anything that leads to a sale and off when reading
    a ticket back: a service withdrawn from the timetable still has to print
    the tickets already issued against it.
    """
    trains = _train_queryset()
    if active_only:
        trains = trains.filter(is_active=True)

    train = trains.filter(pk=train_id).first()
    if train is None:
        raise TrainNotFound()
    return train


def trip_payload(train, travel_date, quota):
    """One train serialised as a TrainTrip for a date and quota."""
    rows = _availability_by_train([train.pk], travel_date, quota).get(train.pk, [])
    return serialise_trip(train, rows, list(train.boarding_stations.all()))


def get_availability(train, train_class, quota, travel_date, *, lock=False):
    """
    The one availability row a booking sells from.

    `lock` takes it with SELECT ... FOR UPDATE, so two people buying the last
    berths in a class are serialised rather than both passing the check.
    """
    rows = TrainAvailability.objects.select_related('train_class', 'quota')
    if lock:
        # select_related columns cannot be locked on every backend; the row
        # this booking decrements is the only one that has to be.
        rows = rows.select_for_update(of=('self',))

    row = rows.filter(
        train=train, train_class=train_class,
        quota=quota, travel_date=travel_date,
    ).first()

    if row is None:
        raise InvalidSelection(
            'That class is not sold on this train for that date and quota.',
            detail={'classCode': train_class.code, 'quota': quota.code},
        )
    return row


def resolve_boarding_station(train, code):
    """
    Turn a boarding station code into a station, and check it is on the route.

    The origin is always a legal choice and is not stored in
    `train_boarding_station`, so it is checked first.
    """
    code = code.strip()

    if train.origin_station.code.casefold() == code.casefold():
        return train.origin_station, train.departure_time, 0

    row = next(
        (
            row for row in train.boarding_stations.all()
            if row.station.code.casefold() == code.casefold()
        ),
        None,
    )
    if row is None:
        raise InvalidSelection(
            'That boarding station is not on this train.',
            detail={'boardingStationCode': code},
        )
    return row.station, row.departure_time, row.day_offset


def attach_boarding_time(train_booking, train):
    """
    Work out when the ticket's boarding station is departed from.

    `train_booking` stores which station was chosen but not its time, because
    the timetable already holds it. The serializer needs both, so they are
    hung on the instance here rather than queried again from the template.
    """
    train_booking.boarding_departure_time = train.departure_time
    train_booking.boarding_day_offset = 0

    if train_booking.boarding_station_id is None:
        return

    if train_booking.boarding_station_id != train.origin_station_id:
        row = next(
            (
                row for row in train.boarding_stations.all()
                if row.station_id == train_booking.boarding_station_id
            ),
            None,
        )
        if row is not None:
            train_booking.boarding_departure_time = row.departure_time
            train_booking.boarding_day_offset = row.day_offset


# ---------------------------------------------------------------------------
# Chart preparation
#
# Stands in for the allotment the railways do before departure. A confirmed
# class gets a coach and a berth; RAC and waitlisted tickets keep their queue
# position instead, which is why the berth asked for and the one given can
# differ. Mirrors `allot` in frontend/src/services/train.services.ts.
# ---------------------------------------------------------------------------

COACH_PREFIX = {
    '1A': 'H', '2A': 'A', '3A': 'B', '3E': 'M',
    'CC': 'C', 'SL': 'S', '2S': 'D',
}

BERTH_NAMES = ['Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper']

CHART_CONFIRMED = 'Chart not prepared — berths are confirmed'
CHART_PROVISIONAL = 'Chart not prepared — status updates closer to departure'


def _berth_name(preference, rng):
    """`side-lower` reads as `Side Lower` on a ticket."""
    if preference == TrainPassenger.NO_PREFERENCE:
        return rng.choice(BERTH_NAMES)
    return ' '.join(part.capitalize() for part in preference.split('-'))


def allot(passengers, availability, rng=None):
    """
    Give each passenger a coach and berth, or a queue position.

    Returns one dict per passenger, in the order given, carrying the three
    columns `train_passenger` records: allotted coach, allotted berth and
    booking status.
    """
    rng = rng or random.Random()
    kind = availability.availability_kind
    count = availability.availability_count
    coach = (
        f'{COACH_PREFIX.get(availability.train_class.code, "S")}'
        f'{rng.randint(1, 8)}'
    )

    allotments = []
    for index, passenger in enumerate(passengers):
        if kind == TrainAvailability.AVAILABLE:
            berth_number = rng.randint(1, 72)
            berth_name = _berth_name(passenger['berth'], rng)
            allotments.append({
                'coach': coach,
                'status': 'CNF',
                'berth': f'{coach} / {berth_number} / {berth_name}',
            })
        elif kind == TrainAvailability.RAC:
            position = count + index
            allotments.append({
                'coach': coach,
                'status': f'RAC {position}',
                'berth': f'{coach} / RAC {position}',
            })
        else:
            position = count + index
            allotments.append({
                'coach': None,
                'status': f'WL {position}',
                'berth': None,
            })

    return allotments


def _take_availability(availability, passenger_count):
    """
    Move the availability on after a sale.

    A confirmed sale takes berths off the count; an RAC or waitlisted one
    lengthens the queue behind it. The labels are the ones the railways print,
    and the same ones the front end's mock produced.
    """
    kind = availability.availability_kind

    if kind == TrainAvailability.AVAILABLE:
        remaining = availability.availability_count - passenger_count
        if remaining > 0:
            availability.availability_count = remaining
            availability.availability_label = f'AVAILABLE-{remaining:04d}'
        else:
            availability.availability_count = 0
            availability.availability_kind = TrainAvailability.UNAVAILABLE
            # 'REGRET' is the railways' own wording for a closed first class.
            availability.availability_label = (
                'REGRET' if availability.train_class.code == '1A'
                else 'NOT AVAILABLE'
            )
            availability.confirm_chance = 0

    elif kind == TrainAvailability.RAC:
        availability.availability_count += passenger_count
        availability.availability_label = f'RAC {availability.availability_count}'

    elif kind == TrainAvailability.WAITLIST:
        availability.availability_count += passenger_count
        availability.availability_label = f'GNWL {availability.availability_count}'
        # Long waitlists rarely clear.
        availability.confirm_chance = max(85 - availability.availability_count, 4)

    availability.save(update_fields=[
        'availability_count', 'availability_kind',
        'availability_label', 'confirm_chance',
    ])


# ---------------------------------------------------------------------------
# Booking
# ---------------------------------------------------------------------------

def generate_pnr():
    """
    A ten-digit railway PNR.

    The leading digit avoids 0, 1 and 9 so the number never reads as a phone
    number or loses a leading zero when something treats it as an integer.
    """
    first = secrets.choice('2345678')
    rest = ''.join(secrets.choice('0123456789') for _ in range(9))
    return f'{first}{rest}'


def _create_booking_row(data, fare):
    """
    Insert the booking, retrying if the generated PNR already exists.

    Ten digits collide rarely enough that three attempts is plenty, and the
    unique key is what actually decides.
    """
    for _ in range(3):
        try:
            with transaction.atomic():
                return Booking.objects.create(
                    reference=generate_pnr(),
                    mode=Booking.TRAIN,
                    user_id=data.get('userId'),
                    status=Booking.CONFIRMED,
                    contact_email=data['contact']['email'],
                    contact_phone=data['contact']['phone'],
                    total_amount=fare['total'],
                    currency='INR',
                )
        except IntegrityError:
            continue

    raise ClassUnavailable('Could not allocate a PNR. Try again.')


@transaction.atomic
def create_booking(data, rng=None):
    """
    Take payment, take the availability, prepare the chart, issue the ticket -
    one transaction.

    Returns the objects the confirmation needs. Anything raised in here rolls
    the whole thing back, so a failed booking never leaves a class short of
    berths it still holds.
    """
    travel_date = data['date']
    if travel_date < timezone.localdate():
        raise InvalidSelection(
            'That travel date has already passed.',
            detail={'date': travel_date.isoformat()},
        )

    train = get_train(data['trainId'])
    if not train.runs_on_date(travel_date):
        raise InvalidSelection(
            'This train does not run on that day.',
            detail={'date': travel_date.isoformat()},
        )

    train_class = get_class(data['classCode'])
    quota = get_quota(data['quota'])
    passengers = data['passengers']

    availability = get_availability(
        train, train_class, quota, travel_date, lock=True,
    )
    if availability.availability_kind == TrainAvailability.UNAVAILABLE:
        raise ClassUnavailable(detail={'classCode': train_class.code})
    if (
        availability.availability_kind == TrainAvailability.AVAILABLE
        and availability.availability_count < len(passengers)
    ):
        raise ClassUnavailable(
            'That class no longer has enough berths for this many passengers.',
            detail={
                'classCode': train_class.code,
                'available': availability.availability_count,
            },
        )

    station, _, _ = resolve_boarding_station(train, data['boardingStationCode'])

    fare = calculate_fare(availability, len(passengers), data['insured'])
    # Allotment reads the availability as it stands before the sale, so the
    # first RAC passenger on this ticket takes the position now showing.
    allotments = allot(passengers, availability, rng)
    chart_status = (
        CHART_CONFIRMED
        if availability.availability_kind == TrainAvailability.AVAILABLE
        else CHART_PROVISIONAL
    )

    booking = _create_booking_row(data, fare)

    train_booking = TrainBooking.objects.create(
        booking=booking,
        train=train,
        train_class=train_class,
        quota=quota,
        travel_date=travel_date,
        boarding_station=station,
        base_fare=fare['base_fare'],
        quota_surcharge=fare['quota_surcharge'],
        reservation_charge=fare['reservation_charge'],
        insurance=fare['insurance'],
        gst=fare['gst'],
        is_insured=data['insured'],
        chart_status=chart_status,
    )

    TrainPassenger.objects.bulk_create([
        TrainPassenger(
            booking=train_booking,
            full_name=passenger['name'].strip(),
            age=passenger['age'],
            gender=passenger['gender'],
            berth_preference=passenger['berth'],
            allotted_coach=allotment['coach'],
            allotted_berth=allotment['berth'],
            booking_status=allotment['status'],
            sort_order=index,
        )
        for index, (passenger, allotment) in enumerate(zip(passengers, allotments))
    ])

    BookingFareLine.objects.bulk_create([
        line for line in [
            BookingFareLine(
                booking=booking, label='Base fare',
                amount=fare['base_fare'], sort_order=0,
            ),
            BookingFareLine(
                booking=booking, label='Tatkal surcharge',
                amount=fare['quota_surcharge'], sort_order=1,
            ) if fare['quota_surcharge'] else None,
            BookingFareLine(
                booking=booking, label='Reservation charge',
                amount=fare['reservation_charge'], sort_order=2,
            ),
            BookingFareLine(
                booking=booking, label='Travel insurance',
                amount=fare['insurance'], sort_order=3,
            ) if fare['insurance'] else None,
            BookingFareLine(
                booking=booking, label='GST', amount=fare['gst'], sort_order=4,
            ) if fare['gst'] else None,
        ] if line is not None
    ])

    payment = Payment.objects.create(
        booking=booking,
        method=data['paymentMethodId'],
        instrument=data['paymentMethod'],
        amount=fare['total'],
        status=Payment.SUCCESS,
        transaction_ref=f'TXN{secrets.token_hex(8).upper()}',
        paid_at=timezone.now(),
    )

    # The trip and the class option go onto the ticket as they were sold, so
    # both are built before `_take_availability` moves the row on - the
    # traveller's copy should say what they bought, not what is left after.
    class_option = serialise_class_option(availability)
    trip = serialise_trip(
        train,
        _availability_by_train([train.pk], travel_date, quota).get(train.pk, []),
        list(train.boarding_stations.all()),
    )

    _take_availability(availability, len(passengers))

    attach_boarding_time(train_booking, train)

    return (
        booking, train_booking, trip, class_option,
        list(train_booking.passengers.all()), payment,
    )


def get_booking(pnr, user_id):
    """
    Load a booking by its reference, for the account that made it.

    Scoped to `user_id` rather than trusting the reference alone: eight
    characters is short enough to guess, and a ticket carries a name, a phone
    number and an itinerary.
    """
    train_booking = (
        TrainBooking.objects
        .select_related('booking', 'train_class', 'quota', 'boarding_station')
        .filter(
            booking__user_id=user_id,
            booking__reference=pnr.strip(),
        )
        .first()
    )
    if train_booking is None:
        raise BookingNotFound()

    train = get_train(train_booking.train_id, active_only=False)
    train_booking.train = train
    attach_boarding_time(train_booking, train)

    trip = trip_payload(train, train_booking.travel_date, train_booking.quota)

    # The class as it was sold. The availability row has moved on since, so
    # the fare comes off the booking rather than out of the table.
    availability = (
        TrainAvailability.objects
        .select_related('train_class', 'quota')
        .filter(
            train=train, train_class=train_booking.train_class,
            quota=train_booking.quota, travel_date=train_booking.travel_date,
        )
        .first()
    )
    class_option = (
        serialise_class_option(availability) if availability
        else {
            'code': train_booking.train_class.code,
            'label': train_booking.train_class.label,
            'fare': 0,
            'availability': {
                'kind': TrainAvailability.UNAVAILABLE, 'count': 0,
                'label': 'NOT AVAILABLE', 'confirmChance': 0,
            },
        }
    )

    payment = (
        train_booking.booking.payments
        .filter(status=Payment.SUCCESS).order_by('-pk').first()
        or train_booking.booking.payments.order_by('-pk').first()
    )

    return (
        train_booking.booking, train_booking, trip, class_option,
        list(train_booking.passengers.all()), payment,
    )

def list_bookings(user_id):
    """
    Every train booking this account has made, newest first.

    Feeds the account's own ticket list. The related rows this pulls are
    exactly what `serialise_booking_summary` reads, so the list costs one
    query however many tickets come back.
    """
    return (
        TrainBooking.objects
        .select_related(
            'booking', 'train',
            'train__origin_station', 'train__destination_station',
        )
        .filter(booking__user_id=user_id)
        .order_by('-booking__booked_at')
    )


def _release_availability(availability, passenger_count):
    """
    Give berths back to the class this booking sold from.

    The reverse of `_take_availability`, as far as it goes: a class that went
    UNAVAILABLE on the last sale comes back as AVAILABLE with the berths
    restored. An RAC or waitlisted sale lengthened a queue rather than taking
    a berth, and shortening that queue would move everyone behind it up the
    list, so those are left alone - the released berths reach them as the next
    confirmation instead, which is what the railways do as well.
    """
    if availability.availability_kind not in (
        TrainAvailability.AVAILABLE, TrainAvailability.UNAVAILABLE,
    ):
        return

    restored = availability.availability_count + passenger_count
    availability.availability_kind = TrainAvailability.AVAILABLE
    availability.availability_count = restored
    availability.availability_label = f'AVAILABLE-{restored:04d}'
    availability.save(update_fields=[
        'availability_kind', 'availability_count', 'availability_label',
    ])


@transaction.atomic
def cancel_booking(user_id, reference):
    """
    Cancel a train ticket and return its berths to the class it sold from.

    The passenger rows stay: they are the chart, and a cancelled ticket still
    has to show who was on it. What moves is the availability row, which is
    where a berth is actually held.
    """
    train_booking = (
        TrainBooking.objects
        .select_related(
            'booking', 'train', 'train_class', 'quota',
            'train__origin_station', 'train__destination_station',
        )
        .filter(booking__reference=reference, booking__user_id=user_id)
        .first()
    )
    if train_booking is None:
        raise BookingNotFound()

    ensure_cancellable(train_booking.booking, train_booking.travel_date)

    availability = get_availability(
        train_booking.train, train_booking.train_class,
        train_booking.quota, train_booking.travel_date, lock=True,
    )
    _release_availability(availability, train_booking.passengers.count())

    mark_cancelled(train_booking.booking)

    return train_booking
