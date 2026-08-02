from datetime import timedelta

from django.db import models
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone


class Department(models.Model):
    """
    Stores academic departments.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ['code']
        verbose_name = 'Department'
        verbose_name_plural = 'Departments'

    def __str__(self):
        return f'{self.code} - {self.name}'


class Student(models.Model):
    """
    Stores a student account that can log into the portal.
    Only email and admission_number are required fields.
    Password is auto-set to the full admission_number.
    """
    admission_number = models.CharField(max_length=20, unique=True)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128)  # Store bcrypt hash

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['admission_number']
        verbose_name = 'Student'
        verbose_name_plural = 'Students'

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    def has_marked_location(self):
        return StudentLocation.objects.filter(roll_no=self.admission_number).exists()

    def __str__(self):
        return f'{self.admission_number} – {self.email}'


class PasswordReset(models.Model):
    CODE_TTL = timedelta(minutes=15)
    MAX_ATTEMPTS = 5

    student = models.OneToOneField(Student, on_delete=models.CASCADE, related_name='password_reset')
    code = models.CharField(max_length=10)
    new_password = models.CharField(max_length=128)
    created_at = models.DateTimeField(default=timezone.now)
    attempts = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        if self.new_password and not self.new_password.startswith('bcrypt') and not self.new_password.startswith('pbkdf2'):
            self.new_password = make_password(self.new_password)
        super().save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.created_at + self.CODE_TTL

    def __str__(self):
        return f'Password reset for {self.student.email}'


class StudentLocation(models.Model):
    """
    Stores a single student boarding-location submission from the portal.
    """
    roll_no = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120, blank=True, default='')
    lat = models.FloatField()
    lng = models.FloatField()
    address = models.TextField(blank=True, default='')
    submitted_by = models.CharField(max_length=60)           # portal username
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['roll_no']
        verbose_name = 'Student Location'
        verbose_name_plural = 'Student Locations'

    def __str__(self):
        return f'{self.roll_no} – {self.name}'


class RoadSegment(models.Model):
    """
    A single road LineString from the SelectiveRoadTopology dataset.
    coordinates is stored as a JSON list of [lng, lat] pairs (GeoJSON order).
    """
    osm_id = models.BigIntegerField(unique=True)
    name = models.CharField(max_length=200, blank=True, default='')
    highway = models.CharField(max_length=60, blank=True, default='')
    coordinates = models.JSONField()          # [[lng, lat], [lng, lat], ...]

    class Meta:
        ordering = ['id']
        verbose_name = 'Road Segment'
        verbose_name_plural = 'Road Segments'

    def __str__(self):
        return f'{self.highway} – {self.name or self.osm_id}'


class LoginConfig(models.Model):
    """
    Singleton model to control student login access.
    Managed via Django Admin — only one row should ever exist.
    """
    is_open = models.BooleanField(
        default=False,
        verbose_name="Login Open?",
        help_text="Check to open student login. Uncheck to close it."
    )
    note_message = models.TextField(
        default="Student login is currently closed. Please check back later or contact support.",
        verbose_name="Notice Message",
        help_text="Message displayed to students when login is closed."
    )
    bypass_emails = models.TextField(
        blank=True,
        default="",
        verbose_name="Bypass Emails",
        help_text="Enter emails (one per line or comma-separated) allowed to log in even when login is closed."
    )

    class Meta:
        verbose_name = "Login Configuration"
        verbose_name_plural = "Login Configuration"

    def __str__(self):
        return f"Login Status: {'OPEN' if self.is_open else 'CLOSED'}"

    @classmethod
    def get_solo(cls):
        """Retrieve or create the single configuration instance."""
        obj, _ = cls.objects.get_or_create(id=1)
        return obj

    def get_bypass_list(self):
        """Return a list of normalised bypass email addresses."""
        if not self.bypass_emails:
            return []
        raw_list = self.bypass_emails.replace(',', '\n').splitlines()
        return [e.strip().lower() for e in raw_list if e.strip()]

    def is_email_allowed(self, email: str) -> bool:
        """Return True if login is open, or if the email is in the bypass list."""
        if self.is_open:
            return True
        if not email:
            return False
        return email.strip().lower() in self.get_bypass_list()
