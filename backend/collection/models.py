from django.db import models
from django.contrib.auth.hashers import make_password, check_password


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
    Password is auto-set to the last 4 digits of the admission_number.
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


class StudentLocation(models.Model):
    """
    Stores a single student boarding-location submission from the portal.
    """
    roll_no = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120)
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
