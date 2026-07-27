import csv

from django.conf import settings
from django.contrib.auth import login, logout
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import StudentLocation, RoadSegment, Student
from .serializers import StudentLocationSerializer, StudentSerializer


from rest_framework_simplejwt.tokens import RefreshToken
import jwt


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_default_password(admission_number: str) -> str:
    """
    Derives the default password from a student's admission number.
    Rule: last 4 digits of the admission number.
    Example: '230701184' → '1184'
    Admission number must have at least 4 digits.
    """
    digits = admission_number.strip()
    return digits[-4:] if len(digits) >= 4 else digits


def get_jwt_payload(request):
    """Manually decode our custom JWT without using DRF's authenticator."""
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            # SimpleJWT uses settings.SECRET_KEY by default
            return jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        except Exception:
            pass
    return None


def _require_portal_auth(request):
    """Returns the portal email or None."""
    payload = get_jwt_payload(request)
    if payload:
        return payload.get('email')
    return None


def is_admin_authorized(request):
    payload = get_jwt_payload(request)
    return payload is not None and payload.get('role') == 'admin'


# ─── Auth ─────────────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { "email": "...", "password": "..." }
    Returns JWT access token with role ('admin' or 'student').
    Passwords:
      - Admin users: Django auth.User (PBKDF2-hashed) — set via create_admin.py / Django admin.
      - Students: last 4 digits of their admission_number.
    """
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')

    if not email or not password:
        return Response({'detail': 'Email and password required.'}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Check if admin (Django auth.User with is_staff=True)
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

    # 2. Check if student (custom Student model — password = last 4 digits of admission_number)
    try:
        student = Student.objects.get(email=email)
        if student.check_password(password):
            # Check if student has already submitted a location entry
            has_submitted = StudentLocation.objects.filter(roll_no=student.admission_number).exists()
            token = RefreshToken()
            token['user_id'] = f"student_{student.id}"
            token['email'] = email
            token['role'] = 'student'
            return Response({
                'email': email,
                'role': 'student',
                'has_submitted': has_submitted,
                'admission_number': student.admission_number,
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
    """POST /api/auth/logout/ — JWTs are stateless; client should discard the token."""
    return Response({'detail': 'Logged out.'})


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
        email = payload.get('email')
        role = payload.get('role')
        has_submitted = False
        admission_number = None
        if role == 'student':
            try:
                student = Student.objects.get(email=email)
                has_submitted = StudentLocation.objects.filter(roll_no=student.admission_number).exists()
                admission_number = student.admission_number
            except Student.DoesNotExist:
                pass
        return Response({
            'email': email,
            'role': role,
            'has_submitted': has_submitted,
            'admission_number': admission_number,
        })
    return Response({'detail': 'Not authenticated.'}, status=status.HTTP_401_UNAUTHORIZED)


@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def my_entry_view(request):
    """
    GET /api/auth/my-entry/
    Returns the authenticated student's existing location entry, or 404 if none.
    Students can only submit once; this endpoint powers the read-only view.
    """
    payload = get_jwt_payload(request)
    if not payload:
        return Response({'detail': 'Not authenticated.'}, status=status.HTTP_401_UNAUTHORIZED)

    email = payload.get('email')
    role = payload.get('role')

    if role != 'student':
        return Response({'detail': 'Only students can access this endpoint.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        student = Student.objects.get(email=email)
    except Student.DoesNotExist:
        return Response({'detail': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        entry = StudentLocation.objects.get(roll_no=student.admission_number)
        return Response(StudentLocationSerializer(entry).data)
    except StudentLocation.DoesNotExist:
        return Response({'detail': 'No entry found.'}, status=status.HTTP_404_NOT_FOUND)


# ─── Student Location CRUD ─────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def student_location_list(request):
    """
    GET  /api/entries/ – list all submissions (portal auth required)
    POST /api/entries/ – create a new submission (portal auth required, students once only)
    """
    portal_user = _require_portal_auth(request)
    if not portal_user:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        entries = StudentLocation.objects.all()
        serializer = StudentLocationSerializer(entries, many=True)
        return Response(serializer.data)

    # POST — Students can only submit once
    payload = get_jwt_payload(request)
    data = request.data.copy() if hasattr(request.data, 'copy') else request.data

    if payload and payload.get('role') == 'student':
        email = payload.get('email')
        try:
            student = Student.objects.get(email=email)
            # Enforce one-submission rule
            if StudentLocation.objects.filter(roll_no=student.admission_number).exists():
                existing = StudentLocation.objects.get(roll_no=student.admission_number)
                return Response(
                    {'detail': 'You have already submitted your location. Submissions are permanent and cannot be changed.',
                     'entry': StudentLocationSerializer(existing).data},
                    status=status.HTTP_409_CONFLICT
                )

            # Ensure roll_no is always set to student's admission_number
            if isinstance(data, dict):
                data['roll_no'] = student.admission_number
        except Student.DoesNotExist:
            return Response({'detail': 'Student account not found.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = StudentLocationSerializer(data=data)
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


# ─── CSV Export ────────────────────────────────────────────────────────────────

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


# ─── Stats ────────────────────────────────────────────────────────────────────

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


# ─── Road Segments ─────────────────────────────────────────────────────────────

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
    Returns unique departments from the Department table.
    """
    from .models import Department
    deps = Department.objects.all().values('code', 'name')
    return JsonResponse({'departments': list(deps)})


