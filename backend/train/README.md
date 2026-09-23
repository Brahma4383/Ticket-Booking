# Train API

The booking backend for the rail flow in `frontend/src/pages/train`. Every
travel mode has one; this is the train module.

Everything it returns matches `frontend/src/types/train.types.ts` exactly —
camelCase keys, stations identified by code, the same four availability kinds.
Wiring the front end up means replacing the bodies in
`frontend/src/services/train.services.ts` with `fetch` calls; the signatures do
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

`migrate` creates nothing for the train tables. Every model in this app is
`managed = False` and maps onto a table `schema.sql` already made, so the CHECK
constraints and composite unique keys stay exactly as written. **A schema
change goes into `schema.sql`, gets applied to MySQL, and is then mirrored in
`models.py`** — not the other way round.

### This app owns its models

`train/models.py` maps the six tables every mode shares (`city`, `app_user`,
`offer`, `booking`, `booking_fare_line`, `payment`) under its own classes. The
bus app maps the same tables under its own. Neither imports from the other, so
either module can be changed or dropped without touching the other.

That works because both sides are unmanaged: Django's `models.E028`
duplicate-table check only collects managed models, nothing tries to create a
table twice, and each app's foreign keys stay inside its own app so no reverse
accessor collides. **Keep every model in this app unmanaged** — a managed one
over a shared table would trip the check and let `migrate` rewrite a table
`schema.sql` owns.

The same isolation applies to errors: `TrainAPIView` names this module's own
exception handler instead of reading `settings.EXCEPTION_HANDLER`, so the train
error envelope does not depend on a global another app set.

## Endpoints

All under `/api/train/`.

| | | Backs |
|---|---|---|
| `GET` | `quotas/` | — (quota labels, notes and premium) |
| `GET` | `trains/?from=&to=&date=&quota=` | `searchTrains(query)` |
| `GET` | `trains/<id>/?date=&quota=` | — (reload / deep link) |
| `POST` | `quote/` | `calculateTrainFare(...)` |
| `POST` | `bookings/` | `confirmTrainBooking(input)` |
| `GET` | `bookings/<pnr>/` | — (ticket lookup) |

### `GET trains/`

`from` and `to` are matched case-insensitively against the station's **city
name, station name or station code** — the home page sends a city, but a
traveller may well type any of the three.

`quota` is an extra on top of `TrainSearchQuery`, defaulting to `general` —
the same quota the wizard starts on. Fares and availability are stored per
quota, so one has to be chosen to show a class list at all. When the review
step switches quota, re-query with the new one.

Two things narrow the list beyond the route:

- a train is only offered on a day it actually runs (`runsOn`, Monday first)
- a train with no availability rows for that date and quota is left out
  entirely — it has nothing to sell, and listing it with an empty class list
  would be worse

`classes` is exactly the set of availability rows found, ordered by
`train_class.sort_order`. `boardingStations` always leads with the origin,
which is not stored in `train_boarding_station` because it is always offered.

Filtering and sorting stay on the client — `pages/train/filters.ts` already
does both.

### `GET quotas/`

The bookable quotas with `id`, `label`, `note` and `surchargePercent`. The
Tatkal premium is a column (`train_quota.surcharge_percent`), not a constant,
so this is where it is published. A rate the client hard-codes is one that can
silently stop matching what is charged.

### `POST quote/`

```json
{ "trainId": 12, "date": "2026-09-25", "classCode": "3A",
  "quota": "tatkal", "passengerCount": 2, "insured": true }
```

Returns a `TrainFareBreakdown` plus the live `availability`. Pricing:

| | |
|---|---|
| Base fare | `train_availability.fare` × passengers |
| Quota surcharge | base × `train_quota.surcharge_percent`, whole rupees |
| Reservation charge | `train_class.reservation_charge` × passengers |
| Insurance | ₹0.45 per passenger, when taken |
| GST | 5% of (base + surcharge + reservation), **air-conditioned classes only** |

GST is charged before insurance, which is not a taxable supply here. The front
end computes the same figures locally so the summary updates as passengers are
added; this is the authoritative version.

### `POST bookings/`

