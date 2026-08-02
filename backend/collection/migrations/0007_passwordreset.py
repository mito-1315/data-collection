from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('collection', '0006_make_location_name_optional'),
    ]

    operations = [
        migrations.CreateModel(
            name='PasswordReset',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=10)),
                ('new_password', models.CharField(max_length=128)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('student', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='password_reset', to='collection.student')),
            ],
        ),
    ]
