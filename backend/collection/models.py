from django.db import models


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
