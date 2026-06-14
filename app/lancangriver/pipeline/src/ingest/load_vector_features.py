from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg


def same_coordinate(start: list[float], end: list[float]) -> bool:
    return abs(start[0] - end[0]) <= 1e-9 and abs(start[1] - end[1]) <= 1e-9


def to_geojson_geometry(element: dict) -> dict | None:
    element_type = element.get('type')

    if element_type == 'node':
        lon = element.get('lon')
        lat = element.get('lat')

        if isinstance(lon, (int, float)) and isinstance(lat, (int, float)):
            return {'type': 'Point', 'coordinates': [float(lon), float(lat)]}

        return None

    geom = element.get('geometry')

    if not isinstance(geom, list) or len(geom) < 2:
        return None

    coords: list[list[float]] = []

    for point in geom:
        lon = point.get('lon')
        lat = point.get('lat')

        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            return None

        coords.append([float(lon), float(lat)])

    if len(coords) >= 4 and same_coordinate(coords[0], coords[-1]):
        return {'type': 'Polygon', 'coordinates': [coords]}

    return {'type': 'LineString', 'coordinates': coords}


def build_record(element: dict) -> dict | None:
    element_id = element.get('id')

    if not isinstance(element_id, int):
        return None

    geom = to_geojson_geometry(element)

    if geom is None:
        return None

    feature_type = element.get('type')

    if not isinstance(feature_type, str):
        return None

    tags = element.get('tags')

    if not isinstance(tags, dict):
        tags = {}

    return {
        'feature_id': f'{feature_type}/{element_id}',
        'feature_type': feature_type,
        'tags': tags,
        'geom': geom,
    }


def iter_records(input_dir: Path):
    files = sorted(input_dir.glob('*.osm.json'))

    for file_path in files:
        payload = json.loads(file_path.read_text(encoding='utf-8'))
        elements = payload.get('elements', [])

        if not isinstance(elements, list):
            continue

        for element in elements:
            if not isinstance(element, dict):
                continue

            record = build_record(element)

            if record is not None:
                yield record


def load_records(input_dir: Path, database_url: str, truncate: bool) -> int:
    sql = """
        INSERT INTO public.vector_features(feature_id, source, feature_type, tags, geom, updated_at)
        VALUES (%s, 'osm', %s, %s::jsonb, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), NOW())
        ON CONFLICT (feature_id)
        DO UPDATE SET
          feature_type = EXCLUDED.feature_type,
          tags = EXCLUDED.tags,
          geom = EXCLUDED.geom,
          updated_at = NOW()
    """

    inserted = 0

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            if truncate:
                cur.execute('TRUNCATE TABLE public.vector_features')

            for record in iter_records(input_dir):
                cur.execute(
                    sql,
                    (
                        record['feature_id'],
                        record['feature_type'],
                        json.dumps(record['tags']),
                        json.dumps(record['geom']),
                    ),
                )
                inserted += 1

    return inserted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', default='pipeline/output/osm')
    parser.add_argument('--database-url', default=os.getenv('DATABASE_URL'))
    parser.add_argument('--truncate', action='store_true')
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit('DATABASE_URL (or --database-url) is required')

    input_dir = Path(args.input_dir)

    if not input_dir.exists() or not input_dir.is_dir():
        raise SystemExit(f'Input directory does not exist: {input_dir}')

    count = load_records(input_dir, args.database_url, args.truncate)
    print(f'loaded {count} features into public.vector_features')


if __name__ == '__main__':
    main()
