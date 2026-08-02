"""
reset_student_passwords.py
Resets ALL existing student passwords to their full admission_number.
Rule: password = full admission_number  (e.g. '01202519421')

Run after deploy or import:
    python reset_student_passwords.py
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from collection.models import Student


def get_default_password(admission_number: str) -> str:
    return admission_number.strip()


def reset_all_passwords():
    students = Student.objects.all()
    print(f'Found {students.count()} students. Resetting passwords...')
    updated = 0
    for student in students:
        default_pwd = get_default_password(student.admission_number)
        student.set_password(default_pwd)
        student.save(update_fields=['password'])
        updated += 1
    print(f'Done. {updated} student passwords reset to admission number.')


if __name__ == '__main__':
    reset_all_passwords()
