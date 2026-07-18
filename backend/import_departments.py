"""
import_departments.py
Reads departments.json and inserts them into the Department table.
"""
import os
import json
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from collection.models import Department

def import_departments():
    filepath = os.path.join(os.path.dirname(__file__), 'departments.json')
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    departments = data.get('departments', [])
    created_count = 0
    updated_count = 0

    for dep in departments:
        code = dep.get('code')
        name = dep.get('name')
        
        obj, created = Department.objects.update_or_create(
            code=code,
            defaults={'name': name}
        )
        if created:
            created_count += 1
        else:
            updated_count += 1
            
    print(f"Done. Created {created_count} and updated {updated_count} departments.")

if __name__ == '__main__':
    import_departments()
