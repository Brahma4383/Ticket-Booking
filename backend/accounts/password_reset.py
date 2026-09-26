"""
Forgotten passwords: the reset link, and the mail that carries it.

The link is Django's own password-reset token, pointed at `app_user` rather
than `auth.User`. It is signed with SECRET_KEY and stored nowhere - the schema
has no table for it, and this app does not add one behind schema.sql's back -
yet it is still single-use and short-lived, because the value it signs
includes the account's password hash and last sign-in:

  * **Single-use.** Setting the new password changes the hash, so the same
    link fails the second time. A sign-in in between also retires it.
  * **Short-lived.** The token carries its own timestamp and is refused after
    `PASSWORD_RESET_TIMEOUT` seconds - an hour by default.
  * **Unguessable.** It is an HMAC. Unlike a six-digit code, there is nothing
    to brute-force, so no attempt counter needs to be kept anywhere.

The link points at the front end (`FRONTEND_URL`), never at whatever host the
request came in on: a forged `Host` or `Origin` header must not be able to
send a real traveller a reset link to someone else's site.
"""
import logging
import sys
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import EmailMultiAlternatives
from django.utils.encoding import force_bytes, force_str
from django.utils.html import escape
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from accounts.models import AppUser

logger = logging.getLogger(__name__)

BRAND = 'SuryaBooker'


class AppUserTokenGenerator(PasswordResetTokenGenerator):
    """
    Django's reset token, over `AppUser`'s own field names.

    The stock generator reads `user.password` and `user.last_login`, which
    `AppUser` calls `password_hash` and `last_login_at`; everything else -
    the timestamp, the expiry, the constant-time comparison, SECRET_KEY
    rotation through SECRET_KEY_FALLBACKS - is Django's and unchanged.
    """

    key_salt = 'accounts.password_reset.AppUserTokenGenerator'

    def _make_hash_value(self, user, timestamp):
        # Seconds only: some databases drop microseconds, and a value that
        # changed on the round trip would retire every link at once.
        last_login = (
            '' if user.last_login_at is None
            else user.last_login_at.replace(microsecond=0, tzinfo=None)
        )
        return f'{user.pk}{user.password_hash}{last_login}{timestamp}{user.email}'


reset_tokens = AppUserTokenGenerator()


def encode_uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def user_for_link(uid, token):
    """
    The active account a reset link belongs to, or None.

    None for every kind of failure - a mangled uid, an unknown or deactivated
    account, an expired, used or forged token - because the caller cannot do
    anything different with any of them, and saying which it was would only
    help someone probing.
    """
    try:
        pk = int(force_str(urlsafe_base64_decode(uid)))
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError):
        return None

    user = AppUser.objects.filter(pk=pk, is_active=True).first()
    if user is None or not reset_tokens.check_token(user, token):
        return None
    return user


def find_account(identifier):
    """The active account an email or a mobile number belongs to, or None."""
    identifier = identifier.strip()
    digits = identifier.replace(' ', '').replace('-', '')

    if '@' in identifier:
        rows = AppUser.objects.filter(email__iexact=identifier)
    elif digits.isdigit():
        # The last ten digits, so +91 98765 43210 finds 9876543210.
        rows = AppUser.objects.filter(phone=digits[-10:])
    else:
        return None

    return rows.filter(is_active=True).first()


def reset_link(user):
    base = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    query = urlencode({'uid': encode_uid(user), 'token': reset_tokens.make_token(user)})
    return f'{base}/reset-password?{query}'


def mask_email(address):
    """`demo@gmail.com` -> `d•••o@gmail.com`: enough to recognise it."""
    local, _, domain = address.partition('@')
    if len(local) <= 2:
        hidden = local[:1] + '•••'
    else:
        hidden = f'{local[0]}•••{local[-1]}'
    return f'{hidden}@{domain}'


