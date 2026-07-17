from django.urls import path
from . import views

urlpatterns = [
    # ── Auth ──────────────────────────────────────────────────────
    path('auth/login/',  views.login_view,  name='auth-login'),
    path('auth/logout/', views.logout_view, name='auth-logout'),
    path('auth/me/',     views.me_view,     name='auth-me'),

    # ── Student location entries ───────────────────────────────────
    path('entries/',           views.student_location_list,   name='entry-list'),
    path('entries/export/',    views.export_csv,              name='entry-export'),
    path('entries/<int:pk>/',  views.student_location_detail, name='entry-detail'),

    # ── Stats ──────────────────────────────────────────────────────
    path('stats/',             views.stats_view,              name='stats'),
]
