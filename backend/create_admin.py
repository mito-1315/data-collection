"""
create_admin.py — Creates a DJANGO BACKEND superuser.

╔══════════════════════════════════════════════════════════════════════════╗
║  IMPORTANT: Two separate admin systems exist in this project.           ║
║                                                                          ║
║  1. DJANGO BACKEND ADMIN  (this script creates this user)               ║
║     - Accessible at: http://localhost:8000/admin/                       ║
║     - Uses: Django's auth.User model (PBKDF2 password hashing)          ║
║     - Purpose: Raw DB access, road segment management, system admin      ║
║                                                                          ║
║  2. NEXT.JS FRONTEND PORTAL ADMIN                                        ║
║     - Accessible at: http://localhost:3000/admin/                       ║
║     - Uses: JWT token with 'role: admin' (stored in auth.User with      ║
║             is_staff=True). Created via this SAME script.               ║
║     - Purpose: Student management (add/remove students), view entries   ║
║                                                                          ║
║  A user created here with is_staff=True can log into BOTH admin panels. ║
║  The Next.js portal recognises them by the 'role: admin' claim in JWT.  ║
╚══════════════════════════════════════════════════════════════════════════╝

Usage:
    python create_admin.py

Configure via environment variables (or .env file):
    PORTAL_ADMIN_USERNAME   — defaults to 'admin'
    PORTAL_ADMIN_EMAIL      — defaults to 'admin@example.com'
    PORTAL_ADMIN_PASSWORD   — defaults to 'admin123'  ← CHANGE THIS IN PRODUCTION
"""

import os
import django

# Setup django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model

def create_admin():
    User = get_user_model()
    username = os.environ.get('PORTAL_ADMIN_USERNAME', 'admin')
    email = os.environ.get('PORTAL_ADMIN_EMAIL', 'admin@example.com')
    password = os.environ.get('PORTAL_ADMIN_PASSWORD', 'admin123')

    if User.objects.filter(username=username).exists():
        print(f"Admin user '{username}' already exists. Updating password and email...")
        user = User.objects.get(username=username)
        user.email = email
        user.set_password(password)
        user.save()
        print("Admin user updated successfully.")
        return

    print(f"Creating superuser '{username}'...")
    User.objects.create_superuser(username, email, password)
    print("Admin user created successfully.")
    print(f"  Django admin:  http://localhost:8000/admin/  (username: {username})")
    print(f"  Portal admin:  http://localhost:3000/admin/  (email: {email})")

if __name__ == "__main__":
    create_admin()
