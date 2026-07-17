from rest_framework import serializers
from rest_framework import serializers
from .models import StudentLocation, Student

class StudentSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = ['id', 'roll_number', 'name', 'email', 'department', 'status']
        read_only_fields = ['id', 'status']

    def get_status(self, obj):
        return 'FILLED' if obj.has_marked_location() else 'UNFILLED'



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
