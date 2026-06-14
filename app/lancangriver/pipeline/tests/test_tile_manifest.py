from shapely.geometry import LineString

from pipeline.src.ingest.tile_manifest import lat2tile_y, lon2tile_x, tiles_for_buffered_line


def test_lon_lat_to_tile_indices_at_zoom_11() -> None:
    assert lon2tile_x(99.0, 11) <= lon2tile_x(101.0, 11)
    assert lat2tile_y(31.0, 11) <= lat2tile_y(21.8, 11)


def test_tiles_for_buffered_line_returns_non_empty() -> None:
    line = LineString([(99.0, 22.0), (99.2, 21.8)])
    tiles = tiles_for_buffered_line(line, zoom=11, buffer_km=10)
    assert len(tiles) > 0
    assert all(tile['z'] == 11 for tile in tiles)
