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
from .models import StudentLocation, RoadSegment
from .serializers import StudentLocationSerializer


# ─── Auth ────────────────────────────────────────────────────────────────────

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { "username": "2116230101001", "password": "student123" }
    """
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    student_password = getattr(settings, 'PORTAL_STUDENT_PASSWORD', 'student123')
    if password == student_password and username:
        request.session['portal_user'] = username
        request.session.save()
        return Response({'username': username})

    return Response(
        {'detail': 'Invalid username or password.'},
        status=status.HTTP_401_UNAUTHORIZED,
    )


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """POST /api/auth/logout/"""
    request.session.flush()
    return Response({'detail': 'Logged out.'})


@csrf_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def me_view(request):
    """
    GET /api/auth/me/
    Returns the current portal user if they have an active session.
    """
    portal_user = request.session.get('portal_user')
    if portal_user:
        return Response({'username': portal_user})
    return Response({'detail': 'Not authenticated.'}, status=status.HTTP_401_UNAUTHORIZED)


# ─── Middleware helper ────────────────────────────────────────────────────────

def _require_portal_auth(request):
    """Returns the portal username or None."""
    return request.session.get('portal_user')


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
