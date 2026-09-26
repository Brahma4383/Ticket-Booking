"""
URL configuration for config project.

Everything the front end calls lives under `/api/`, one include per travel
mode, plus `/api/auth/` for the site's own accounts and `/api/payments/`
for paying for what they book. Every travel mode the front end offers is
wired up.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/contact/', include('contact.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/payments/', include('payments.urls')),
    path('api/bus/', include('bus.urls')),
    path('api/train/', include('train.urls')),
    path('api/plane/', include('plane.urls')),
    path('api/hotel/', include('hotel.urls')),
    path('api/cab/', include('cab.urls')),
]
