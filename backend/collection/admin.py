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
    directly from this panel. Passwords are auto-set from the student's email
    (emailprefix@123) and are managed by the application logic.
    """
    list_display = ['roll_number', 'name', 'email', 'department', 'created_at']
    search_fields = ['roll_number', 'name', 'email', 'department']
    list_filter = ['department']
    ordering = ['roll_number']
    readonly_fields = ['password', 'created_at']
    # Exclude password from add/change form since it's managed by code
    exclude = []

    def has_delete_permission(self, request, obj=None):
        return True
