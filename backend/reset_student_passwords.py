"""
reset_student_passwords.py
Resets ALL existing student passwords to the default derived from email.
Rule: emailprefix@123  (e.g. mithesh@gmail.com → mithesh@123)

Run once after deploying the new authentication logic:
    python reset_student_passwords.py

This is safe to run multiple times.
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from collection.models import Student

def get_default_password(email: str) -> str:
    prefix = email.split('@')[0] if '@' in email else email
    return f"{prefix}@123"

def reset_all_passwords():
    students = Student.objects.all()
    print(f"Found {students.count()} students. Resetting passwords...")
    updated = 0
    for student in students:
        default_pwd = get_default_password(student.email)
        student.set_password(default_pwd)
        student.save(update_fields=['password'])
        updated += 1
        print(f"  [OK] {student.email} -> {default_pwd}")
    print(f"\nDone. {updated} student passwords reset.")

if __name__ == "__main__":
    reset_all_passwords()
