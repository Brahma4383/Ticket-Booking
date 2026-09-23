# Cab API

The booking backend for the cabs flow in `frontend/src/pages/cab`. Every
travel mode has one; this is the cab module.

Everything it returns matches `frontend/src/types/cab.types.ts` exactly —
camelCase keys, categories identified by code. `frontend/src/services/cab.services.ts` calls it
directly.

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

`migrate` creates nothing for the cab tables. Every model in this app is
`managed = False` and maps onto a table `schema.sql` already made, so the CHECK
constraints and composite unique keys stay exactly as written. **A schema
change goes into `schema.sql`, gets applied to MySQL, and is then mirrored in
`models.py`** — not the other way round.

`schema.sql` already seeds `cab_category` and `cab_extra`. It does **not** seed
`cab_rate_card`, and nothing is bookable without one — see below.

### This app owns its models

`cab/models.py` maps the six tables every mode shares (`city`, `app_user`,
`offer`, `booking`, `booking_fare_line`, `payment`) under its own classes, as
the other four apps do. No module imports another, so any one of them can be
changed or dropped on its own.

That works because they are all unmanaged: Django's `models.E028`
duplicate-table check only collects managed models, nothing tries to create a
table twice, and each app's foreign keys stay inside its own app so no reverse
accessor collides. **Keep every model in this app unmanaged.** The same
isolation applies to errors: `CabAPIView` names this module's own exception
handler instead of reading `settings.EXCEPTION_HANDLER`.

One naming quirk: `cab_category.models` is mapped as `vehicle_models` with an
explicit `db_column`. A Django field literally called `models` would rebind the
`models` module inside the class body and break every field declared after it.

## Endpoints

All under `/api/cab/`.

| | | Backs |
|---|---|---|
| `GET` | `extras/` | the `CAB_EXTRAS` constant |
| `GET` | `estimate/?pickup=&drop=&date=&time=` | `estimateTrip(query)` |
| `GET` | `cabs/?pickup=&drop=&date=&time=` | `searchCabs(query)` |
| `POST` | `quote/` | `calculateCabFare(...)` |
| `POST` | `bookings/` | `confirmCab(input)` |
| `GET` | `bookings/<bookingId>/` | — (voucher lookup) |

### `GET estimate/`

Distance, duration, kind of journey, and whether it runs overnight.
`estimateTrip` is synchronous in the front end's mock because it invents the
distance locally. **The server owns it instead** — every number here moves the
fare, so a client cannot be the one deciding them.

The rules, mirroring the mock:

- an **airport** at either end (`airport|terminal|t1|t2|t3`) is an airport
  transfer, whatever else is true
- the **same place at both ends** is a local trip
- anything else is **outstation**
- a pickup between 22:00 and 06:00 is a **night trip**

**About the distance.** There is no routing engine here and no distance table
in the schema, so the distance is synthesised from the two addresses with an
FNV-1a hash — the same function the front end's mock uses. It is
*deterministic*: the same pickup and drop always estimate the same trip, so a
quote does not change between the results page and the payment step, and a
reload does not reprice the journey.

This is the seam a real distance service plugs into. Replace `estimate_trip` in
`services.py` with a call to one and nothing else changes — every caller
already treats the estimate as something the server decides.

### `GET cabs/`

Every cab type priced for this journey, **cheapest first**. A category with no
rate card in force is left out rather than quoted at zero: it is not on sale
for that journey.

`inclusions`, `exclusions` and `etaMinutes` have no columns in the schema and
are derived — the first two from the rate card and trip type, the ETA from the
category so a cab type always quotes the same wait. Keeping that wording here
rather than in the front end means it changes in one place.

### `GET extras/`

The extras on sale, replacing the `CAB_EXTRAS` constant. Charged **once for the
trip**, not per passenger. A withdrawn extra (`is_active = 0`) is not listed
and is refused if booked.

### `POST quote/`

```json
{ "categoryCode": "sedan", "pickup": "Mumbai", "drop": "Pune",
  "date": "2026-10-04", "time": "09:00", "extras": ["carrier"] }
```

Returns a `CabFareBreakdown` plus the `estimate` it was built on. Pricing:

| | From |
|---|---|
| Base fare | `included_km × per_km_rate`, rounded to tens |
| Included km | the greater of the trip distance and `minimum_km` |
| Extras | `cab_extra.price`, once each |
| Driver allowance | `rate_card.driver_allowance`, **outstation over 250 km only** |
| Tolls and state tax | distance × ₹2.40, rounded to tens, **outstation only** |
| Night charge | `rate_card.night_charge`, when the pickup is 22:00–06:00 |
| GST | 5% of everything above |
| Pay now | 20% of the total, rounded to tens |
| Pay to driver | the rest |

The rate card owns the per-km rate, the minimum, the extra-km rate, the
allowance and the night charge. What stays in `services.py` is the rules for
*when* the allowance and the toll estimate apply, plus the tax and advance
rates — none of which vary by category.

