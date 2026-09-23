"""
Hotel module routes, mounted at `/api/hotel/` by config.urls.

`stays/<id>/` is matched by an int converter, so it cannot swallow any of the
sibling paths. The booking id is a bare string so a lowercase one resolves.
"""
from django.urls import path

from hotel import views

app_name = 'hotel'

urlpatterns = [
    path('amenities/', views.AmenityListView.as_view(), name='amenity-list'),
    path('stays/', views.StayListView.as_view(), name='stay-list'),
    path(
        'stays/<int:property_id>/',
        views.StayDetailView.as_view(), name='stay-detail',
    ),
    path('quote/', views.QuoteView.as_view(), name='quote'),
    path('bookings/', views.BookingCreateView.as_view(), name='booking-create'),
    path(
        'bookings/<str:booking_id>/',
        views.BookingDetailView.as_view(), name='booking-detail',
    ),
]
