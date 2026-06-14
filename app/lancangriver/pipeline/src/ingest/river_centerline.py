import argparse
import json
from pathlib import Path
from shapely.geometry import LineString, Point
from typing import Optional

from pipeline.src.common.config import load_corridor

ALLOWED_NAMES = {'澜沧江', 'lancang jiang', 'lancang river'}


def load_osm_payload(input_json: str) -> dict:
    input_path = Path(input_json)
    if not input_path.exists():
        raise FileNotFoundError(f'OSM input json not found: {input_json}')

    with input_path.open('r', encoding='utf-8') as file:
        payload = json.load(file)

    if not isinstance(payload, dict):
        raise ValueError('OSM input json must be an object payload')

    return payload


def filter_lancang_ways(elements: list[dict]) -> list[dict]:
    kept = []
    for element in elements:
        if element.get('type') != 'way':
            continue
        name = str(element.get('tags', {}).get('name', '')).strip().lower()
        if name in ALLOWED_NAMES:
            kept.append(element)
    return kept


def _coord_distance(a: list[float], b: list[float]) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def _merge_two_chains(
    a: list[list[float]], b: list[list[float]]
) -> Optional[list[list[float]]]:
    if a[-1] == b[0]:
        return a + b[1:]
    if a[-1] == b[-1]:
        return a + list(reversed(b[:-1]))
    if a[0] == b[-1]:
        return b + a[1:]
    if a[0] == b[0]:
        return list(reversed(b[1:])) + a
    return None


def stitch_centerline(
    ways: list[dict], origin: list[float], end: list[float]
) -> tuple[list[list[float]], int]:
    chains = []
    for way in ways:
        chain = [[point['lon'], point['lat']] for point in way.get('geometry', [])]
        if len(chain) >= 2:
            chains.append(chain)

    changed = True
    while changed and len(chains) > 1:
        changed = False
        for i in range(len(chains)):
            for j in range(i + 1, len(chains)):
                merged = _merge_two_chains(chains[i], chains[j])
                if merged:
                    chains[i] = merged
                    del chains[j]
                    changed = True
                    break
            if changed:
                break

    if not chains:
        return [], 0

    best_chain = chains[0]
    best_score = _coord_distance(best_chain[0], origin) + _coord_distance(best_chain[-1], end)

    for chain in chains:
        forward = _coord_distance(chain[0], origin) + _coord_distance(chain[-1], end)
        reverse = _coord_distance(chain[-1], origin) + _coord_distance(chain[0], end)
        if reverse < forward:
            candidate = list(reversed(chain))
            score = reverse
        else:
            candidate = chain
            score = forward

        if score < best_score:
            best_chain = candidate
            best_score = score

    gap_count = max(0, len(chains) - 1)
    return best_chain, gap_count


def clip_between_points(
    coords: list[list[float]], origin: list[float], end: list[float]
) -> list[list[float]]:
    if len(coords) < 2:
        return coords

    line = LineString(coords)
    origin_dist = line.project(Point(origin[0], origin[1]))
    end_dist = line.project(Point(end[0], end[1]))
    start, stop = sorted((origin_dist, end_dist))

    clipped = []
    for coord in coords:
        distance = line.project(Point(coord[0], coord[1]))
        if start <= distance <= stop:
            clipped.append(coord)

    return clipped if len(clipped) >= 2 else coords


def to_feature(
    coords: list[list[float]], origin: list[float], end: list[float], gap_count: int
) -> dict:
    line = LineString(coords)
    return {
        'type': 'Feature',
        'geometry': {'type': 'LineString', 'coordinates': coords},
        'properties': {
            'source': 'osm',
            'origin': origin,
            'end': end,
            'total_km': round(line.length * 111.32, 3),
            'gap_count': gap_count,
        },
    }


def write_feature(output_dir: str, feature: dict) -> Path:
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / 'lancang_main_stem.geojson'
    with file_path.open('w', encoding='utf-8') as file:
        json.dump(feature, file)
    return file_path


def run(config_path: str, output_dir: str, input_json: str) -> Path:
    cfg = load_corridor(config_path)
    origin = cfg['origin']
    end = cfg['end']
    payload = load_osm_payload(input_json)
    ways = filter_lancang_ways(payload.get('elements', []))
    if len(ways) == 0:
        raise ValueError('No Lancang river ways matched the configured name filter')

    coords, gap_count = stitch_centerline(ways, origin, end)
    if len(coords) < 2:
        raise ValueError('Failed to stitch a centerline with at least two points')

    clipped = clip_between_points(coords, origin, end)
    feature = to_feature(clipped, origin, end, gap_count)
    return write_feature(output_dir, feature)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='pipeline/config/pilot_corridor.json')
    parser.add_argument('--input-json', default='pipeline/input/osm/lancang_river.osm.json')
    parser.add_argument('--output-dir', default='pipeline/output/centerline')
    args = parser.parse_args()

    output = run(args.config, args.output_dir, args.input_json)
    print(f'centerline -> {output}')


if __name__ == '__main__':
    main()
