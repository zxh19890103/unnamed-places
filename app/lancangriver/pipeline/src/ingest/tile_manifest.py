import argparse
import json
import math
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, box, shape
from shapely.ops import transform


def lon2tile_x(lon: float, z: int) -> int:
    return math.floor(((lon + 180.0) / 360.0) * (2 ** z))


def lat2tile_y(lat: float, z: int) -> int:
    radians = math.radians(lat)
    return math.floor(
        ((1 - math.log(math.tan(radians) + 1 / math.cos(radians)) / math.pi) / 2)
        * (2 ** z)
    )


def tile_bounds_wgs84(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    scale = 2 ** z
    west = (x / scale) * 360.0 - 180.0
    east = ((x + 1) / scale) * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - (2 * y) / scale))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - (2 * (y + 1)) / scale))))
    return west, south, east, north


def tiles_for_buffered_line(line: LineString, zoom: int, buffer_km: float) -> list[dict]:
    to_utm = Transformer.from_crs('EPSG:4326', 'EPSG:32647', always_xy=True).transform
    to_wgs84 = Transformer.from_crs('EPSG:32647', 'EPSG:4326', always_xy=True).transform

    buffered = transform(to_wgs84, transform(to_utm, line).buffer(buffer_km * 1000.0))
    min_lon, min_lat, max_lon, max_lat = buffered.bounds

    min_x, max_x = sorted((lon2tile_x(min_lon, zoom), lon2tile_x(max_lon, zoom)))
    min_y, max_y = sorted((lat2tile_y(max_lat, zoom), lat2tile_y(min_lat, zoom)))

    tiles = []
    for x in range(min_x, max_x + 1):
        for y in range(min_y, max_y + 1):
            west, south, east, north = tile_bounds_wgs84(zoom, x, y)
            tile_polygon = box(west, south, east, north)
            if buffered.intersects(tile_polygon):
                tiles.append({'z': zoom, 'x': x, 'y': y})

    return tiles


def load_centerline(path: str) -> LineString:
    with Path(path).open('r', encoding='utf-8') as file:
        feature = json.load(file)
    geometry = feature.get('geometry') if feature.get('type') == 'Feature' else feature
    line = shape(geometry)
    if line.is_empty:
        raise ValueError('Centerline geometry is empty')
    if not isinstance(line, LineString):
        raise ValueError('Centerline geometry must be a LineString')
    return line


def write_manifest(path: str, tiles: list[dict]) -> None:
    out_path = Path(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open('w', encoding='utf-8') as file:
        json.dump(tiles, file)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--centerline', default='pipeline/output/centerline/lancang_main_stem.geojson')
    parser.add_argument('--output', default='pipeline/output/tiles/z11_manifest.json')
    parser.add_argument('--zoom', type=int, default=11)
    parser.add_argument('--buffer-km', type=float, default=10.0)
    args = parser.parse_args()

    line = load_centerline(args.centerline)
    tiles = tiles_for_buffered_line(line, args.zoom, args.buffer_km)
    if len(tiles) == 0:
        raise ValueError('0 intersecting tiles generated')

    write_manifest(args.output, tiles)
    print(f'generated {len(tiles)} tiles -> {args.output}')


if __name__ == '__main__':
    main()
