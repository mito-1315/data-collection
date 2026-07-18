import csv

from django.conf import settings
from django.contrib.auth import login, logout
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from django.http import JsonResponse
from django.contrib.auth import authenticate, login
from .models import StudentLocation, RoadSegment, Student
from .serializers import StudentLocationSerializer, StudentSerializer


from rest_framework_simplejwt.tokens import RefreshToken
import jwt

# ─── Auth ────────────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { "email": "admin@example.com", "password": "password" }
    """
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')

    if not email or not password:
        return Response({'detail': 'Email and password required.'}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Check if admin
    from django.contrib.auth.models import User
    try:
        admin_user = User.objects.get(email=email)
        if admin_user.check_password(password) and admin_user.is_staff:
            token = RefreshToken.for_user(admin_user)
            token['role'] = 'admin'
            token['email'] = email
            return Response({
                'email': email,
                'role': 'admin',
                'access': str(token.access_token),
                'refresh': str(token)
            })
    except User.DoesNotExist:
        pass

    # 2. Check if student
    try:
        student = Student.objects.get(email=email)
        if student.check_password(password):
            token = RefreshToken()
            token['user_id'] = f"student_{student.id}"
            token['email'] = email
            token['role'] = 'student'
            return Response({
                'email': email,
                'role': 'student',
                'access': str(token.access_token),
                'refresh': str(token)
            })
    except Student.DoesNotExist:
        pass

    return Response(
        {'detail': 'Invalid email or password.'},
        status=status.HTTP_401_UNAUTHORIZED,
    )


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """POST /api/auth/logout/"""
    # JWTs are stateless, but we can return success.
    return Response({'detail': 'Logged out.'})


def get_jwt_payload(request):
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            # SimpleJWT uses settings.SECRET_KEY by default
            return jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        except Exception:
            pass
    return None


@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def me_view(request):
    """
    GET /api/auth/me/
    Returns the current portal user if they have a valid JWT.
    """
    payload = get_jwt_payload(request)
    if payload:
        return Response({'email': payload.get('email'), 'role': payload.get('role')})
    return Response({'detail': 'Not authenticated.'}, status=status.HTTP_401_UNAUTHORIZED)


# ─── Middleware helper ────────────────────────────────────────────────────────

def _require_portal_auth(request):
    """Returns the portal email or None."""
    payload = get_jwt_payload(request)
    if payload:
        return payload.get('email')
    return None


# ─── Student Location CRUD ────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def student_location_list(request):
    """
    GET  /api/entries/        – list all submissions (portal auth required)
    POST /api/entries/        – create a new submission (portal auth required)
    """
    portal_user = _require_portal_auth(request)
    if not portal_user:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        entries = StudentLocation.objects.all()
        serializer = StudentLocationSerializer(entries, many=True)
        return Response(serializer.data)

    # POST
    serializer = StudentLocationSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(submitted_by=portal_user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([AllowAny])
def student_location_detail(request, pk):
    """
    GET    /api/entries/<pk>/  – retrieve one entry
    PUT    /api/entries/<pk>/  – update (overwrite) an entry
    DELETE /api/entries/<pk>/  – delete an entry
    """
    portal_user = _require_portal_auth(request)
    if not portal_user:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        entry = StudentLocation.objects.get(pk=pk)
    except StudentLocation.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(StudentLocationSerializer(entry).data)

    if request.method == 'PUT':
        serializer = StudentLocationSerializer(entry, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    entry.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─── CSV Export ───────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def export_csv(request):
    """
    GET /api/entries/export/
    Streams all entries as a CSV file download.
    """
    portal_user = _require_portal_auth(request)
    if not portal_user:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="student_locations.csv"'

    writer = csv.writer(response)
    writer.writerow(['Roll No', 'Name', 'Lat', 'Lng', 'Pref Boarding Address', 'Submitted By', 'Submitted At'])

    for entry in StudentLocation.objects.all():
        writer.writerow([
            entry.roll_no,
            entry.name,
            entry.lat,
            entry.lng,
            entry.address,
            entry.submitted_by,
            entry.submitted_at.strftime('%Y-%m-%d %H:%M:%S'),
        ])

    return response


# ─── Stats ───────────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def stats_view(request):
    """GET /api/stats/ – basic counts for a dashboard."""
    portal_user = _require_portal_auth(request)
    if not portal_user:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    return Response({
        'total_entries': StudentLocation.objects.count(),
        'total_road_segments': RoadSegment.objects.count(),
    })


# ─── Road Segments ────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def roads_view(request):
    """
    GET /api/roads/
    Returns all road polyline coordinates as a lightweight JSON list.
    No auth required — data is public bus route geometry.
    Response: { "segments": [ [[lng,lat], ...], ... ] }
    """
    segments = list(
        RoadSegment.objects.values_list('coordinates', flat=True)
    )
    return JsonResponse({'segments': segments})


@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def departments_list(request):
    """
    GET /api/departments/
    Returns unique departments from students.
    """
    deps = Student.objects.values_list('department', flat=True).distinct()
    deps = [d for d in deps if d]
    return JsonResponse({'departments': deps})


def is_admin_authorized(request):
    payload = get_jwt_payload(request)
    return payload is not None and payload.get('role') == 'admin'


# ─── Student Management ────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def student_list(request):
    """
    GET  /api/students/
    POST /api/students/ (single create)
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        students = Student.objects.all()
        serializer = StudentSerializer(students, many=True)
        return Response(serializer.data)

    # POST (Single Add)
    serializer = StudentSerializer(data=request.data)
    if serializer.is_valid():
        raw_pwd = request.data.get('password')
        if not raw_pwd:
            return Response({'detail': 'Password required.'}, status=status.HTTP_400_BAD_REQUEST)
        student = serializer.save()
        student.set_password(raw_pwd)
        student.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@csrf_exempt
@api_view(['PUT', 'DELETE'])
@permission_classes([AllowAny])
def student_detail(request, pk):
    """
    PUT    /api/students/<pk>/
    DELETE /api/students/<pk>/
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        student = Student.objects.get(pk=pk)
    except Student.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PUT':
        serializer = StudentSerializer(student, data=request.data, partial=True)
        if serializer.is_valid():
            raw_pwd = request.data.get('password')
            student = serializer.save()
            if raw_pwd:
                student.set_password(raw_pwd)
                student.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    student.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def student_bulk(request):
    """
    POST /api/students/bulk/
    Receives JSON array of students to create.
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    students_data = request.data
    if not isinstance(students_data, list):
        return Response({'detail': 'Expected a list of objects.'}, status=status.HTTP_400_BAD_REQUEST)

    created_count = 0
    errors = []
    
    for item in students_data:
        serializer = StudentSerializer(data=item)
        if serializer.is_valid():
            raw_pwd = item.get('password')
            if not raw_pwd:
                errors.append({'roll_number': item.get('roll_number'), 'detail': 'Missing password.'})
                continue
            student = serializer.save()
            student.set_password(raw_pwd)
            student.save()
            created_count += 1
        else:
            errors.append({'roll_number': item.get('roll_number'), 'errors': serializer.errors})

    return Response({'created': created_count, 'errors': errors})


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def student_bulk_delete(request):
    """
    POST /api/students/bulk_delete/
    Receives { "ids": [1, 2, 3] }
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    ids = request.data.get('ids', [])
    if not ids:
        return Response({'detail': 'No IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)

    deleted_count, _ = Student.objects.filter(id__in=ids).delete()
    return Response({'deleted': deleted_count})
