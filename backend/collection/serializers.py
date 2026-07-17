from rest_framework import serializers
from .models import StudentLocation


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
