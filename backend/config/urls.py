"""config URL configuration."""
from django.urls import path, include

urlpatterns = [
    # Removed Django admin to prevent confusion with Next.js frontend admin
    path('api/', include('collection.urls')),
]
