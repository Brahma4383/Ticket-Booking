"""
Plane module routes, mounted at `/api/plane/` by config.urls.

The order matters: `flights/<id>/seats/` has to be matched before
`flights/<id>/` would swallow it. The reference is a bare string so a
lowercase one still resolves.
"""
from django.urls import path

from plane import views

app_name = 'plane'

urlpatterns = [
    path('addons/', views.AddOnListView.as_view(), name='addon-list'),
    path('flights/', views.FlightListView.as_view(), name='flight-list'),
    path(
        'flights/<int:flight_id>/seats/',
        views.CabinView.as_view(), name='flight-seats',
    ),
    path(
        'flights/<int:flight_id>/',
        views.FlightDetailView.as_view(), name='flight-detail',
    ),
    path('quote/', views.QuoteView.as_view(), name='quote'),
    path('bookings/', views.BookingCreateView.as_view(), name='booking-create'),
    path(
        'bookings/<str:reference>/',
        views.BookingDetailView.as_view(), name='booking-detail',
    ),
]
