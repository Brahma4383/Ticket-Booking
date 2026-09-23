"""Contact routes, mounted at `/api/contact/` by config.urls."""
from django.urls import path

from contact import views

app_name = 'contact'

urlpatterns = [
    path('', views.ContactView.as_view(), name='send'),
]