# ─── Student Management ────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def student_list(request):
    """
    GET  /api/students/
    POST /api/students/ (single create)

    Only 'email' and 'admission_number' are required fields.
    Password is NOT accepted from the request. It is auto-derived as the
    last 4 digits of the student's admission_number.
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        students = Student.objects.all()
        serializer = StudentSerializer(students, many=True)
        return Response(serializer.data)

    # POST (Single Add) — password auto-derived from admission_number
    data = {k: v for k, v in request.data.items() if k != 'password'}

    # Check for duplicates before attempting creation
    roll = str(data.get('admission_number', '')).strip()
    email_val = str(data.get('email', '')).strip()
    existing = Student.objects.filter(admission_number=roll).first() or Student.objects.filter(email=email_val).first()
    if existing:
        return Response({
            'detail': 'Student already exists.',
            'duplicate': {
                'roll_number': existing.admission_number,
                'name': '',
                'email': existing.email,
                'department': '',
            }
        }, status=status.HTTP_409_CONFLICT)

    serializer = StudentSerializer(data=data)
    if serializer.is_valid():
        student = serializer.save()
        default_pwd = get_default_password(student.admission_number)
        student.set_password(default_pwd)
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

    Password field is ignored even if sent — passwords cannot be changed via this API.
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        student = Student.objects.get(pk=pk)
    except Student.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PUT':
        # Explicitly exclude 'password' from updates — passwords are locked
        data = {k: v for k, v in request.data.items() if k != 'password'}
        serializer = StudentSerializer(student, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    admission_number = student.admission_number
    student.delete()
    StudentLocation.objects.filter(roll_no=admission_number).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def student_bulk(request):
    """
    POST /api/students/bulk/
    Receives JSON array of students to create.

    Only 'email' and 'admission_number' are required per row.
    Password is NOT required in the payload. It is auto-derived as the
    last 4 digits of each student's admission_number.
    Any 'password' field present in the payload is silently ignored.

    Returns:
      { created: int, duplicates: [{roll_number, name, email, department}], errors: [...] }
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    students_data = request.data
    if not isinstance(students_data, list):
        return Response({'detail': 'Expected a list of objects.'}, status=status.HTTP_400_BAD_REQUEST)

    created_count = 0
    duplicates = []
    errors = []

    for item in students_data:
        # Strip any password from incoming data — we derive it ourselves
        clean_item = {k: v for k, v in item.items() if k != 'password'}

        # Check for duplicates by admission_number or email before attempting create
        roll = str(clean_item.get('admission_number', '')).strip()
        email = str(clean_item.get('email', '')).strip()
        existing = Student.objects.filter(admission_number=roll).first() or Student.objects.filter(email=email).first()
        if existing:
            duplicates.append({
                'roll_number': existing.admission_number,
                'name': '',
                'email': existing.email,
                'department': '',
            })
            continue

        serializer = StudentSerializer(data=clean_item)
        if serializer.is_valid():
            student = serializer.save()
            default_pwd = get_default_password(student.admission_number)
            student.set_password(default_pwd)
            student.save()
            created_count += 1
        else:
            errors.append({'admission_number': item.get('admission_number'), 'errors': serializer.errors})

    return Response({'created': created_count, 'duplicates': duplicates, 'errors': errors})


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

    students = Student.objects.filter(id__in=ids)
    admission_numbers = list(students.values_list('admission_number', flat=True))

    deleted_count, _ = students.delete()

    if admission_numbers:
        StudentLocation.objects.filter(roll_no__in=admission_numbers).delete()

    return Response({'deleted': deleted_count})