```json
{
  "trainId": 12,
  "date": "2026-09-25",
  "classCode": "3A",
  "quota": "general",
  "boardingStationCode": "CSTM",
  "passengers": [
    { "name": "A Rider", "age": "34", "gender": "male", "berth": "lower" }
  ],
  "contact": { "email": "rider@example.com", "phone": "9876543210" },
  "paymentMethod": "HDFC Bank",
  "paymentMethodId": "netbanking",
  "insured": true,
  "userId": null
}
```

Returns `201` with a `TrainBookingConfirmation` — the whole ticket, trip,
class option and allotted passengers embedded, nothing left to fetch. It also
carries `status`, which `train.types.ts` does not have yet.

Differences from `ConfirmTrainBookingInput`, which the front end will need to
map:

- `trip`, `classOption` and `boardingStation` go out as an **id and codes**,
  not objects. The server re-reads them; a client cannot be trusted on fare.
- `query` is not sent. The train already knows its stations, and the response
  echoes a `query` back.
- `passengers` carry no `id` on the way in — the front end's `p1`, `p2` are
  local keys. Each comes back with its row's id.
- `paymentMethodId` says which of the four methods the label belongs to.
  `payment.method` only admits `upi`, `card`, `netbanking` or `wallet`, and
  the label goes in `payment.instrument`. `PaymentStep` passes both.
- `userId` is optional. Leaving it out is a guest checkout.

The availability row is held with `SELECT ... FOR UPDATE OF` for the length of
the transaction, so two people buying the last berths in a class are serialised
rather than both passing the check. A booking that fails anywhere rolls back
whole.

**Chart preparation.** There is no seat map: the railways allot on
confirmation, which is why the berth asked for and the one given can differ. A
confirmed class allots a coach and berth (`B3 / 42 / Lower`, status `CNF`); RAC
and waitlisted tickets keep a queue position instead (`RAC 7`, `WL 12`) and are
allotted nothing. Requesting a berth is honoured in the text where the class is
confirmed, and ignored otherwise.

**The sale moves the availability.** A confirmed sale takes berths off the
count and closes the class when they run out (`REGRET` for 1A, `NOT AVAILABLE`
otherwise); an RAC or waitlisted sale lengthens the queue behind it and
re-labels it the way the railways print it. The ticket embeds the availability
**as it was sold**, not what is left after.

### `GET bookings/<pnr>/`

Same `TrainBookingConfirmation`. The fare comes off the booking, not out of the
availability table, so a ticket keeps showing what was paid after the fare
moves. A ticket still reads back after its train is withdrawn.

## Errors

One envelope, whatever failed:

```json
{ "error": { "code": "class_unavailable", "message": "...", "detail": { "available": 1 } } }
```

| Code | Status | |
|---|---|---|
| `invalid` | 400 | Field validation; `detail` is the per-field errors |
| `invalid_selection` | 400 | Unknown class or quota, class not sold on this train, station off-route, date past or a day the train does not run |
| `class_unavailable` | 409 | Class closed, or short of berths, while the traveller was deciding |
| `train_not_found` | 404 | |
| `booking_not_found` | 404 | |

409 rather than 400 on a lost class: the request was well formed, the
availability moved underneath it. That is the one the results page should
re-query on.

## Layout

| | |
|---|---|
| `models.py` | Tables, all `managed = False` |
| `serializers.py` | DRF serializers validate input; `serialise_*` functions shape output |
| `services.py` | Every business rule — search, pricing, chart allotment, the booking transaction |
| `views.py` | Validate, call one service function, render. Nothing else |
| `exceptions.py` | The error types and the handler that gives them one shape |

## Not done

**There is no cancellation endpoint**, and no waitlist movement. A cancelled
ticket should put its berths back on the count and pull the RAC and waitlist
queues forward, which is a decision about how far to model the railways'
behaviour rather than something to guess at.

## Tests

```bash
myvenv/Scripts/python manage.py test train
```

45 tests covering search by city, station name and code, running days, quota
selection, the fare formula across AC, non-AC and Tatkal, chart allotment for
confirmed, RAC and waitlisted classes, the booking transaction, availability
movement, and ticket lookup.

They run against SQLite, building the unmanaged tables with the schema editor,
so they need no MySQL server — the point is to pin behaviour, not storage. What
they therefore do **not** exercise is the MySQL side: the CHECK constraints and
`uq_train_availability` exist only in `schema.sql`, so the "class ran out" test
proves the service layer's own check, not the constraint behind it.
