#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup.sh — Bootstrap the Data-Collection Django backend (macOS / Linux)
# ---------------------------------------------------------------------------
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo " Setting up the Data-Collection Django backend..."
echo "============================================================"

# 1. Create & activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install Python dependencies
pip install --upgrade pip -q
pip install -r requirements.txt

# 3. Apply database migrations
echo ""
echo "Running migrations..."
python manage.py migrate

# 4. Create a default superuser (idempotent — skips if already exists)
echo ""
echo "Creating superuser (admin@rec.edu)..."
python manage.py createsuperuser \
    --noinput \
    --username admin \
    --email admin@rec.edu 2>/dev/null \
    && echo "Superuser created." \
    || echo "(Superuser already exists — skipped.)"

# 5. Seed road topology data from SelectiveRoadTopology.geojson
echo ""
echo "Seeding road topology data..."
python manage.py import_roads
echo "Road topology seeded."

echo ""
echo "============================================================"
echo " Setup complete!"
echo ""
echo " Start the dev server with:"
echo "   source .venv/bin/activate"
echo "   python manage.py runserver"
echo "============================================================"
