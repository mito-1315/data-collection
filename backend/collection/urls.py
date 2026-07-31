from django.urls import path
from . import views

urlpatterns = [
    # ── Auth ──────────────────────────────────────────────────────
    path('auth/login/',         views.login_view,        name='auth-login'),
    path('auth/login-status/',  views.login_status_view, name='auth-login-status'),
    path('auth/logout/',        views.logout_view,        name='auth-logout'),
    path('auth/me/',            views.me_view,            name='auth-me'),
    path('auth/my-entry/',      views.my_entry_view,      name='auth-my-entry'),

    # ── Student location entries ───────────────────────────────────
    path('entries/',           views.student_location_list,   name='entry-list'),
    path('entries/export/',    views.export_csv,              name='entry-export'),
    path('entries/<int:pk>/',  views.student_location_detail, name='entry-detail'),

    # ── Stats ──────────────────────────────────────────────────────
    path('stats/',             views.stats_view,              name='stats'),

    # ── Road segments (public) ─────────────────────────────────────
    path('roads/',             views.roads_view,              name='roads'),
    path('roads/load/',        views.load_roads_view,         name='roads-load'),

    # ── Student management ─────────────────────────────────────────
    path('students/',              views.student_list,        name='student-list'),
    path('students/bulk/',         views.student_bulk,        name='student-bulk'),
    path('students/bulk_delete/',  views.student_bulk_delete, name='student-bulk-delete'),
    path('students/<int:pk>/',     views.student_detail,      name='student-detail'),

    # ── Departments ────────────────────────────────────────────────
    path('departments/',           views.departments_list,    name='departments-list'),
]
