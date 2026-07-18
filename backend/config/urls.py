"""config URL configuration.

Two separate admin systems:
  - /admin/  → Django built-in admin panel (for Django superusers / backend staff only).
               Uses Django's auth.User with PBKDF2 password hashing.
               Access this to manage Django internals, view raw data, etc.

  - /admin/users  → Next.js frontend admin portal (accessed via http://localhost:3000/admin).
                    Uses custom JWT-based authentication with the Student model.
                    This is the portal admin staff should use for student management.

These two admin systems are COMPLETELY SEPARATE — different users, different passwords,
different auth mechanisms.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Django built-in admin — for backend Django superusers only
    path('admin/', admin.site.urls),
    # Frontend API
    path('api/', include('collection.urls')),
]
