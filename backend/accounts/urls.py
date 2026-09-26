"""
Accounts routes, mounted at `/api/auth/` by config.urls.

No logout route: the token is signed rather than stored, so signing out is the
client dropping it. See views.py.
"""
from django.urls import path

from accounts import views

app_name = 'accounts'

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('me/', views.MeView.as_view(), name='me'),
    # Forgotten passwords: ask for a link, check it, use it.
    path(
        'password/forgot/',
        views.ForgotPasswordView.as_view(), name='password-forgot',
    ),
    path(
        'password/reset/check/',
        views.ResetPasswordCheckView.as_view(), name='password-reset-check',
    ),
    path(
        'password/reset/',
        views.ResetPasswordView.as_view(), name='password-reset',
    ),
    # Above nothing in particular, but kept next to `me/` because it is
    # the same subject: what this account is and what it holds.
    path(
        'me/bookings/',
        views.MyBookingsView.as_view(), name='my-bookings',
    ),
    # Cancelling is done from the ticket list, so it hangs off the same path
    # rather than off each travel module's own bookings route.
    path(
        'me/bookings/<str:mode>/<str:reference>/cancel/',
        views.CancelBookingView.as_view(), name='cancel-booking',
    ),
]
