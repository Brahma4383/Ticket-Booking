"""
Train module routes, mounted at `/api/train/` by config.urls.

`trains/<id>/` is matched by an int converter, so it cannot swallow any of the
sibling paths. The PNR is a bare string: ten digits, matched as written.
"""
from django.urls import path

from train import views

app_name = 'train'

urlpatterns = [
    path('quotas/', views.QuotaListView.as_view(), name='quota-list'),
    path('trains/', views.TrainListView.as_view(), name='train-list'),
    path(
        'trains/<int:train_id>/',
        views.TrainDetailView.as_view(), name='train-detail',
    ),
    path('quote/', views.QuoteView.as_view(), name='quote'),
    path('bookings/', views.BookingCreateView.as_view(), name='booking-create'),
    path(
        'bookings/<str:pnr>/',
        views.BookingDetailView.as_view(), name='booking-detail',
    ),
]
