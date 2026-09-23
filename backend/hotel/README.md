# Hotel API

The booking backend for the stays flow in `frontend/src/pages/hotel`. Every
travel mode has one; this is the hotel module.

Everything it returns matches `frontend/src/types/hotel.types.ts` exactly —
camelCase keys, string ids, rooms nested inside their property. `frontend/src/services/hotel.services.ts`
calls it directly.

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

`migrate` creates nothing for the hotel tables. Every model in this app is
`managed = False` and maps onto a table `schema.sql` already made, so the CHECK
constraints and composite unique keys stay exactly as written. **A schema
change goes into `schema.sql`, gets applied to MySQL, and is then mirrored in
`models.py`** — not the other way round.

### This app owns its models

`hotel/models.py` maps the six tables every mode shares (`city`, `app_user`,
`offer`, `booking`, `booking_fare_line`, `payment`) under its own classes, as
the bus, train and plane apps do. No module imports another, so any one of them
can be changed or dropped on its own.

That works because they are all unmanaged: Django's `models.E028`
duplicate-table check only collects managed models, nothing tries to create a
table twice, and each app's foreign keys stay inside its own app so no reverse
accessor collides. **Keep every model in this app unmanaged.** The same
isolation applies to errors: `HotelAPIView` names this module's own exception
handler instead of reading `settings.EXCEPTION_HANDLER`.

## Endpoints

All under `/api/hotel/`.

| | | Backs |
|---|---|---|
| `GET` | `amenities/?city=` | the `HOTEL_AMENITIES` constant |
| `GET` | `stays/?city=&checkIn=&checkOut=&guests=` | `searchStays(query)` |
| `GET` | `stays/<id>/?checkIn=&checkOut=` | — (reload / deep link) |
| `POST` | `quote/` | `calculateStayFare(...)` |
| `POST` | `bookings/` | `confirmStay(input)` |
| `GET` | `bookings/<bookingId>/` | — (voucher lookup) |

### `GET stays/`

`city` is matched case-insensitively against `city.name`. Properties come back
best-reviewed first, with their room types and rate plans nested.

**`roomsLeft` is the tightest night of the stay.** A room free on three nights
of four cannot take a four-night booking, so the number reported is the
smallest count across the run. A night with **no `room_inventory` row** counts
as nothing available, not as unlimited — the safe reading, and the one that
stops a stay being sold on a date nobody has opened yet. That means **inventory
has to be seeded per room type per night** or search returns nothing.

A property with no room free for every night is left out entirely; a card that
cannot be clicked is worse than no card. `fromPricePerNight` quotes the
cheapest plan that can actually be booked.

Rooms too small for the party are **still listed**. `StepRooms` already marks
them (`room.maxGuests * rooms < guests`) rather than hiding them, so the API
leaves that call to the UI.

Filtering and sorting stay on the client — `pages/hotel/filters.ts` already
does both.

### `GET amenities/`

Amenity names for the filter sidebar, replacing the `HOTEL_AMENITIES` constant.
With `?city=`, only the amenities properties in that city actually offer, so
the sidebar never shows a facet that would match nothing.

### `POST quote/`

```json
{ "roomTypeId": 12, "ratePlanCode": "flexible",
  "checkIn": "2026-10-04", "checkOut": "2026-10-07", "rooms": 2 }
```

Returns a `HotelFareBreakdown` plus `roomsLeft` and `bookable`. Pricing:

| | |
|---|---|
| Room total | `rate_plan.price_per_night` × nights × rooms |
| Taxes | 12% below ₹7,500 a night, 18% at or above — whole rupees |
| Property fee | ₹99 per night per room |

**The tax slab follows the nightly rate, not the total.** Three nights at
₹4,000 is ₹12,000 in total, well over the threshold, but the band is still 12%.

Nights are the nights slept: arriving Monday and leaving Wednesday is two
nights, and inventory is held from check-in up to but not including check-out.

### `POST bookings/`

```json
{
  "propertyId": 7,
  "roomTypeId": 12,
  "ratePlanCode": "room-only",
  "checkIn": "2026-10-04",
  "checkOut": "2026-10-07",
  "rooms": 1,
  "guests": 2,
  "guest": {
    "name": "A Guest", "email": "guest@example.com", "phone": "9876543210",
    "requests": "High floor if possible", "arrival": "After 18:00"
  },
  "paymentMethod": "HDFC Bank",
  "paymentMethodId": "netbanking",
  "userId": null
}
```

