from pipeline.src.ingest.river_centerline import (
    clip_between_points,
    filter_lancang_ways,
    load_osm_payload,
    stitch_centerline,
    to_feature,
)


def test_load_osm_payload_reads_json(tmp_path) -> None:
    sample = tmp_path / 'river.osm.json'
    sample.write_text('{"elements": []}', encoding='utf-8')
    payload = load_osm_payload(str(sample))
    assert payload['elements'] == []


def test_filter_lancang_ways_keeps_only_allowed_names() -> None:
    elements = [
        {
            'type': 'way',
            'id': 1,
            'tags': {'name': '澜沧江'},
            'geometry': [{'lon': 99, 'lat': 22}, {'lon': 99.1, 'lat': 21.9}],
        },
        {
            'type': 'way',
            'id': 2,
            'tags': {'name': 'Mekong'},
            'geometry': [{'lon': 99, 'lat': 22}, {'lon': 99.2, 'lat': 21.8}],
        },
    ]
    kept = filter_lancang_ways(elements)
    assert [way['id'] for way in kept] == [1]


def test_stitch_centerline_orders_disordered_segments() -> None:
    ways = [
        {'geometry': [{'lon': 99.1, 'lat': 21.9}, {'lon': 99.2, 'lat': 21.8}]},
        {'geometry': [{'lon': 99.0, 'lat': 22.0}, {'lon': 99.1, 'lat': 21.9}]},
    ]
    coords, gaps = stitch_centerline(ways, [99.0, 22.0], [99.2, 21.8])
    assert coords[0] == [99.0, 22.0]
    assert coords[-1] == [99.2, 21.8]
    assert gaps == 0


def test_clip_between_points_returns_segment() -> None:
    coords = [[99.0, 22.0], [99.1, 21.9], [99.2, 21.8], [99.3, 21.7]]
    clipped = clip_between_points(coords, [99.05, 21.95], [99.25, 21.75])
    assert clipped[0] == [99.1, 21.9]
    assert clipped[-1] == [99.2, 21.8]


def test_to_feature_contains_required_properties() -> None:
    feature = to_feature([[99.0, 22.0], [99.2, 21.8]], [97.17, 31.13], [101.12, 21.77], 0)
    assert feature['geometry']['type'] == 'LineString'
    assert feature['properties']['source'] == 'osm'
    assert 'total_km' in feature['properties']
