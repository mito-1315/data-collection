from django.contrib import admin
from .models import StudentLocation


@admin.register(StudentLocation)
class StudentLocationAdmin(admin.ModelAdmin):
    list_display = ['roll_no', 'name', 'lat', 'lng', 'submitted_by', 'submitted_at']
    search_fields = ['roll_no', 'name', 'address']
    list_filter = ['submitted_by']
    ordering = ['roll_no']
    readonly_fields = ['submitted_at', 'updated_at']
