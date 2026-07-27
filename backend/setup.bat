@echo off
echo Setting up the Data-Collection Django backend...

cd /d %~dp0

python -m venv .venv
call .venv\Scripts\activate.bat

pip install -r requirements.txt

python manage.py migrate
python manage.py createsuperuser --noinput --username admin --email admin@rec.edu 2>nul || echo (superuser already exists)

echo.
echo Seeding road topology data...
python manage.py import_roads
echo Road topology seeded.

echo.
echo Done! Run the server with:
echo   call .venv\Scripts\activate.bat
echo   python manage.py runserver
