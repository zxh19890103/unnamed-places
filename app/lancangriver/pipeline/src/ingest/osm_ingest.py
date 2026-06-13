import argparse
import json
from pathlib import Path

import requests

from pipeline.src.common.config import load_corridor

OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'


def build_overpass_query(bbox: list[float]) -> str:
    min_lon, min_lat, max_lon, max_lat = bbox
    south = min_lat
    west = min_lon
    north = max_lat
    east = max_lon

    return f"""
[out:json][timeout:120];
(
  way[\"waterway\"=\"river\"]({south},{west},{north},{east});
  way[\"highway\"]({south},{west},{north},{east});
  way[\"building\"]({south},{west},{north},{east});
);
out geom;
"""


def fetch_overpass(query: str) -> dict:
    response = requests.post(
        OVERPASS_ENDPOINT,
        data={'data': query},
        timeout=180,
    )
    response.raise_for_status()
    return response.json()


def write_segment_output(output_dir: Path, segment_id: str, payload: dict) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f'{segment_id}.osm.json'
    with file_path.open('w', encoding='utf-8') as file:
        json.dump(payload, file)
    return file_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--output-dir', default='pipeline/output/osm')
    args = parser.parse_args()

    cfg = load_corridor(args.config)
    output_dir = Path(args.output_dir)

    for segment in cfg['corridor']:
        if not segment.get('enabled', True):
            continue

        segment_id = segment.get('id', 'segment')
        query = build_overpass_query(segment['bbox'])
        payload = fetch_overpass(query)
        output_file = write_segment_output(output_dir, segment_id, payload)
        count = len(payload.get('elements', []))
        print(f'[{segment_id}] fetched {count} elements -> {output_file}')


if __name__ == '__main__':
    main()
