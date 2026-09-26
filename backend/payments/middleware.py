"""
Release expired payment holds as a side effect of ordinary API traffic.

A pending booking holds real inventory. When its payment window runs out,
the seats have to come back on sale for *everyone* - not only the next time
the account that held them looks, which is all the lazy per-account sweep in
`payments.services` covers. The `expire_payments` command does it on a
schedule; this does it between schedules, so a search a minute after a hold
lapsed already shows the seat free.

Throttled per process to one sweep every `PAYMENT_SWEEP_INTERVAL_SECONDS`
(30 by default). When nothing is stale the sweep is one indexed query, so
the cost is negligible; when something is, each booking is closed in its own
short transaction before the request carries on.
"""
import logging
import threading
import time

from django.conf import settings
from django.db import DatabaseError

from payments.services import expire_stale

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_last_sweep = 0.0


def _interval():
    return float(getattr(settings, 'PAYMENT_SWEEP_INTERVAL_SECONDS', 30))


def _due(now):
    """True for exactly one caller once the interval has passed."""
    global _last_sweep
    with _lock:
        if now - _last_sweep < _interval():
            return False
        _last_sweep = now
        return True


class ExpireHoldsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/api/') and _due(time.monotonic()):
            try:
                expire_stale()
            except DatabaseError:
                # Best effort: a sweep that cannot run must never take down the
                # request it rode in on. The command and the next sweep retry.
                logger.exception('Releasing expired payment holds failed.')

        return self.get_response(request)
