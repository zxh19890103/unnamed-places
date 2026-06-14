import requests

OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
ALLOWED_NAMES = {'澜沧江', 'lancang jiang', 'lancang river'}


def build_river_query(bbox: list[float]) -> str:
    min_lon, min_lat, max_lon, max_lat = bbox
    return (
        '[out:json][timeout:120];\n'
        f'way["waterway"="river"]({min_lat},{min_lon},{max_lat},{max_lon});\n'
        'out geom tags;'
    )


def fetch_overpass(query: str) -> dict:
    response = requests.post(
        OVERPASS_ENDPOINT,
        data={'data': query},
        timeout=180,
    )
    response.raise_for_status()
    return response.json()


def filter_lancang_ways(elements: list[dict]) -> list[dict]:
    kept = []
    for element in elements:
        if element.get('type') != 'way':
            continue
        name = str(element.get('tags', {}).get('name', '')).strip().lower()
        if name in ALLOWED_NAMES:
            kept.append(element)
    return kept