def link_lifetime_minutes():
    return max(1, int(settings.PASSWORD_RESET_TIMEOUT) // 60)


def first_name(user):
    return (user.full_name or '').split(' ')[0] or 'there'


# ---------------------------------------------------------------------------
# Mail
# ---------------------------------------------------------------------------

def _send(user, subject, text, html):
    """
    Send one message to the account holder. Returns whether it went.

    Never raises. A failure is logged - with the account id, not the address
    - and the caller answers the traveller exactly as it would have anyway:
    telling them the mail server is down only for addresses that exist would
    say which ones do.
    """
    message = EmailMultiAlternatives(
        subject=subject, body=text,
        from_email=settings.DEFAULT_FROM_EMAIL, to=[user.email],
    )
    message.attach_alternative(html, 'text/html')
    try:
        message.send(fail_silently=False)
    except Exception:
        logger.exception('Password mail to account %s could not be sent', user.pk)
        return False
    return True


def _html(heading, paragraphs, button=None):
    """A plain, inline-styled message: mail clients ignore stylesheets."""
    body = ''.join(
        f'<p style="margin:0 0 16px;line-height:1.5">{paragraph}</p>'
        for paragraph in paragraphs
    )
    action = ''
    if button:
        label, href = button
        action = (
            f'<p style="margin:24px 0"><a href="{escape(href)}" '
            'style="background:#c2410c;color:#ffffff;text-decoration:none;'
            'padding:12px 24px;border-radius:999px;font-weight:bold;'
            f'display:inline-block">{escape(label)}</a></p>'
        )
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#1c1917;'
        'max-width:520px;margin:0 auto;padding:24px">'
        f'<p style="font-size:20px;font-weight:bold;margin:0 0 24px">{BRAND}</p>'
        f'<h1 style="font-size:22px;margin:0 0 16px">{escape(heading)}</h1>'
        f'{body}{action}'
        '<p style="margin:24px 0 0;font-size:12px;color:#78716c">'
        f'This message was sent by {BRAND} because of activity on your '
        'account. Please do not reply to it.</p></div>'
    )


CONSOLE_BACKEND = 'django.core.mail.backends.console.EmailBackend'


def _echo_for_development(user, link):
    """
    Print the link once more, whole, when mail is only being printed.

    With no EMAIL_HOST set, settings route mail to the console backend, which
    writes the raw message - quoted-printable, so the link comes out split
    across lines with every `=` turned into `=3D`, and cannot be pasted into a
    browser. This prints it decoded, to the same place, and only then: with a
    real mail server configured nothing extra is written anywhere.
    """
    if settings.EMAIL_BACKEND != CONSOLE_BACKEND:
        return
    sys.stdout.write(
        f'\n[password reset] Mail is not being sent (no EMAIL_HOST). '
        f'Link for {user.email}:\n{link}\n\n'
    )
    sys.stdout.flush()


def send_reset_email(user):
    """Mail the account holder a link to choose a new password."""
    link = reset_link(user)
    _echo_for_development(user, link)
    minutes = link_lifetime_minutes()
    name = first_name(user)

    text = (
        f'Hi {name},\n\n'
        f'Someone asked to reset the password on your {BRAND} account. '
        'If it was you, open this link to choose a new one:\n\n'
        f'{link}\n\n'
        f'The link works once, for the next {minutes} minutes.\n\n'
        'If you did not ask for this, ignore this email - your password '
        'stays as it is and nobody can use this link without access to '
        'your inbox.\n\n'
        f'- The {BRAND} team\n'
    )
    html = _html(
        'Reset your password',
        [
            f'Hi {escape(name)},',
            f'Someone asked to reset the password on your {BRAND} account. '
            'If it was you, choose a new one below.',
            f'The link works once, for the next {minutes} minutes. If the '
            f'button does not work, paste this into your browser:<br>'
            f'<span style="word-break:break-all;color:#57534e">{escape(link)}</span>',
            'If you did not ask for this, ignore this email - your password '
            'stays as it is.',
        ],
        button=('Choose a new password', link),
    )
    return _send(user, f'Reset your {BRAND} password', text, html)


def send_password_changed_email(user):
    """
    Tell the account holder their password just changed.

    The one alarm a traveller gets if somebody else reset it: without this, a
    takeover through a compromised inbox would be silent.
    """
    name = first_name(user)
    text = (
        f'Hi {name},\n\n'
        f'The password on your {BRAND} account was just changed, and every '
        'device that was signed in has been signed out.\n\n'
        'If this was you, there is nothing more to do. If it was not, reset '
        'your password again straight away from the sign-in screen and call '
        'our support line.\n\n'
        f'- The {BRAND} team\n'
    )
    html = _html(
        'Your password was changed',
        [
            f'Hi {escape(name)},',
            f'The password on your {BRAND} account was just changed, and every '
            'device that was signed in has been signed out.',
            'If this was you, there is nothing more to do. If it was not, '
            'reset your password again straight away from the sign-in screen '
            'and call our support line.',
        ],
    )
    return _send(user, f'Your {BRAND} password was changed', text, html)
