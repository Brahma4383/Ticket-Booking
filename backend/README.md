# SuryaBooker API

The Django REST API behind `frontend/`. This is the guide to running and
working in `backend/`; how the front end, the API and `schema.sql` fit together
is in the [root README](../README.md), which this page points to, not repeats.

## What is here

| Directory | What it is |
|---|---|
| `config/` | Settings, URL routing (everything is mounted under `/api/`), `test_settings.py`, and the ASGI and WSGI entry points |
| `accounts/` | Sign-up, sign-in and the Bearer token every other app reads - [README](accounts/README.md) |
| `contact/` | The contact form: one endpoint and no table, a message is validated, mailed and not stored |
| `chat/` | The support assistant behind the chat bubble: scripted answers, with Claude on top when `ANTHROPIC_API_KEY` is set |
| `bus/` | Operators, trips, stop points and seat maps - [README](bus/README.md) |
| `train/` | Stations, services, and availability per class and quota - [README](train/README.md) |
| `plane/` | Airlines, airports, fare brands and cabin seat maps - [README](plane/README.md) |
| `hotel/` | Properties, room types, rate plans and nightly inventory - [README](hotel/README.md) |
| `cab/` | Categories, rate cards and extras for three journey types - [README](cab/README.md) |

## Setting up

Python 3.14 (`.python-version`) and a MySQL 8.0 server with `schema.sql`
already applied - step 1 of the root README. On Linux, `mysqlclient` builds
against `libmysqlclient-dev` and needs a C compiler; on Windows it is a wheel.
Every other README skips activating and calls `myvenv/Scripts/python`
(`myvenv/bin/python` on macOS and Linux) directly, which is the same thing.

Windows, in PowerShell (in cmd the activation line is `myvenv\Scripts\activate.bat`):

```powershell
cd backend
python -m venv myvenv
myvenv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env          # then set DB_PASSWORD in it
python manage.py migrate        # Django's own tables only
python manage.py runserver      # http://localhost:8000
```

macOS and Linux:

```bash
cd backend
python3 -m venv myvenv
source myvenv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env            # then set DB_PASSWORD in it
python manage.py migrate        # Django's own tables only
python manage.py runserver      # http://localhost:8000
```

## Loading demo data

Until the business tables are populated every search correctly returns an
empty list. One command per mode loads demo data; each is safe to run twice:

```bash
python manage.py seed_bus
python manage.py seed_train      # --days 14
python manage.py seed_plane
python manage.py seed_hotel      # --days 60
python manage.py seed_cab
```

What each loads, when `seed_train` and `seed_hotel` need re-running, and what
`--reset` does are under "Loading data" in the root README.

## Running the tests

```bash
python manage.py test --settings=config.test_settings
python manage.py test bus --settings=config.test_settings    # one app
```

`config.test_settings` is SQLite in memory, with the unmanaged tables built by
the schema editor: no database server, 292 tests in about 20 seconds, anywhere.

Drop the `--settings` flag to run the same suite against MySQL, which also
exercises the CHECK constraints and unique keys that live only in `schema.sql`.
Django creates and drops `test_suryabooker` for it, so the user in `.env` needs
permission to do that.

## Environment variables

All read by `settings.py` from the environment. `backend/.env` is loaded at
startup, and a variable already set in the real environment wins over it.

| Variable | Default | What it does |
|---|---|---|
| `DB_NAME` | `suryabooker` | MySQL database |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | empty | MySQL password; belongs in `.env`, never in `.env.example` |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_CONN_MAX_AGE` | `60` | Seconds a connection is held open between requests |
| `SECRET_KEY` | a `django-insecure-` development key | Signs everything the site signs, Bearer tokens included; a deployment sets a long random value, and changing it signs every device out |
| `DEBUG` | `true` | `1`, `true` or `yes` in any case turns it on; must be `false` anywhere reachable from the internet |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Hosts the server answers to, comma separated; add a LAN address to open the app from a phone |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origins allowed to call the API, comma separated |
| `EMAIL_HOST` | empty | SMTP host; blank means contact form mail is printed to the server log instead of sent |
| `EMAIL_PORT` | `587` | SMTP port |
| `EMAIL_HOST_USER` | empty | SMTP user |
| `EMAIL_HOST_PASSWORD` | empty | SMTP password; for Gmail, an app password |
| `EMAIL_USE_TLS` | `true` | STARTTLS on the SMTP connection |
| `EMAIL_TIMEOUT` | `10` | Seconds to wait for the SMTP server |
| `DEFAULT_FROM_EMAIL` | `EMAIL_HOST_USER`, else `no-reply@suryabooker.in` | The From: on contact form mail; the person who wrote it goes in Reply-To |
| `CONTACT_INBOX` | `owner@shubhamtanks.com` | Where contact form messages are delivered |
| `CONTACT_RATE_LIMIT` | `5/hour` | Contact form messages one IP address may send, in DRF's rate syntax |
| `ANTHROPIC_API_KEY` | empty | Optional; set, the chat assistant hands free-text questions to Claude (needs `pip install anthropic`) |
| `CHAT_AI_MODEL` | `claude-opus-5` | The model the assistant calls when a key is set |
| `CHAT_RATE_LIMIT` | `30/hour` | Chat messages one IP address may send |

## Conventions

- **`schema.sql` owns the database.** Every model is `managed = False` and
  maps onto a table the schema already made. A change goes into `schema.sql`,
  is applied with the `mysql` client, then mirrored in the models - never a
  migration for a project table.
- **One app per travel mode, and no cross-imports.** `bus`, `train`, `plane`,
  `hotel` and `cab` each map the shared tables under their own model classes,
  legal precisely because they are unmanaged. Only `accounts` writes `app_user`.
- **One error envelope.** Whatever failed, the body is
  `{"error": {"code": "...", "message": "...", "detail": {...}}}`. A 400 is a
  request that was wrong, with per-field messages in `detail`; a 409 is
  inventory that moved while the traveller was deciding, so re-query.
- **Browsing is open; booking needs a token.** Search, seat maps and quotes
  answer an anonymous request; `POST .../bookings/` answers 401 without
  `Authorization: Bearer <token>`. `BearerTokenAuthentication` is the project
  default, so a view requires an account with DRF's own `IsAuthenticated` and
  imports nothing from `accounts`.
