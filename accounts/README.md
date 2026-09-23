# Accounts API

Sign-up, sign-in, and the gate that makes booking require an account.

Browsing is open to anyone. Search, seat maps, cabin maps and quotes all
answer an anonymous request, so a traveller can pick a bus, choose a seat and
fill in passenger details before signing in. Only `POST .../bookings/` refuses
one — which is also the last moment it can be asked for.

## Endpoints

All under `/api/auth/`.

| | | |
|---|---|---|
| `POST` | `register/` | Create an account and sign in |
| `POST` | `login/` | Sign in with an email or mobile number |
| `GET` | `me/` | The account a token belongs to |

There is **no logout endpoint**. The token is signed rather than stored, so
there is nothing on the server to delete — signing out is the client dropping
it. What the server *can* do is invalidate every token an account holds, and
that happens when its password changes.

### `POST register/`

```json
{ "fullName": "A Traveller", "email": "rider@example.com",
  "phone": "9876543210", "password": "a-good-password" }
```

Returns `201` with `{ token, expiresIn, user }`. Registering signs you in:
someone who has just filled in a form to reach a booking should not have to
fill in a second one.

The password goes through Django's own `AUTH_PASSWORD_VALIDATORS` — length,
common passwords, all-numeric — and is stored as what `make_password`
produces. `409 account_exists` when the email or mobile is taken;
`detail.field` says which.

### `POST login/`

```json
{ "identifier": "rider@example.com", "password": "a-good-password" }
```

`identifier` is an email **or** a mobile number, because the form's own label
is "Email or mobile".

`401 invalid_credentials` for a wrong password, an unknown account and a
deactivated one alike, with the same message. Telling them apart is how an
account list gets enumerated — and the hash is verified even when no account
matched, so a request for an unknown email takes the same time as one for a
known email with the wrong password.

### `GET me/`

The account behind the token. The front end calls it on load to turn a stored
token back into a session; a 401 means the token expired or the password
changed, and the right response is to clear it rather than show an error.

## How the token works

`Authorization: Bearer <token>`, where the token is a signed, expiring blob
from `django.core.signing`. Nothing is stored server side, for two reasons:

- **../schema.sql owns the schema** and has no table for sessions or tokens.
  This app is not going to add one behind its back.
- **The front end is on a different origin** in development, so a cookie would
  need SameSite=None and therefore HTTPS. A header sidesteps that, and CSRF
  with it.

The cost is that a single token cannot be revoked. It expires on its own after
two weeks, and the last eight characters of the password hash ride along
inside it as a version tag — so **changing a password signs every device out**.

`BearerTokenAuthentication` is set as the project-wide default in settings, so
every app reads a token without importing anything from here. A view opts into
*requiring* one with DRF's own `IsAuthenticated`, which is why no booking
module depends on this one.

Returning a value from `authenticate_header` is what makes DRF answer **401**
rather than 403 on an anonymous request — the difference between the front end
offering a sign-in and showing "forbidden".

## What the gate changes

Every module's `BookingCreateView` and `BookingDetailView` now carry
`permission_classes = [IsAuthenticated]`.

- **The account comes from the token, never the payload.** `userId` was
  removed from every booking serializer; the view sets it from `request.user`.
  A client does not get to book in someone else's name.
- **A ticket is only readable by the account that booked it.** `get_booking`
  takes a `user_id` and filters on it. Someone else's reference returns **404,
  not 403** — a 403 would confirm the booking exists. Eight characters is
  short enough to guess.

## Two things to know

**`app_user` is not `django.contrib.auth.User`.** The schema models the
site's own accounts and every booking references that table. Django's user
model still exists behind `/admin/` and is a different thing — the admin login
and a traveller's login are unrelated.

**Accounts cannot be created from the admin.** The password would be stored
verbatim rather than hashed, and `check_password` would never match it, so the
account would be locked out. The hash is read-only there for the same reason.

## Tests

```bash
myvenv/Scripts/python manage.py test accounts --settings=config.test_settings
```

32 tests: registration and its collisions, password hashing and that the hash
never leaves the server, sign-in by email and by mobile, the identical answer
for an unknown account and a wrong password, token expiry, tampering, forged
salts and invalidation on a password change — and the gate itself, checked
against the bus module: search and quote open, booking refused anonymously,
accepted with an account, and a ticket unreadable by anyone else.
