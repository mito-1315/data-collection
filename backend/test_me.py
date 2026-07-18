import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from collection.models import Student
student = Student.objects.first()
from rest_framework_simplejwt.tokens import RefreshToken
token = RefreshToken()
token['user_id'] = f'student_{student.id}'
token['email'] = student.email
token['role'] = 'student'
access_token = str(token.access_token)
import urllib.request
from urllib.error import HTTPError
req = urllib.request.Request('http://127.0.0.1:8000/api/auth/me/')
req.add_header('Authorization', f'Bearer {access_token}')
try:
    with urllib.request.urlopen(req) as f:
        pass
except HTTPError as e:
    import re
    html = e.read().decode('utf-8')
    match = re.search(r'(?s)<textarea id=\"traceback_area\"[^>]*>(.*?)</textarea>', html)
    if match:
        print(match.group(1).replace('&quot;', '\"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))
    else:
        print('No traceback found')
