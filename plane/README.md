# Plane API

The booking backend for the flight flow in `frontend/src/pages/plane`. Every
travel mode has one; this is the plane module.

Everything it returns matches `frontend/src/types/plane.types.ts` exactly —
camelCase keys, airports and seats identified by code, the cabin grid built
from the seat rows. Wiring the front end up means replacing the bodies in
`frontend/src/services/plane.services.ts` with `fetch` calls; the signatures do
not change.

## Running it

MySQL has to be up with `schema.sql` already applied.

```bash
cd backend
myvenv/Scripts/python -m pip install -r requirements.txt

cp .env.example .env          # then set DB_PASSWORD in it

myvenv/Scripts/python manage.py migrate       # Django's own admin/auth tables
myvenv/Scripts/python manage.py runserver
```

`settings.py` reads `backend/.env` at startup; a variable already set in the
real environment wins over the file. `.env` is gitignored - the password
belongs there, not in `.env.example`.

`migrate` creates nothing for the flight tables. Every model in this app is
`managed = False` and maps onto a table `schema.sql` already made, so the CHECK
constraints and composite unique keys stay exactly as written. **A schema
change goes into `schema.sql`, gets applied to MySQL, and is then mirrored in
`models.py`** — not the other way round.

### This app owns its models

`plane/models.py` maps the six tables every mode shares (`city`, `app_user`,
`offer`, `booking`, `booking_fare_line`, `payment`) under its own classes, as
the bus and train apps do. No module imports another, so any one of them can be
changed or dropped on its own.

That works because they are all unmanaged: Django's `models.E028`
duplicate-table check only collects managed models, nothing tries to create a
table twice, and each app's foreign keys stay inside its own app so no reverse
accessor collides. **Keep every model in this app unmanaged.** The same
isolation applies to errors: `PlaneAPIView` names this module's own exception
handler instead of reading `settings.EXCEPTION_HANDLER`.

## Endpoints

All under `/api/plane/`.

| | | Backs |
|---|---|---|
| `GET` | `addons/` | the `ADD_ONS` constant |
| `GET` | `flights/?from=&to=&date=&travellers=` | `searchFlights(query)` |
| `GET` | `flights/<id>/?date=` | — (reload / deep link) |
| `GET` | `flights/<id>/seats/?date=` | `fetchCabinLayout(trip)` |
| `POST` | `quote/` | `calculatePlaneFare(...)` |
| `POST` | `bookings/` | `confirmFlightBooking(input)` |
| `GET` | `bookings/<reference>/` | — (ticket lookup) |

### `GET flights/`

`from` and `to` are matched case-insensitively against the airport's **city
name, IATA code or airport name** — the home page sends a city, but a traveller
may well type any of the three.

`travellers` is validated and echoed back on the confirmation's `query`, but
does **not** narrow the results: an airline still lists a full flight, and the
card says how few seats are left. Whether a party fits is settled at booking.

`seatsLeft` is per date. `stops` is empty for a non-stop flight — there is no
separate non-stop flag, which is how `describeStops` already reads it. `fares`
comes back cheapest first.

Filtering and sorting stay on the client — `pages/plane/filters.ts` already
does both.

### `GET flights/<id>/seats/`

Returns a `CabinLayout`. `columns` is the seat-letter ruler with `null` where
the aisle runs, **derived from the data**: an aisle is the gap between two
adjacent columns that are both marked `is_aisle`, so a 3-3 cabin comes out as
`A B C — D E F` and a 2-2 as `A B — C D`, without the layout being described
anywhere.

`occupied` is per date — a seat sold for Tuesday is free again on Wednesday.
A row is an exit row when its seats say so.

### `GET addons/`

The add-ons on sale, replacing the `ADD_ONS` constant. Prices are charged per
traveller and live in `flight_addon`, so this is where they are published; a
withdrawn add-on (`is_active = 0`) is not listed and is refused if booked.

### `POST quote/`

```json
{ "flightId": 12, "date": "2026-10-04", "fareBrandCode": "saver",
  "travellerCount": 2, "seatIds": ["1A", "1B"], "addOns": ["meal"] }
```

Returns a `PlaneFareBreakdown` plus `unavailableSeatIds`. Pricing:

| | |
|---|---|
| Base fare | `fare_brand.price` × travellers |
| Taxes | 12% of base, whole rupees, **plus** ₹236 a traveller |
| Seats | the seats actually assigned |
| Add-ons | each add-on's price × travellers |
| Convenience fee | ₹149 a traveller |

**Seat charges apply on every fare brand.** `FareBrand.freeSeat` is advisory in
the current front end — `StepSeats` shows a "seats are chargeable on Saver"
notice but still adds every chosen seat's price to `seatTotal` — and the server
matches that rather than quietly pricing differently. If seats really should be
free on Comfort and Flexi, that is a one-line change in
`services.calculate_fare` plus the matching change in the front end, and worth
doing on both sides at once.

