"""
Token authentication for the site's own accounts.

A token is a signed, expiring blob produced by `django.core.signing` and sent
back as `Authorization: Bearer <token>`. Nothing is stored server side, which
matters here for two reasons:

  * ../schema.sql owns the schema and has no table for sessions or tokens, and
    this app is not going to add one behind its back.
  * The front end is on a different origin in development, so a cookie would
    need SameSite=None and therefore HTTPS. A header sidesteps all of that,
    and with it CSRF.

The cost of statelessness is that a token cannot be revoked one at a time. It
expires on its own after TOKEN_MAX_AGE, and changing a password invalidates
every token that account has already issued - see `issue_token`.
"""
from django.conf import settings
from django.core import signing
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from accounts.models import AppUser

# Namespaces the signature, so a token cannot be replayed against some other
# thing this project signs.
TOKEN_SALT = 'accounts.auth.v1'

# Two weeks. Long enough that a traveller is not asked to sign in mid-booking,
# short enough that a leaked token is not useful for long.
TOKEN_MAX_AGE = 60 * 60 * 24 * 14

KEYWORD = 'Bearer'


def issue_token(user):
    """
    Sign a token for a user.

    The last eight characters of the password hash ride along as a version
    tag. They are not a secret - the token is signed with SECRET_KEY, not
    encrypted - but they change when the password does, which is what makes
    "change your password" log every other device out.
    """
    return signing.dumps(
        {'uid': user.pk, 'pw': user.password_hash[-8:]},
        salt=TOKEN_SALT,
    )


def read_token(token):
    """
    The user a token names, or None if it is expired, tampered with or stale.

    Every failure returns None rather than raising: the caller cannot act
    differently on any of them, and telling a client which one it was says
    more than it should.
    """
    try:
        payload = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
    except signing.BadSignature:
        return None

    user = AppUser.objects.filter(pk=payload.get('uid'), is_active=True).first()
    if user is None:
        return None

    # The password changed since this token was issued.
    if payload.get('pw') != user.password_hash[-8:]:
        return None

    return user


class BearerTokenAuthentication(BaseAuthentication):
    """
    Reads `Authorization: Bearer <token>`.

    Set as the project-wide default in settings, so every app gets it without
    importing anything from here. A view opts into *requiring* it with DRF's
    own `IsAuthenticated`, which is why no booking module depends on this one.

    Returning None rather than raising when the header is absent is what lets
    search and quote endpoints stay open to a visitor who has not signed in.
    """

    keyword = KEYWORD

    def authenticate(self, request):
        header = get_authorization_header(request).split()

        if not header or header[0].lower() != self.keyword.lower().encode():
            return None

        if len(header) == 1:
            raise AuthenticationFailed('No token was sent with the Bearer header.')
        if len(header) > 2:
            raise AuthenticationFailed('The Bearer header should hold one token.')

        try:
            token = header[1].decode()
        except UnicodeError:
            raise AuthenticationFailed('That token is not readable.')

        user = read_token(token)
        if user is None:
            raise AuthenticationFailed('That session has expired. Sign in again.')

        return user, token

    def authenticate_header(self, request):
        """
        Returning a value here is what makes DRF answer 401 rather than 403 on
        an anonymous request, which is the difference between the front end
        offering a sign-in and showing "forbidden".
        """
        return self.keyword


def token_lifetime_seconds():
    """Exposed so the login response can tell a client when to stop trying."""
    return getattr(settings, 'AUTH_TOKEN_MAX_AGE', TOKEN_MAX_AGE)
