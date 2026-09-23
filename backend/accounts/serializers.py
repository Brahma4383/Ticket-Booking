"""
Request validation and response shaping for the accounts endpoints.

Same split as every other module: DRF serializers validate what comes in, and
plain functions shape what goes out, in the camelCase the front end reads.
"""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def serialise_user(user):
    """
    The signed-in account.

    The password hash is not here and never will be - nothing on screen needs
    it, and a field that is not serialised cannot be leaked by accident.
    """
    return {
        'id': str(user.pk),
        'fullName': user.full_name,
        'email': user.email,
        'phone': user.phone or '',
        'emailVerified': user.email_verified,
        'phoneVerified': user.phone_verified,
        'createdAt': user.created_at.isoformat() if user.created_at else None,
    }


def serialise_session(user, token, expires_in):
    """What a successful sign-in or sign-up hands back."""
    return {
        'token': token,
        'expiresIn': expires_in,
        'user': serialise_user(user),
    }


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

class RegisterSerializer(serializers.Serializer):
    """Body of `POST /api/auth/register/`. Mirrors the sign-up form."""

    fullName = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254)
    # Ten digits, matching the `pattern` on the mobile input.
    phone = serializers.RegexField(r'^\d{10}$', max_length=15)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        """
        Runs Django's own AUTH_PASSWORD_VALIDATORS - length, common passwords,
        all-numeric. Better than a hand-rolled rule, and already configured.
        """
        try:
            validate_password(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages))
        return value


class LoginSerializer(serializers.Serializer):
    """
    Body of `POST /api/auth/login/`.

    `identifier` because the form's own label is "Email or mobile" - a
    traveller who signed up with a phone number should be able to use it.
    """

    identifier = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate_identifier(self, value):
        return value.strip()
