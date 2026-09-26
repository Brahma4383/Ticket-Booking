# SuryaBooker

[![CI](https://github.com/Brahma4383/Ticket-Booking/actions/workflows/ci.yml/badge.svg)](https://github.com/Brahma4383/Ticket-Booking/actions/workflows/ci.yml)

A travel booking site for buses, trains, flights, hotel stays and cabs. It has
a React front end, a Django REST API and a MySQL database.

- **Five booking flows** run from search, to seats or rooms, to travellers, to
  payment, to a printable ticket.
- **Accounts** cover sign-up, sign-in by email or mobile, and a forgotten
  password reset by email.
- **Payments** are a separate step with a transaction history, declines and
  retries, and refunds on cancellation. They go through a built-in test
  gateway, so no real money moves.
- **My account** lists every trip by date and every payment with its receipt.
  Travellers can cancel a trip or finish paying for one from there.
- **A support chat** answers common questions from a script, and optionally
  uses Claude for free-text questions.

## Contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [API reference](#api-reference)
- [Testing](#testing)
- [Front-end notes](#front-end-notes)
- [Limitations](#limitations)
- [Contributing](#contributing)

## Tech stack

| Part | Stack |
|---|---|
| Front end | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Radix), React Router |
| API | Python 3.14, Django 6.0, Django REST Framework |
| Database | MySQL 8.0.16 or later |
| Checks | Django test suite on SQLite, oxlint, `tsc`, GitHub Actions |

Django is pinned to 6.0 because Django 6.1 needs MySQL 8.4 or later.

## Project structure

```
schema.sql          The MySQL schema: every table, and the fixed lookup rows.
backend/            The Django API.
  config/           Settings, URL routing, test settings.
  accounts/         Sign-up, sign-in, tokens, password reset, the account's
                    bookings and cancellations.
  payments/         Paying for a booking, the test gateway, receipts, and
                    releasing unpaid holds.
  bus/ train/ plane/ hotel/ cab/
                    One app per travel mode: models, services (the business
                    rules), serializers, views, a seed command and tests.
  contact/          The contact form. It sends mail and stores nothing.
  chat/             The support assistant behind the chat bubble.
frontend/           The React client.
  src/pages/        One folder per screen or booking flow.
  src/services/     One file per API area; api.ts owns requests and errors.
  src/types/        TypeScript types matching each API response exactly.
.github/            CI workflow, Dependabot, issue and pull request templates.
```

## Getting started

### 1. Database

Apply the schema once, with MySQL 8.0.16 or later:

```bash
mysql -u root -p --default-character-set=utf8mb4 < schema.sql
```

This creates the `suryabooker` database, all its tables, and the fixed lookup
rows: train classes and quotas, flight add-ons, cab categories and extras, and
bus and hotel amenities. It loads no business data; see step 4.

### 2. Backend

```bash
cd backend
python -m venv myvenv
myvenv\Scripts\activate          # Windows
source myvenv/bin/activate       # macOS / Linux

python -m pip install -r requirements.txt
cp .env.example .env             # then set DB_PASSWORD in .env
python manage.py migrate         # Django's own tables only
python manage.py runserver       # http://localhost:8000
```

On Linux, `mysqlclient` builds from source and needs `libmysqlclient-dev` and
a C compiler. On Windows it installs as a wheel.

### 3. Front end

Needs Node 24, which `frontend/.nvmrc` pins, and npm.

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                      # http://localhost:5173
```

### 4. Demo data

Until the business tables are filled, every search correctly returns nothing.
One command per mode loads demo data, and each is safe to run twice:

```bash
cd backend
python manage.py seed_bus
python manage.py seed_train      # --days 14
python manage.py seed_plane
python manage.py seed_hotel      # --days 60
python manage.py seed_cab
```

| Command | What it loads |
|---|---|
| `seed_bus` | 10 operators, 1,140 trips (3 a day on every city pair), stop points and full seat maps |
| `seed_train` | 22 stations, 782 services, and availability per class and quota for the next 14 days |
| `seed_plane` | 6 airlines, 20 airports, 1,140 flights, 3 fare brands each, 12-row cabins |
| `seed_hotel` | 120 properties across 20 cities, 302 room types, 810 rate plans, 60 nights of inventory |
| `seed_cab` | Rate cards for all 4 cab categories across all 3 journey types |

Train availability and hotel inventory are stored per date. **Re-run
`seed_train` and `seed_hotel` as the calendar moves forward**, or a later date
reads as sold out. `seed_bus`, `seed_train` and `seed_plane` also take
`--reset`, which rebuilds the generated services; it refuses if any have
bookings.

### 5. Try it

Open http://localhost:5173, search a route, and book. Sign-in is asked for at
the payment step. The payment form runs in test mode, and these values let you
see every outcome:

| Method | Goes through | Declined |
|---|---|---|
| UPI | Any valid ID, such as `demo@okaxis` | `failure@upi` |
| Card | `4242 4242 4242 4242`, any future expiry, any CVV | `4000 0000 0000 0002` (issuer), `4000 0000 0000 9995` (no funds), any past expiry |
| Netbanking | Every bank on the list | Never |
| Wallet | Every wallet on the list | Never |

With no mail server set up, emails print in the terminal running `runserver`.
That includes the password reset email. Its link is also printed on its own
line starting `[password reset]`, ready to copy.

## Configuration

The backend reads `backend/.env` at startup, and a variable already set in the
real environment wins over the file. `backend/.env.example` lists them all.
`.env` is gitignored, so passwords belong there and never in the template.

| Variable | Default | What it does |
|---|---|---|
| `DB_NAME` `DB_USER` `DB_PASSWORD` `DB_HOST` `DB_PORT` | `suryabooker` `root` empty `127.0.0.1` `3306` | The MySQL connection |
| `DB_CONN_MAX_AGE` | `60` | Seconds a database connection is kept open between requests |
| `SECRET_KEY` | A development key | Signs sign-in tokens and reset links. A deployment must set a long random value. Changing it signs everyone out |
| `DEBUG` | `true` | Must be `false` anywhere reachable from the internet |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Hosts the API answers to. Add a LAN address to use the app from a phone |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origins allowed to call the API |
| `FRONTEND_URL` | `http://localhost:5173` | Where the site is served. Password reset emails link here |
| `EMAIL_HOST` | empty | SMTP server. Empty means mail is printed to the console instead of sent |
| `EMAIL_PORT` `EMAIL_USE_TLS` `EMAIL_TIMEOUT` | `587` `true` `10` | SMTP connection settings |
| `EMAIL_HOST_USER` `EMAIL_HOST_PASSWORD` | empty | SMTP login. For Gmail, use an app password |
| `DEFAULT_FROM_EMAIL` | `EMAIL_HOST_USER`, else `demo@gmail.com` | The sender of every email |
| `CONTACT_INBOX` | `demo@gmail.com` | Where contact form messages go |
| `CONTACT_RATE_LIMIT` | `5/hour` | Contact messages allowed per IP address |
| `PAYMENT_HOLD_MINUTES` | `15` | How long an unpaid booking holds its seats, berths or rooms |
| `PAYMENT_SWEEP_INTERVAL_SECONDS` | `30` | The longest gap between API requests releasing expired holds |
| `PASSWORD_RESET_TIMEOUT_MINUTES` | `60` | How long a reset link works |
| `PASSWORD_RESET_RATE_LIMIT` | `5/hour` | Reset emails allowed per IP address |
| `PASSWORD_RESET_ACCOUNT_RATE_LIMIT` | `3/hour` | Reset emails allowed per account, whoever asks |
| `PASSWORD_RESET_CONFIRM_RATE_LIMIT` | `30/hour` | Reset link checks and new passwords allowed per IP address |
| `ANTHROPIC_API_KEY` | empty | Optional. Lets the support chat answer free-text questions with Claude (needs `pip install anthropic`) |
| `CHAT_AI_MODEL` `CHAT_RATE_LIMIT` | `claude-opus-5` `30/hour` | The model the chat uses, and messages allowed per IP address |

The front end has one optional variable, `VITE_API_URL`, in `frontend/.env`.
Left unset, requests go to port 8000 on whatever host the page was opened
from, so the same build works at `localhost` and from a phone on the LAN. Set
it in production to pin the API's address. Everything in `frontend/.env` ends
up in the browser bundle, so it must never hold a secret.

## How it works

### The three parts

`schema.sql` owns the database. Every Django model is `managed = False` and
maps onto a table the schema already made, so `migrate` only creates Django's
own admin, auth and session tables. **A schema change goes into
`schema.sql`, is applied to MySQL, and is then mirrored in the models**, never
the other way round.

Each travel mode is a self-contained app with its own models, services,
serializers, views, errors and tests. The modes never import each other. Each
maps the shared tables (`city`, `app_user`, `offer`, `booking`,
`booking_fare_line`, `payment`) under its own model classes, which works
because every model is unmanaged. `accounts` and `payments` are the shared
layer every mode relies on.

The front end holds no rule it cannot afford to get wrong. It computes fares
so the summary updates without a round trip, but the server recomputes them on
booking, and its answer is what gets charged. Anything a client could
understate to pay less, such as a cab's distance or a flight's seat total, is
never taken from the client.

### Accounts and sign-in

Searching, seat maps and quotes are open to anyone, so a visitor can get all
the way to payment before signing in. Only booking and paying need an account,
and the API answers 401 without one.

A sign-in token is a signed, expiring value sent as `Authorization: Bearer
<token>`, and nothing is stored on the server. It lasts two weeks. It carries a
version tag taken from the password hash, so **changing the password signs
every device out**. Accounts are the `app_user` table, which is separate from
Django's own admin users.

### Booking and paying

Booking takes two steps.

1. **Hold.** `POST /api/<mode>/bookings/` checks availability, reserves the
   seats, berths, rooms or cab, and writes the booking as `pending`. Seats are
   locked with `SELECT ... FOR UPDATE`, so two people buying the last seat are
   served one after the other and cannot both get it.
2. **Pay.** `POST /api/payments/<mode>/<reference>/` asks the gateway. If it
   goes through, the booking becomes `confirmed` and the ticket comes back with
   the payment on it. If it is declined, the attempt is recorded and the
   traveller can retry, the same way or another way.

A hold that is still unpaid after `PAYMENT_HOLD_MINUTES` is released and the
booking closed as `failed`, with nothing charged. Three things release expired
holds:

- **A payment attempt** or order lookup on that booking.
- **The account's own lists**, before they are read.
- **Ordinary API traffic**, which sweeps expired holds at most every 30
  seconds.

For a deployment, also run `python manage.py expire_payments` on a schedule.

What is charged online depends on the mode:

- **Bus, train and flight** charge the whole fare.
- **Cab** charges only a 20% advance, and the driver collects the rest.
- **Hotel** charges the whole stay, except on a pay-at-hotel rate plan. There
  it charges nothing now and records the card or UPI ID as a guarantee.

The gateway is `backend/payments/gateway.py`, a sandbox that answers like a
real one. **Card numbers and CVVs are never stored**: a receipt keeps only
something like `Visa •••• 4242`. To use a real gateway, replace
`gateway.charge`; nothing around it needs to change.

In the front end, a retry after a decline pays for the same booking. If the
traveller goes back and changes a seat or a name, the old hold is cancelled
before a new booking is made.

### Cancelling and refunds

Travellers cancel from My account, up to the end of the travel day, or the
check-out day for a stay. The booking keeps its row and becomes `cancelled`.
Its module puts the inventory back:

- **Bus** frees its seats.
- **Train** returns its berths to the class.
- **Flight** frees the travellers' seats.
- **Hotel** reopens the room for every night.

**The refund is exactly what was paid.** A cab refunds its advance, and a
booking cancelled before it was paid refunds nothing.

### Forgotten passwords

1. "Forgot password?" on the log-in tab asks for the email or mobile number on
   the account.
2. The API emails a link to that account's email address. There is no SMS.
3. The link opens `/reset-password`, where the traveller picks a new password
   and is signed in.

The answer is the same whether or not an account matched, so the form cannot
be used to find out who is registered. The link is Django's own
password-reset token, pointed at `app_user`, and nothing is stored for it:

- **Single-use.** It is signed over the password hash and the last sign-in,
  so it stops working once the password changes, or after an ordinary log-in.
- **Short-lived.** It expires after `PASSWORD_RESET_TIMEOUT_MINUTES`.
- **Unguessable.** It is an HMAC, not a short code, so it cannot be
  brute-forced.

After a reset, every other device is signed out and the account holder gets a
"password changed" email. Requests are rate limited per IP address and per
account. The link is always built from `FRONTEND_URL`, never from the
request's host, so a forged header cannot send someone a link to another site.

### Support chat

`POST /api/chat/` answers common questions from scripted intents in
`chat/knowledge.py`. These cover refunds, cancellation, payments, passwords,
tickets and bookings, in English and Hinglish. Signed in, it can read the
traveller's own bookings. With `ANTHROPIC_API_KEY` set, questions the script
cannot answer go to Claude; without it, the chat is a menu that offers the
support line.

## API reference

Everything is under `/api/`, and every response matches the matching
`frontend/src/types/*.types.ts`. Every error has the same shape:

```json
{ "error": { "code": "seat_unavailable", "message": "…", "detail": { "seatIds": ["L4"] } } }
```

| Status | Meaning |
|---|---|
| 400 | The request is wrong. `code` `invalid` puts per-field messages in `detail` |
| 401 | Signing in is needed, or the token has expired |
| 402 | `payment_declined`. The attempt is recorded and the booking is still held |
| 404 | Not found. A reference owned by another account is also 404, never 403 |
| 409 | The inventory changed while the traveller was deciding (`seat_unavailable`, `class_unavailable`, `rooms_unavailable`), or the booking's state refuses the request (`payment_expired`, `cancellation_not_allowed`) |
| 429 | `too_many_requests` or `throttled`. Try again later |

### Accounts: `/api/auth/`

| | | |
|---|---|---|
| `POST` | `register/` | Create an account and sign in |
| `POST` | `login/` | Sign in with an email or mobile number and a password |
| `GET` | `me/` | The signed-in account |
| `GET` | `me/bookings/` | Every booking on the account, all modes, newest first |
| `POST` | `me/bookings/<mode>/<reference>/cancel/` | Cancel a booking, and get the refund amount back |
| `POST` | `password/forgot/` | Email a reset link. Always answers 202 |
| `POST` | `password/reset/check/` | Check whether a reset link still works |
| `POST` | `password/reset/` | Set a new password from a link, and sign in |

### Payments: `/api/payments/`, signed in only

| | | |
|---|---|---|
| `GET` | `` (the root) | Every payment attempt on the account, newest first |
| `GET` | `<transaction-ref>/` | One attempt with its fare lines, as a receipt |
| `GET` | `<mode>/<reference>/` | What a booking still owes, its hold deadline and its attempts |
| `POST` | `<mode>/<reference>/` | Pay: `{ "method": "upi", "upiId": "…" }`, or `card`, `netbanking` or `wallet` |

### Travel modes

Every mode has search, a quote, `POST bookings/` (signed in, creates a pending
booking) and `GET bookings/<reference>/` (signed in, own bookings only).

| Mode | Search and lookups | Reference |
|---|---|---|
| Bus `/api/bus/` | `trips/?from=&to=&date=`, `trips/<id>/`, `trips/<id>/seats/?date=`, `quote/` | `SB` + 6 characters |
| Train `/api/train/` | `quotas/`, `trains/?from=&to=&date=&quota=`, `trains/<id>/`, `quote/` | 10-digit PNR |
| Flight `/api/plane/` | `addons/`, `flights/?from=&to=&date=&travellers=`, `flights/<id>/`, `flights/<id>/seats/?date=`, `quote/` | 6 characters |
| Hotel `/api/hotel/` | `amenities/?city=`, `stays/?city=&checkIn=&checkOut=&guests=`, `stays/<id>/`, `quote/` | `HT` + 6 characters |
| Cab `/api/cab/` | `extras/`, `estimate/?pickup=&drop=&date=&time=`, `cabs/?pickup=&drop=&date=&time=`, `quote/` | `CB` + 6 characters |

Other endpoints are `POST /api/contact/` for the contact form and
`POST /api/chat/` for the support chat.

### How fares are priced

The server owns every price. The front end repeats the same formulas only so
the fare summary can update as the traveller picks options.

| Mode | Formula |
|---|---|
| Bus | Seat prices, plus a ₹25 service fee, plus 5% GST rounded to whole rupees |
| Train | Class fare × passengers, plus the quota surcharge (e.g. Tatkal), plus the reservation charge. Adds 5% GST on air-conditioned classes only, and ₹0.45 per passenger for insurance if taken |
| Flight | Fare brand × travellers, plus 12% tax and ₹236 a traveller, plus seats, add-ons and a ₹149 convenience fee per traveller |
| Hotel | Nightly rate × nights × rooms, plus a ₹99 property fee per room per night. Tax is 12% below ₹7,500 a night and 18% at or above, set by the nightly rate, not the total |
| Cab | Included kilometres × the per-km rate from the rate card, plus extras, the driver allowance (outstation over 250 km), estimated tolls (outstation), the night charge (22:00–06:00) and 5% GST. The advance is 20% |

A cab's distance is worked out on the server from the two addresses,
deterministically, so a quote never changes between screens. There is no
routing engine: `cab.services.estimate_trip` is where a real distance service
would plug in.

## Testing

```bash
cd backend
python manage.py test --settings=config.test_settings
```

`config.test_settings` runs the suite on SQLite in memory, building the
unmanaged tables with Django's schema editor, so no MySQL server is needed. It
tests behaviour, not storage: the CHECK constraints and unique keys exist only
in `schema.sql` and are not exercised there. Drop the `--settings` flag to run
the same suite against MySQL.

```bash
cd frontend
npm run lint
npm run build      # typechecks with tsc, then bundles
```

GitHub Actions runs both on every push to `main` and on every pull request,
as the `backend` and `frontend` jobs in `.github/workflows/ci.yml`.
Dependabot opens one grouped update a week for pip, npm and Actions.

## Front-end notes

- **`@/` means `src/`.** Imports use it rather than `../../`.
- **Requests go through `src/services/api.ts`.** Its `apiGet` and `apiPost`
  own the base URL, the Bearer token and the error shape. Every failure throws
  an `ApiError` with the backend's `code`, `status` and `detail`.
- **Each area has a matching service and type file.** For example,
  `services/bus.services.ts` pairs with `types/bus.types.ts`. The types mirror
  the API exactly, and `payment.services.ts` handles paying for any mode.
- **Each booking flow is one folder.** In `pages/<mode>/`, `index.tsx` wires
  the steps and each `Step*.tsx` is one screen. A hook holds the flow's state,
  and `hooks/useCheckout.ts` keeps the pending booking alive between steps.
- **Forms validate on the page first.** They use the pure rules in
  `utils/validation.ts`, which match the server's serializers. The server
  still checks everything.
- **shadcn components are added with the CLI.** `npx shadcn add <name>` puts
  them in `components/ui/`. `components.json` and `lib/utils.ts` are there for
  the CLI.

## Limitations

- **No real payment gateway.** The sandbox takes no money, as described
  above.
- **No SMS or verification.** Password resets go by email only, and emails
  and mobile numbers are never verified: `email_verified` and
  `phone_verified` stay false.
- **No return journeys.** Flights and cabs are one-way.
- **No waitlist movement.** A cancelled train ticket gives confirmed berths
  back but does not move the RAC or waitlist queues.
- **Cab rate cards must be loaded.** A cab category without a rate card in
  force is not offered; `seed_cab` loads them.
- **Hotel images are placeholders.** Each property gets a colour gradient
  picked from its id, because the schema stores no images.

## Contributing

Branch off `main` and open a pull request. The `backend` and `frontend` CI
jobs must pass, and pull requests are squash-merged.
[CONTRIBUTING.md](CONTRIBUTING.md) covers branch names, commit messages and
the repository settings. [SECURITY.md](SECURITY.md) explains how to report a
vulnerability privately.
