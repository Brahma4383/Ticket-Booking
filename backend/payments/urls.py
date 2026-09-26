"""
Payment routes, mounted at `/api/payments/` by config.urls.

`<mode>/<reference>/` and `<transaction_ref>/` cannot collide: one has two
path segments and the other one.
"""
from django.urls import path

from payments import views

app_name = 'payments'

urlpatterns = [
    path('', views.TransactionListView.as_view(), name='transaction-list'),
    path(
        '<str:mode>/<str:reference>/',
        views.PayView.as_view(), name='pay',
    ),
    path(
        '<str:transaction_ref>/',
        views.TransactionDetailView.as_view(), name='transaction-detail',
    ),
]
