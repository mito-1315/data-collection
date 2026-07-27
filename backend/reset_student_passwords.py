"""
reset_student_passwords.py
Resets ALL existing student passwords to the last 4 digits of their admission_number.
Rule: last 4 digits of admission_number  (e.g. '230701184' → '1184')

Run once after deploying the new authentication logic:
    python reset_student_passwords.py

This is safe to run multiple times.
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from collection.models import Student


def get_default_password(admission_number: str) -> str:
    digits = admission_number.strip()
    return digits[-4:] if len(digits) >= 4 else digits


def reset_all_passwords():
    students = Student.objects.all()
    print(f"Found {students.count()} students. Resetting passwords...")
    updated = 0
    for student in students:
        default_pwd = get_default_password(student.admission_number)
        student.set_password(default_pwd)
        student.save(update_fields=['password'])
        updated += 1
        print(f"  [OK] {student.email} (admission: {student.admission_number}) -> password: {default_pwd}")
    print(f"\nDone. {updated} student passwords reset.")


if __name__ == "__main__":
    reset_all_passwords()
