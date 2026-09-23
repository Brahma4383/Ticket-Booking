"""
Cab module routes, mounted at `/api/cab/` by config.urls.

The booking id is a bare string so a lowercase one resolves; nothing else here
takes a path parameter.
"""
from django.urls import path

from cab import views

app_name = 'cab'

urlpatterns = [
    path('extras/', views.ExtraListView.as_view(), name='extra-list'),
    path('estimate/', views.EstimateView.as_view(), name='estimate'),
    path('cabs/', views.CabListView.as_view(), name='cab-list'),
    path('quote/', views.QuoteView.as_view(), name='quote'),
    path('bookings/', views.BookingCreateView.as_view(), name='booking-create'),
    path(
        'bookings/<str:booking_id>/',
        views.BookingDetailView.as_view(), name='booking-detail',
    ),
]
