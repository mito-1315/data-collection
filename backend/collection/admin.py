from django.contrib import admin
from .models import StudentLocation, Student, Department


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['code', 'name']
    search_fields = ['code', 'name']


@admin.register(StudentLocation)
class StudentLocationAdmin(admin.ModelAdmin):
    list_display = ['roll_no', 'name', 'lat', 'lng', 'submitted_by', 'submitted_at']
    search_fields = ['roll_no', 'name', 'address']
    list_filter = ['submitted_by']
    ordering = ['roll_no']
    readonly_fields = ['submitted_at', 'updated_at']


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    """
    Django admin view for Student records.
    NOTE: The 'password' field shown here is the BCrypt hash — do NOT edit it
    directly from this panel. Passwords are auto-set to the full admission_number and are managed by the application logic.
    """
    list_display = ['admission_number', 'email', 'created_at']
    search_fields = ['admission_number', 'email']
    ordering = ['admission_number']
    readonly_fields = ['password', 'created_at']

    def has_delete_permission(self, request, obj=None):
        return True
