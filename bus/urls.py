"""
Bus module routes, mounted at `/api/bus/` by config.urls.

The order matters: `trips/<id>/seats/` has to be matched before `trips/<id>/`
would swallow it, and the PNR converter is a bare string so a lowercase
reference still resolves.
"""
from django.urls import path

from bus import views

app_name = 'bus'

urlpatterns = [
    path('trips/', views.TripListView.as_view(), name='trip-list'),
    path(
        'trips/<int:trip_id>/seats/',
        views.SeatMapView.as_view(), name='trip-seats',
    ),
    path(
        'trips/<int:trip_id>/',
        views.TripDetailView.as_view(), name='trip-detail',
    ),
    path('quote/', views.QuoteView.as_view(), name='quote'),
    path('bookings/', views.BookingCreateView.as_view(), name='booking-create'),
    path(
        'bookings/<str:reference>/',
        views.BookingDetailView.as_view(), name='booking-detail',
    ),
]
