"""Chat routes, mounted at `/api/chat/` by config.urls."""
from django.urls import path

from chat import views

app_name = 'chat'

urlpatterns = [
    path('', views.ChatView.as_view(), name='ask'),
]