### `POST bookings/`

```json
{
  "flightId": 12,
  "date": "2026-10-04",
  "fareBrandCode": "saver",
  "travellers": [
    { "id": "t1", "type": "adult", "title": "Mr",
      "firstName": "A", "lastName": "Rider" },
    { "id": "t2", "type": "infant", "title": "Master",
      "firstName": "B", "lastName": "Rider", "dateOfBirth": "2025-06-01" }
  ],
  "seatByTraveller": { "t1": "12A" },
  "addOns": ["meal"],
  "contact": { "email": "rider@example.com", "phone": "9876543210" },
  "paymentMethod": "HDFC Bank",
  "paymentMethodId": "netbanking",
  "userId": null
}
```

Returns `201` with a `PlaneBookingConfirmation` — the whole ticket, trip, fare
brand and ticketed travellers embedded, nothing left to fetch. It also carries
`status`, which `plane.types.ts` does not have yet.

Differences from `ConfirmFlightBookingInput`, which the front end will need to
map:

- `trip`, `fareBrand` and the seats go out as an **id and codes**, not objects.
- `seatTotal` is **accepted and ignored**. The server prices the seats it
  actually assigns; a client cannot be trusted on fare.
- `query` is not sent. The flight already knows its airports, and the response
  echoes a `query` back with the city names the search box holds.
- Traveller `id` is the front end's own key (`t1`, `t2`) and is only used to
  match `seatByTraveller`. It is not stored — each traveller comes back with
  its row's id.
- `paymentMethodId` says which of the four methods the label belongs to.
  `payment.method` only admits `upi`, `card`, `netbanking` or `wallet`, and
  the label goes in `payment.instrument`. `PaymentStep` passes both.
- `userId` is optional. Leaving it out is a guest checkout.

Rules enforced before anything is written: an infant never gets a seat, anyone
who is not an adult needs a date of birth, two travellers cannot share a seat,
and a seat cannot be given to a traveller who was not sent. Each traveller gets
a 13-digit e-ticket prefixed with the carrier code, e.g. `6E 123-0123456789`.

**A caution about seat locking.** Seats are held with `SELECT ... FOR UPDATE`
for the length of the transaction. Unlike the bus schema, `flight_traveller`
carries **no unique key over (seat, date)** — the travel date lives on the
parent `flight_booking`, which a single-table constraint cannot reach. Those
locks are therefore the only thing preventing a double sale, not a second line
of defence. Adding a denormalised `travel_date` to `flight_traveller` with a
unique key over `(seat_id, travel_date)` would close that, and is a schema
change rather than something to patch around in code.

### `GET bookings/<reference>/`

Same `PlaneBookingConfirmation`. The reference is case-insensitive. The fare
comes off the booking, not out of the fare brand, so a ticket keeps showing
what was paid after prices move. A ticket still reads back after its flight is
withdrawn.

## Errors

One envelope, whatever failed:

```json
{ "error": { "code": "seat_unavailable", "message": "...", "detail": { "seatIds": ["12A"] } } }
```

| Code | Status | |
|---|---|---|
| `invalid` | 400 | Field validation; `detail` is the per-field errors |
| `invalid_selection` | 400 | Fare brand not on this flight, seat not on this aircraft, unknown or withdrawn add-on, date past |
| `seat_unavailable` | 409 | Taken while the traveller was deciding |
| `flight_not_found` | 404 | |
| `booking_not_found` | 404 | |

409 rather than 400 on a lost seat: the request was well formed, the cabin
moved underneath it. That is the one the seat map should re-query on.

## Layout

| | |
|---|---|
| `models.py` | Tables, all `managed = False` |
| `serializers.py` | DRF serializers validate input; `serialise_*` functions shape output |
| `services.py` | Every business rule — search, pricing, the booking transaction |
| `views.py` | Validate, call one service function, render. Nothing else |
| `exceptions.py` | The error types and the handler that gives them one shape |

## Not done

**There is no cancellation endpoint.** A `flight_traveller` row holding a seat
*is* the reservation, so releasing one means clearing the seat — which needs a
decision about whether the traveller row survives a cancelled ticket.

**Nothing prices a return leg.** The schema models one flight per booking, and
the front end's wizard is one-way.

## Tests

```bash
myvenv/Scripts/python manage.py test plane
```

48 tests covering search by city, IATA code and airport name, stops and fare
brands, seat counts by date, the derived aisle on 3-3 and 2-2 cabins, the fare
formula, add-ons charged per traveller, the booking transaction, infant and
date-of-birth rules, double-booking, and ticket lookup.

They run against SQLite, building the unmanaged tables with the schema editor,
so they need no MySQL server — the point is to pin behaviour, not storage. What
they therefore do **not** exercise is the MySQL side: the CHECK constraints
exist only in `schema.sql`, so the infant and date-of-birth tests prove the
serializer's own rules, not the constraints behind them.
