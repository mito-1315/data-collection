from rest_framework import serializers
from .models import StudentLocation, Student


class StudentSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = ['id', 'admission_number', 'email', 'status', 'lat', 'lng']
        read_only_fields = ['id', 'status', 'lat', 'lng']

    def _get_location(self, obj):
        if not hasattr(obj, '_cached_location'):
            obj._cached_location = StudentLocation.objects.filter(roll_no=obj.admission_number).first()
        return obj._cached_location

    def get_status(self, obj):
        return 'FILLED' if self._get_location(obj) else 'UNFILLED'

    def get_lat(self, obj):
        loc = self._get_location(obj)
        return loc.lat if loc else None

    def get_lng(self, obj):
        loc = self._get_location(obj)
        return loc.lng if loc else None


class StudentLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentLocation
        fields = [
            'id',
            'roll_no',
            'name',
            'lat',
            'lng',
            'address',
            'submitted_by',
            'submitted_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'submitted_by', 'submitted_at', 'updated_at']
