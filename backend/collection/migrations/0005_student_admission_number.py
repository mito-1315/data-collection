from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Migrates Student model to use only admission_number and email.
    - Renames roll_number → admission_number (with data copy)
    - Removes name and department fields
    - Resets all passwords to last 4 digits of admission_number
    """

    dependencies = [
        ('collection', '0004_department'),
    ]

    operations = [
        # 1. Add admission_number (nullable temporarily for data copy)
        migrations.AddField(
            model_name='student',
            name='admission_number',
            field=models.CharField(max_length=20, unique=True, null=True, blank=True),
        ),
        # 2. Copy roll_number → admission_number for all existing rows
        migrations.RunSQL(
            sql="UPDATE collection_student SET admission_number = roll_number;",
            reverse_sql="UPDATE collection_student SET roll_number = admission_number;",
        ),
        # 3. Make admission_number NOT NULL
        migrations.AlterField(
            model_name='student',
            name='admission_number',
            field=models.CharField(max_length=20, unique=True),
        ),
        # 4. Remove old roll_number field
        migrations.RemoveField(
            model_name='student',
            name='roll_number',
        ),
        # 5. Remove name field
        migrations.RemoveField(
            model_name='student',
            name='name',
        ),
        # 6. Remove department field
        migrations.RemoveField(
            model_name='student',
            name='department',
        ),
    ]
