from pathlib import Path

from django.conf import settings


def road_geojson_path() -> Path:
    """Resolve SelectiveRoadTopology.geojson for Docker and local dev."""
    filename = Path('roadTopology') / 'geojson' / 'SelectiveRoadTopology.geojson'
    candidates = [
        Path(settings.BASE_DIR) / 'datasets' / filename,
        Path(settings.BASE_DIR).parent / 'datasets' / filename,
    ]
    for path in candidates:
        if path.exists():
            return path
    return candidates[0]