Returns `201` with a `HotelBookingConfirmation` — the whole voucher, property,
room and rate plan embedded, nothing left to fetch. It also carries `status`,
which `hotel.types.ts` does not have yet.

Differences from `ConfirmStayInput`, which the front end will need to map:

- `property`, `room` and `ratePlan` go out as **ids and a code**, not objects.
  The server re-reads them; a client cannot be trusted on price.
- `guests` is sent explicitly. `ConfirmStayInput` carries it inside `query`,
  which is otherwise redundant — the property already knows its city, and the
  response echoes a `query` back.
- `paymentMethodId` says which of the four methods the label belongs to.
  `payment.method` only admits `upi`, `card`, `netbanking` or `wallet`, and
  the label goes in `payment.instrument`. `PaymentStep` passes both.
- `userId` is optional. Leaving it out is a guest checkout.

The guest details are split the way the schema splits them: the name becomes
the lead `hotel_guest` row, email and phone go on `booking`, and `requests` and
`arrival` become `special_requests` and `arrival_window` on `hotel_booking`.

**A stay is all or nothing.** Every night is verified before any is
decremented, so a booking that cannot cover the whole run takes nothing —
a guest is never left holding three nights of four. The inventory rows are
locked with `SELECT ... FOR UPDATE` for the length of the transaction, so two
guests taking the last room are serialised rather than both passing the check.

### `GET bookings/<bookingId>/`

Same `HotelBookingConfirmation`. The id is case-insensitive. The fare comes off
the booking, not out of the rate plan, so a voucher keeps showing what was paid
after rates move. A voucher still reads back after its property is delisted.

## Errors

One envelope, whatever failed:

```json
{ "error": { "code": "rooms_unavailable", "message": "...",
             "detail": { "nights": ["2026-10-05"], "roomsRequested": 3 } } }
```

| Code | Status | |
|---|---|---|
| `invalid` | 400 | Field validation; `detail` is the per-field errors |
| `invalid_selection` | 400 | Room not at this property, plan not on this room, party too large for the rooms, check-in past |
| `rooms_unavailable` | 409 | Rooms went while the guest was deciding, or a night was never open. `detail.nights` names which |
| `property_not_found` | 404 | |
| `booking_not_found` | 404 | |

409 rather than 400 on lost rooms: the request was well formed, the inventory
moved underneath it. That is the one the room step should re-query on.

## Layout

| | |
|---|---|
| `models.py` | Tables, all `managed = False` |
| `serializers.py` | DRF serializers validate input; `serialise_*` functions shape output |
| `services.py` | Every business rule — search, pricing, the booking transaction |
| `views.py` | Validate, call one service function, render. Nothing else |
| `exceptions.py` | The error types and the handler that gives them one shape |

## Two things worth knowing

**`imageAccent` is invented.** `Property.imageAccent` is a Tailwind gradient
standing in for a photograph, and `property` has no column for it — the schema
stores no imagery at all. The API picks from a fixed list by property id, which
keeps a stay looking the same on every request and across reloads where a
random choice would not. When real photographs arrive they belong in a new
table, and `IMAGE_ACCENTS` in `serializers.py` goes away.

**There is no cancellation endpoint**, even though `rate_plan.free_cancellation`
exists and the UI shows it. Cancelling means putting rooms back on every night
of the stay and deciding whether the fee follows the plan's terms — a policy
decision rather than something to guess at.

## Tests

```bash
myvenv/Scripts/python manage.py test hotel
```

43 tests covering search and nested rooms, `roomsLeft` across a multi-night
stay, missing inventory rows, the tax slab on both sides of ₹7,500, the
all-or-nothing hold, party size against room capacity, cross-property and
cross-room rejections, and voucher lookup.

They run against SQLite, building the unmanaged tables with the schema editor,
so they need no MySQL server — the point is to pin behaviour, not storage. What
they therefore do **not** exercise is the MySQL side: the CHECK constraints
exist only in `schema.sql`, so the date and room-count tests prove this
module's own rules, not the constraints behind them.
