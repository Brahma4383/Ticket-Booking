# SuryaBooker

[![CI](https://github.com/Brahma4383/Ticket-Booking/actions/workflows/ci.yml/badge.svg)](https://github.com/Brahma4383/Ticket-Booking/actions/workflows/ci.yml)

A travel booking site: buses, trains, flights, stays and cabs. A React front
end, a Django REST API, and MySQL.

```
frontend/        Vite + React + Tailwind. Talks only to the API.
backend/         Django + DRF. One app per travel mode.
schema.sql       The MySQL schema. The source of truth for every table.
.github/         CI workflow, Dependabot, issue and PR templates.
CONTRIBUTING.md  Branching, commits, PR flow, repo settings.
SECURITY.md      How to report a vulnerability.
```

## How the three fit together

`schema.sql` owns the database. The Django models are all `managed = False`
and map onto tables it already made, so `migrate` never touches them — it only
creates Django's own admin, auth and session tables. **A schema change goes
into `schema.sql`, is applied to MySQL, and is then mirrored in the models**,
not the other way round.

Each travel mode is a self-contained Django app — `bus`, `train`, `plane`,
`hotel`, `cab` — with its own models, services, views, errors, tests and
README. No module imports another. They each map the six shared tables
(`city`, `app_user`, `offer`, `booking`, `booking_fare_line`, `payment`) under
their own model classes, which is legal precisely because every model is
unmanaged. A sixth app, `accounts`, owns sign-in and is the only one that
writes to `app_user`.

**Booking requires an account; browsing does not.** Search, seat maps and
quotes answer an anonymous request, so a traveller can get all the way to the
payment step before signing in — and that step asks rather than rejects. The
API enforces it either way: `POST .../bookings/` answers 401 without a token.
See [backend/accounts/README.md](backend/accounts/README.md).

The front end holds no business rules it cannot afford to be wrong about.
Fares are computed locally so a summary updates without a round trip, but the
server recomputes on booking and **its** answer is what is charged. Anything a
client could understate to pay less — a cab's distance, a flight's seat total
— is not accepted from the client at all.

## Running it

### 1. MySQL

Needs 8.0.16 or later. Apply the schema once:

```bash
mysql -u root -p --default-character-set=utf8mb4 < schema.sql
```

That creates the `suryabooker` database, all 47 tables, and the fixed lookups
(train classes and quotas, flight add-ons, cab categories and extras, bus and
hotel amenities). It seeds **no business data** — see "Loading data" below.

### 2. Backend

```bash
cd backend
python -m venv myvenv
myvenv\Scripts\activate       # Windows
source myvenv/bin/activate    # macOS / Linux

python -m pip install -r requirements.txt

cp .env.example .env          # then set DB_PASSWORD in it

python manage.py migrate      # Django's own tables only
python manage.py runserver    # http://localhost:8000
```

`settings.py` reads `backend/.env` at startup. `SECRET_KEY` and `DEBUG` come
from there too: when either is unset, settings fall back to a value that is
fine for development and nothing else, so a deployment must set both. A
variable already set in the real environment wins over the file, so a
container or a one-off `DB_PASSWORD=... manage.py ...` overrides it. `.env` is
gitignored; the password belongs there and not in `.env.example`.

> **Django is pinned to 6.0, not 6.1.** Django 6.1 requires MySQL 8.4 or
> later, and this project runs against 8.0. Moving up to 6.1 means upgrading
> the MySQL server first.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_URL, defaults to localhost:8000
npm run dev                   # http://localhost:5173
```

The Node version is pinned in `frontend/.nvmrc` (Node 24), and npm is the
package manager: `package-lock.json` is the lockfile, so do not use pnpm or
yarn.

The two run on different origins in development, which is why
`CORS_ALLOWED_ORIGINS` in the backend settings lists the Vite one. Behind a
single domain in production, point `VITE_API_URL` at the path the API is
mounted on and CORS stops mattering.

### Form validation

Every form checks its fields before anything is sent, and says what is wrong
next to the field rather than in a browser tooltip:

- `frontend/src/utils/validation.ts` — the rules, one pure function per kind
  of field (name, email, Indian mobile, age, password, date, date of birth
  against the travel date). They mirror what each module's serializer enforces,
  so a form that passes here is not sent back with the same complaint.
- `frontend/src/hooks/useFormValidation.ts` — runs them on the first submit,
  then live on every edit so each message clears as it is fixed, and focuses
  the first invalid field.
- `TextField` / `SelectField` take an `error` prop that draws the ring red,
  prints the message under the box and sets `aria-invalid`.

The server still validates everything. This is about hearing it before the
round trip, not instead of it.

## Loading data

`schema.sql` seeds reference data only — train classes and quotas, flight
add-ons, cab categories and extras, bus and hotel amenities. Until the business
tables are populated **every search returns an empty list**, correctly, because
there is nothing to sell.

One seed command per module loads demo data:

```bash
cd backend
python manage.py seed_bus
python manage.py seed_train      # --days 14
python manage.py seed_plane
python manage.py seed_hotel      # --days 60
python manage.py seed_cab
```

Together they load roughly 340,000 rows in under a minute:

| Module | What it loads |
|---|---|
| Bus | 10 operators, 1,140 trips (3 a day on every city pair), stop points, full seat maps |
| Train | 22 stations, 782 services — 22 named expresses plus generated ones — and 14 days of availability per class and quota |
| Plane | 6 airlines, 20 airports, 1,140 flights, 3 fare brands each, 12-row cabins |
| Hotel | 120 properties across the 20 cities, 302 room types, 810 rate plans, 60 nights of inventory |
| Cab | Rate cards for all 4 categories across all 3 journey types |

Every command is **safe to run twice**: inserts are keyed on something natural
— an operator's name, a train number, a seat code, a room type and night — so a
rerun updates or skips rather than duplicating, and nightly inventory is never
reset under a booking that already drew it down.

Three things worth knowing:

- **Routes cover every ordered pair of the twenty cities the search box
  offers.** No carrier would really fly Dehradun to Surat; a demo that answers
  "no flights" for most of its own suggestions is worse than one that invents
  the route.
- **Two tables are per date**, and are the usual reason a search looks broken
  when everything else is loaded. `train_availability` has a row per (train,
  class, quota, date) and `room_inventory` one per (room type, night). A date
  with no row reads as nothing available, not as unlimited — so **re-run
  `seed_train` and `seed_hotel` as the window rolls forward**, or raise
  `--days`.
- **`seed_bus`, `seed_train` and `seed_plane` take `--reset`**, which drops the
  generated services and rebuilds them. Use it after changing a generator;
  it refuses if any of them have bookings.

The Django admin at `/admin/` edits all of it by hand — inventory tables are
editable there, bookings are not.

## Checking it works

```bash
# The API reads MySQL:
curl http://localhost:8000/api/train/quotas/
curl http://localhost:8000/api/cab/extras/

# The whole test suite (292 tests, no MySQL needed - see below):
cd backend && python manage.py test --settings=config.test_settings

# The front end typechecks and builds:
cd frontend && npm run build
```

`config.test_settings` runs them against SQLite, building the unmanaged tables
with the schema editor, so they need no MySQL server. That pins behaviour, not
storage: the CHECK constraints and unique keys live only in `schema.sql` and
are not exercised there. Drop the `--settings` flag to run the same suite
against MySQL and get them, at the cost of needing the server up.

## The API

Everything is under `/api/`, one include per mode, and every response already
matches the matching `frontend/src/types/*.types.ts`. Errors share one
envelope whatever failed:

```json
{ "error": { "code": "seat_unavailable", "message": "...", "detail": { "seatIds": ["L4"] } } }
```

A 409 means the inventory moved while the traveller was deciding and the
screen should re-query; a 400 means the request itself was wrong, with
`detail` holding the per-field messages. `frontend/src/services/api.ts` turns
both into an `ApiError` carrying `code`, `status` and `detail`.

Per-module detail — endpoints, payloads, pricing rules and what is
deliberately not built — is in each app's README:

- [backend/accounts/README.md](backend/accounts/README.md) — sign-in and the booking gate
- [backend/bus/README.md](backend/bus/README.md)
- [backend/train/README.md](backend/train/README.md)
- [backend/plane/README.md](backend/plane/README.md)
- [backend/hotel/README.md](backend/hotel/README.md)
- [backend/cab/README.md](backend/cab/README.md)

## Contributing

Branch off `main`, open a pull request, and let the two CI jobs — `backend`
and `frontend` — go green before asking for review; pull requests are
squash-merged, so one branch lands as one commit. [CONTRIBUTING.md](CONTRIBUTING.md)
has the full flow, from branch names and commit messages to the repository
settings that enforce it, and [SECURITY.md](SECURITY.md) says how to report a
vulnerability without opening a public issue. Dependabot keeps dependencies
current with one grouped pull request per ecosystem each week, which goes
through the same checks as any other.

## Not built

No cancellation on any mode — each one needs a decision about releasing
inventory that the schema does not settle on its own. No payment gateway; the
payment row is written as `success` at booking time. No password reset, and no
email or mobile verification: `email_verified` and `phone_verified` exist on
the account and stay false.
