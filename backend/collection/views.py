import csv
import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import login, logout
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from django.utils.crypto import constant_time_compare
from django.utils.crypto import get_random_string

from .models import StudentLocation, RoadSegment, Student, LoginConfig, PasswordReset
from .serializers import StudentLocationSerializer, StudentSerializer
from .throttling import LoginIPThrottle, LoginEmailThrottle, PasswordResetIPThrottle, PasswordResetEmailThrottle
from .email_utils import send_email


from rest_framework_simplejwt.tokens import RefreshToken
import jwt


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_default_password(admission_number: str) -> str:
    """Password is the full admission number."""
    return admission_number.strip()


def _admission_password_candidates(raw_password: str) -> list[str]:
    """Accept admission numbers with or without a leading zero."""
    pwd = raw_password.strip()
    if not pwd:
        return []
    stripped = pwd.lstrip('0') or '0'
    candidates = [pwd]
    if stripped != pwd:
        candidates.append(stripped)
    if len(stripped) == 10:
        candidates.append(stripped.zfill(11))
    return candidates


def check_student_password(student, raw_password: str) -> bool:
    for candidate in _admission_password_candidates(raw_password):
        if student.check_password(candidate):
            return True
    return False


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


def admin_only(request):
    """Guard for endpoints exposing every student's data.

    Returns an error Response when the caller is not an admin, else None.
    A plain student token must never reach bulk reads, edits or exports —
    students read their own submission via /api/auth/my-entry/.
    """
    if not get_jwt_payload(request):
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    if not is_admin_authorized(request):
        return Response({'detail': 'Administrator access required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


# ─── Auth ─────────────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def login_status_view(request):
    """
    GET /api/auth/login-status/
    Returns the current login gate configuration:
      { is_open, note_message }
    Used by the frontend to show the notice banner. The bypass list is
    deliberately withheld — it enumerates privileged accounts. Whether a given
    email may bypass the gate is decided by the backend during login.
    """
    config = LoginConfig.get_solo()
    return Response({
        'is_open': config.is_open,
        'note_message': config.note_message,
    })


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginIPThrottle, LoginEmailThrottle])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { "email": "...", "password": "..." }
    Returns JWT access token with role ('admin' or 'student').
    Passwords:
      - Admin users: Django auth.User (PBKDF2-hashed) — set via create_admin.py / Django admin.
      - Students: full admission_number.
    """
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')

    if not email or not password:
        return Response({'detail': 'Email and password required.'}, status=status.HTTP_400_BAD_REQUEST)

    # 1. Check if admin (Django auth.User with is_staff=True)
    # Admin accounts always bypass the login gate.
    # Iterate rather than .get(): duplicate accounts sharing an email would
    # otherwise raise MultipleObjectsReturned and 500 the login endpoint.
    from django.contrib.auth.models import User
    for admin_user in User.objects.filter(email__iexact=email, is_staff=True, is_active=True):
        if admin_user.check_password(password):
            token = RefreshToken.for_user(admin_user)
            token['role'] = 'admin'
            token['email'] = email
            return Response({
                'email': email,
                'role': 'admin',
                'access': str(token.access_token),
                'refresh': str(token)
            })

    # 2. Check login gate before allowing student authentication
    config = LoginConfig.get_solo()
    if not config.is_email_allowed(email):
        return Response(
            {'detail': config.note_message, 'code': 'login_closed'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # 3. Check if student (custom Student model — password = full admission_number)
    try:
        student = Student.objects.get(email__iexact=email)
        if check_student_password(student, password):
            # Check if student has already submitted a location entry
            has_submitted = StudentLocation.objects.filter(roll_no=student.admission_number).exists()
            token = RefreshToken()
            token['user_id'] = f"student_{student.id}"
            token['email'] = student.email
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
@throttle_classes([PasswordResetIPThrottle, PasswordResetEmailThrottle])
def forgot_password_view(request):
    """
    POST /api/auth/forgot_password/
    Request reset: { email, password }
    Confirm reset: { email, token }
    """
    if request.data.get('token'):
        return _confirm_password_reset(
            request.data.get('email', ''),
            request.data.get('token', ''),
        )

    email = (request.data.get('email') or '').strip()
    password = request.data.get('password') or ''

    if not email or not password:
        return Response(
            {'detail': 'Both email and new password are required.', 'code': 'missing_credentials'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        student = Student.objects.get(email__iexact=email)
    except Student.DoesNotExist:
        return Response(
            {'detail': 'No account found with this email.', 'code': 'user_not_found'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    verification_code = get_random_string(length=8)
    reset, _ = PasswordReset.objects.get_or_create(student=student)
    reset.code = verification_code
    reset.new_password = password
    reset.created_at = timezone.now()
    reset.attempts = 0
    reset.save()

    try:
        send_email(
            subject='Password Reset — REC Transport',
            to_email=student.email,
            context={'verification_code': verification_code},
            template_name='forgot_password.html',
        )
    except Exception:
        return Response(
            {'detail': 'Could not send verification email. Please try again later.', 'code': 'email_failed'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {'detail': 'Verification code sent to your email.', 'code': 'reset_email_sent'},
        status=status.HTTP_200_OK,
    )


def _confirm_password_reset(email, token):
    invalid = Response(
        {'detail': 'Invalid or expired code.', 'code': 'invalid_code'},
        status=status.HTTP_400_BAD_REQUEST,
    )

    email = (email or '').strip()
    token = (token or '').strip()
    if not email or not token:
        return invalid

    try:
        student = Student.objects.get(email__iexact=email)
        reset = PasswordReset.objects.get(student=student)
    except (Student.DoesNotExist, PasswordReset.DoesNotExist):
        return invalid

    if reset.is_expired() or reset.attempts >= PasswordReset.MAX_ATTEMPTS:
        reset.delete()
        return invalid

    if not constant_time_compare(reset.code, token):
        reset.attempts += 1
        reset.save(update_fields=['attempts'])
        return invalid

    student.password = reset.new_password
    student.save(update_fields=['password'])
    reset.delete()

    return Response(
        {'detail': 'Password reset successful. You can now sign in.', 'code': 'reset_success'},
        status=status.HTTP_200_OK,
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
                student = Student.objects.get(email__iexact=email)
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
        student = Student.objects.get(email__iexact=email)
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
        denied = admin_only(request)
        if denied:
            return denied
        entries = StudentLocation.objects.all()
        serializer = StudentLocationSerializer(entries, many=True)
        return Response(serializer.data)

    # POST — Students can only submit once
    payload = get_jwt_payload(request)
    data = request.data.copy() if hasattr(request.data, 'copy') else request.data

    if payload and payload.get('role') == 'student':
        email = payload.get('email')
        try:
            student = Student.objects.get(email__iexact=email)
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
    denied = admin_only(request)
    if denied:
        return denied

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
    denied = admin_only(request)
    if denied:
        return denied

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="student_locations.csv"'

    writer = csv.writer(response)
    writer.writerow(['Admission No', 'Name', 'Lat', 'Lng', 'Pref Boarding Address', 'Submitted By', 'Submitted At'])

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
    denied = admin_only(request)
    if denied:
        return denied

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


from .geojson_paths import road_geojson_path
@api_view(['POST'])
@permission_classes([AllowAny])
def load_roads_view(request):
    """
    POST /api/roads/load/
    Admin-only: reads SelectiveRoadTopology.geojson from the datasets
    directory and bulk-inserts RoadSegment rows (skips existing osm_ids).
    Optionally clears existing rows first if ?clear=1 is passed.
    Response: { loaded, skipped, total_in_db }
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if not road_geojson_path().exists():
        return Response(
            {'detail': 'Road GeoJSON dataset is not available on the server.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    clear = request.query_params.get('clear', '0') == '1'
    if clear:
        RoadSegment.objects.all().delete()

    with open(road_geojson_path(), encoding='utf-8') as fh:
        data = json.load(fh)

    features = data.get('features', [])
    existing_ids = set(RoadSegment.objects.values_list('osm_id', flat=True))

    to_create = []
    skipped = 0

    for feat in features:
        geom = feat.get('geometry', {})
        if geom.get('type') != 'LineString':
            continue
        props = feat.get('properties', {}) or {}
        osm_id = props.get('osm_id')
        if osm_id is None:
            skipped += 1
            continue
        if int(osm_id) in existing_ids:
            skipped += 1
            continue
        to_create.append(RoadSegment(
            osm_id=int(osm_id),
            name=props.get('name') or '',
            highway=props.get('highway') or '',
            coordinates=geom['coordinates'],
        ))

    if to_create:
        from django.db import transaction
        with transaction.atomic():
            RoadSegment.objects.bulk_create(to_create, batch_size=500)

    return JsonResponse({
        'loaded': len(to_create),
        'skipped': skipped,
        'total_in_db': RoadSegment.objects.count(),
    })


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
    Password is NOT accepted from the request. It is auto-set to the
    full admission_number.
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
    existing = Student.objects.filter(admission_number=roll).first() or Student.objects.filter(email__iexact=email_val).first()
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

    Uses bulk_create() so the entire batch is inserted in a single SQL
    statement rather than one INSERT per student. This avoids SQLite
    'database is locked' errors when multiple parallel requests arrive.

    Returns:
      { created: int, duplicates: [{roll_number, name, email, department}], errors: [...] }
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    students_data = request.data
    if not isinstance(students_data, list):
        return Response({'detail': 'Expected a list of objects.'}, status=status.HTTP_400_BAD_REQUEST)

    # Strip password from every item upfront
    clean_items = [{k: v for k, v in item.items() if k != 'password'} for item in students_data]

    # ── Step 1: Bulk-check existing records in 2 queries (not N×2) ──────────
    incoming_rolls  = [str(item.get('admission_number', '')).strip() for item in clean_items]
    incoming_emails = [str(item.get('email', '')).strip() for item in clean_items]

    existing_rolls  = set(Student.objects.filter(admission_number__in=incoming_rolls)
                                         .values_list('admission_number', flat=True))
    existing_emails = set(Student.objects.filter(email__in=incoming_emails)
                                         .values_list('email', flat=True))

    # ── Step 2: Build Student objects in Python (zero DB hits in this loop) ──
    to_create   = []
    duplicates  = []
    errors      = []
    seen_rolls  = set(existing_rolls)   # also catch within-batch duplicates
    seen_emails = set(existing_emails)

    for item in clean_items:
        roll  = str(item.get('admission_number', '')).strip()
        email = str(item.get('email', '')).strip()

        if roll in seen_rolls or email in seen_emails:
            duplicates.append({
                'roll_number': roll,
                'name': '',
                'email': email,
                'department': '',
            })
            continue

        serializer = StudentSerializer(data=item)
        if not serializer.is_valid():
            errors.append({'admission_number': roll, 'errors': serializer.errors})
            continue

        # Build object in memory — set_password() does NOT touch the DB
        student = Student(
            email=serializer.validated_data['email'],
            admission_number=serializer.validated_data['admission_number'],
        )
        default_pwd = get_default_password(student.admission_number)
        student.set_password(default_pwd)

        to_create.append(student)
        seen_rolls.add(roll)    # prevent within-batch duplicates
        seen_emails.add(email)

    # ── Step 3: Single bulk INSERT — holds the write lock for milliseconds ───
    created_count = 0
    if to_create:
        from django.db import transaction
        with transaction.atomic():
            created_objs = Student.objects.bulk_create(to_create, batch_size=500)
            created_count = len(created_objs)

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


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def student_clear_all(request):
    """
    POST /api/students/clear_all/
    Admin-only: deletes ALL students and ALL their location entries atomically.
    Returns { deleted: int }
    """
    if not is_admin_authorized(request):
        return Response({'detail': 'Admin auth required.'}, status=status.HTTP_401_UNAUTHORIZED)

    from django.db import transaction
    with transaction.atomic():
        admission_numbers = list(Student.objects.values_list('admission_number', flat=True))
        count = Student.objects.count()
        Student.objects.all().delete()
        if admission_numbers:
            StudentLocation.objects.filter(roll_no__in=admission_numbers).delete()

    return Response({'deleted': count})
