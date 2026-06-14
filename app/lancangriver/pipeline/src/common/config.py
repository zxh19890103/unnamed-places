import json
from pathlib import Path
from typing import Any


def _validate_bbox(bbox: Any) -> None:
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError('bbox must contain 4 numbers')

    if any(not isinstance(value, (int, float)) for value in bbox):
        raise ValueError('bbox values must be numbers')

    min_lon, min_lat, max_lon, max_lat = bbox
    if min_lon >= max_lon or min_lat >= max_lat:
        raise ValueError('bbox bounds are invalid')


def _validate_point(name: str, point: Any) -> None:
    if not isinstance(point, list) or len(point) != 2:
        raise ValueError(f'{name} must contain 2 numbers')

    if any(not isinstance(value, (int, float)) for value in point):
        raise ValueError(f'{name} values must be numbers')


def load_corridor(path: str) -> dict[str, Any]:
    config_path = Path(path)
    with config_path.open('r', encoding='utf-8') as file:
        data = json.load(file)

    zoom = data.get('zoom')
    if not isinstance(zoom, int) or zoom < 0:
        raise ValueError('zoom must be a non-negative integer')

    origin = data.get('origin')
    end = data.get('end')
    _validate_point('origin', origin)
    _validate_point('end', end)

    corridor = data.get('corridor')
    if not isinstance(corridor, list) or len(corridor) == 0:
        raise ValueError('corridor must be a non-empty list')

    enabled_segments = 0
    for segment in corridor:
        if not isinstance(segment, dict):
            raise ValueError('corridor segment must be an object')

        bbox = segment.get('bbox')
        _validate_bbox(bbox)

        if segment.get('enabled', True):
            enabled_segments += 1

    if enabled_segments == 0:
        raise ValueError('corridor has no enabled segments')

    return data