Rounding is **half away from zero**, matching JavaScript's `Math.round`. Python's
built-in `round` uses banker's rounding and would disagree by a rupee; the
tests use a `js_round` helper for exactly this reason.

### `POST bookings/`

```json
{
  "categoryCode": "sedan",
  "date": "2026-10-04",
  "time": "09:00",
  "details": {
    "pickupAddress": "Mumbai", "dropAddress": "Pune",
    "name": "A Passenger", "phone": "9876543210",
    "email": "rider@example.com"
  },
  "extras": ["carrier"],
  "paymentMethod": "HDFC Bank",
  "paymentMethodId": "netbanking",
  "userId": null
}
```

Returns `201` with a `CabBookingConfirmation` — the whole voucher, option,
estimate and fare embedded, nothing left to fetch. It also carries `status` and
`driver`, which `cab.types.ts` does not have yet.

Differences from `ConfirmCabInput`, which the front end will need to map:

- `option` goes out as a **category code**, not the object.
- **`estimate` is not accepted at all.** Distance, duration, trip type and the
  night flag are worked out server-side from the addresses and the pickup time,
  because every one of them moves the fare. A client cannot understate the
  distance to pay less.
- `query` is not sent — the addresses in `details` are the trip, and the
  response echoes a `query` back.
- `paymentMethodId` says which of the four methods the label belongs to.
  `payment.method` only admits `upi`, `card`, `netbanking` or `wallet`, and
  the label goes in `payment.instrument`. `PaymentStep` passes both.
- `userId` is optional. Leaving it out is a guest checkout.

**Only the advance is charged.** The `payment` row is `pay_now`, not the total
— the driver collects the balance. `booking.total_amount` is still the whole
fare, so the two deliberately differ.

**There is no inventory to hold.** A cab booking is a dispatch request, not a
seat: nothing is taken from a pool and nothing can be double-sold, which is why
this module has no locking and no `*_unavailable` conflict on seats. The
vehicle is assigned later, which is why `driver_name`, `driver_phone` and
`vehicle_number` start NULL.

### `GET bookings/<bookingId>/`

Same `CabBookingConfirmation`. The id is case-insensitive. The fare comes off
the booking, not the rate card, so a voucher keeps showing what was quoted
after rates move.

The response carries a `driver` object beyond the TS type — `null` until a
vehicle is assigned, then `{name, phone, vehicleNumber}`. The front end shows
`ARRIVAL_BUFFER_NOTE` ("details are shared two hours before pickup"); this lets
the voucher actually poll for them. Until there is a dispatch system, they are
filled in through the admin, which is the one part of a cab booking left
editable there.

## Errors

One envelope, whatever failed:

```json
{ "error": { "code": "no_rate_card", "message": "...",
             "detail": { "categoryCode": "hatchback", "tripType": "airport" } } }
```

| Code | Status | |
|---|---|---|
| `invalid` | 400 | Field validation; `detail` is the per-field errors |
| `invalid_selection` | 400 | Unknown or withdrawn extra, duplicate extra, pickup in the past |
| `no_rate_card` | 409 | Nothing priced for that category and journey on that date |
| `category_not_found` | 404 | Unknown or withdrawn cab type |
| `booking_not_found` | 404 | |

`no_rate_card` is 409 rather than 404 on purpose: the cab exists and the route
is fine, but no card is in force to quote from — an operational gap, not a bad
request.

## Layout

| | |
|---|---|
| `models.py` | Tables, all `managed = False` |
| `serializers.py` | DRF serializers validate input; `serialise_*` functions shape output |
| `services.py` | Every business rule — estimation, pricing, the booking transaction |
| `views.py` | Validate, call one service function, render. Nothing else |
| `exceptions.py` | The error types and the handler that gives them one shape |

## Two things to know before it works

**Rate cards have to be loaded.** `schema.sql` seeds the four categories and
three extras but no `cab_rate_card` rows, and a category with no card in force
is not offered. Search returns `[]` until at least one card exists per
(category, trip type) you mean to sell. Load them through the admin, under the
category.

**Nothing prices a return leg or a round trip.** `cab_booking` records one
pickup and one drop, and `TRIP_TYPE_LABELS` in the front end calls outstation
"one way". A round trip would need a second date on the booking and a different
rate card shape.

## Tests

```bash
myvenv/Scripts/python manage.py test cab
```

46 tests covering trip classification (airport words, same-place, night
window), estimate stability, rate-card selection including expiry and
overlapping cards, the minimum-km floor, the full fare formula with and without
allowance, tolls and night charge, the advance split, the booking transaction,
server-side estimation overriding anything a client sends, and voucher lookup.

They run against SQLite, building the unmanaged tables with the schema editor,
so they need no MySQL server — the point is to pin behaviour, not storage. What
they therefore do **not** exercise is the MySQL side: the CHECK constraints
exist only in `schema.sql`, so the trip-type and extra-code tests prove this
module's own rules, not the constraints behind them.
