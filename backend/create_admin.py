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
        print(f"Admin user '{username}' already exists.")
        # Optionally update password if needed:
        # user = User.objects.get(username=username)
        # user.set_password(password)
        # user.save()
        return

    print(f"Creating superuser '{username}'...")
    User.objects.create_superuser(username, email, password)
    print("Admin user created successfully.")

if __name__ == "__main__":
    create_admin()
