from django.contrib import admin
from .models import StudentLocation, Student, Department, LoginConfig


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

    def save_model(self, request, obj, form, change):
        from collection.views import get_default_password

        super().save_model(request, obj, form, change)
        if not change or not obj.check_password(get_default_password(obj.admission_number)):
            obj.set_password(get_default_password(obj.admission_number))
            obj.save(update_fields=['password'])

    def has_delete_permission(self, request, obj=None):
        return True


@admin.register(LoginConfig)
class LoginConfigAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'is_open', 'short_note']
    fieldsets = (
        ('Login Controls', {
            'fields': ('is_open', 'note_message')
        }),
        ('Bypass Settings', {
            'fields': ('bypass_emails',),
            'description': 'Emails listed here can log in even when "Login Open?" is unchecked.',
        }),
    )

    def short_note(self, obj):
        return (obj.note_message[:60] + '...') if len(obj.note_message) > 60 else obj.note_message
    short_note.short_description = 'Notice Message'

    def has_add_permission(self, request):
        if LoginConfig.objects.exists():
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False
