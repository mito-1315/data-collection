"""
Management command: import_roads
Reads SelectiveRoadTopology.geojson and bulk-inserts all LineString
features into the RoadSegment table.

Usage:
    python manage.py import_roads
    python manage.py import_roads --geojson /custom/path/to/file.geojson
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from collection.models import RoadSegment

DEFAULT_GEOJSON = (
    Path(__file__).resolve()
    .parents[4]          # repo root: commands -> management -> collection -> backend -> data-collection
    / 'datasets'
    / 'roadTopology'
    / 'geojson'
    / 'SelectiveRoadTopology.geojson'
)


class Command(BaseCommand):
    help = 'Import bus road LineStrings from SelectiveRoadTopology.geojson into the database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--geojson',
            default=str(DEFAULT_GEOJSON),
            help='Path to the SelectiveRoadTopology.geojson file.',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            default=False,
            help='Delete all existing RoadSegment rows before importing.',
        )

    def handle(self, *args, **options):
        path = Path(options['geojson'])
        if not path.exists():
            raise CommandError(f'GeoJSON file not found: {path}')

        self.stdout.write(f'Reading {path} …')
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh)

        features = data.get('features', [])
        self.stdout.write(f'Found {len(features)} features.')

        if options['clear']:
            deleted, _ = RoadSegment.objects.all().delete()
            self.stdout.write(f'Cleared {deleted} existing rows.')

        existing_ids = set(RoadSegment.objects.values_list('osm_id', flat=True))
        self.stdout.write(f'{len(existing_ids)} segments already in database.')

        to_create = []
        skipped = 0

        for feat in features:
            geom = feat.get('geometry', {})
            if geom.get('type') != 'LineString':
                continue

            props = feat.get('properties', {}) or {}
            osm_id = props.get('osm_id')
            if osm_id is None:
                skipped += 1
                continue

            if int(osm_id) in existing_ids:
                skipped += 1
                continue

            to_create.append(RoadSegment(
                osm_id=int(osm_id),
                name=props.get('name') or '',
                highway=props.get('highway') or '',
                coordinates=geom['coordinates'],
            ))

        if not to_create:
            self.stdout.write(self.style.WARNING('Nothing new to import.'))
            return

        self.stdout.write(f'Inserting {len(to_create)} new segments (skipped {skipped}) …')
        with transaction.atomic():
            RoadSegment.objects.bulk_create(to_create, batch_size=500)

        self.stdout.write(self.style.SUCCESS(
            f'Done. {len(to_create)} road segments imported successfully.'
        ))
