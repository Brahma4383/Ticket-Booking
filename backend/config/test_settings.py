"""
Settings for running the test suite.

    manage.py test --settings=config.test_settings

Two differences from `config.settings`, both about speed and reach:

  * **SQLite, not MySQL.** Every model in this project is `managed = False`,
    so each test module builds the tables it needs with the schema editor.
    That makes the suite runnable with no database server at all, which is
    what keeps it usable in CI and on a fresh clone. The trade is real and
    worth knowing: the CHECK constraints and unique keys live in schema.sql
    and are *not* exercised here. Run the suite against `config.settings` to
    get them, at the cost of needing MySQL up.

  * **A fast password hasher.** The real one is deliberately slow, which is
    right in production and adds a second to every test that signs an account
    in. MD5 is fine for a throwaway database and nothing else.
"""
from config.settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# The expired-hold sweep that rides on API requests (payments/middleware.py)
# is off by default here: most suites build only the tables they need, and a
# sweep with no `booking` table would log an error on every request. The
# payments suite turns it on for the tests that are about it.
PAYMENT_SWEEP_INTERVAL_SECONDS = 10 ** 9
