from pipeline.src.ingest.load_vector_features import build_record


def test_build_record_maps_way_to_linestring() -> None:
    element = {
        'type': 'way',
        'id': 123,
        'geometry': [
            {'lat': 21.0, 'lon': 99.0},
            {'lat': 21.5, 'lon': 99.5},
        ],
        'tags': {'waterway': 'river'},
    }

    record = build_record(element)

    assert record is not None
    assert record['feature_id'] == 'way/123'
    assert record['feature_type'] == 'way'
    assert record['tags'] == {'waterway': 'river'}
    assert record['geom'] == {
        'type': 'LineString',
        'coordinates': [[99.0, 21.0], [99.5, 21.5]],
    }


def test_build_record_maps_closed_way_to_polygon() -> None:
    element = {
        'type': 'way',
        'id': 999,
        'geometry': [
            {'lat': 21.0, 'lon': 99.0},
            {'lat': 21.0, 'lon': 99.1},
            {'lat': 21.1, 'lon': 99.1},
            {'lat': 21.0, 'lon': 99.0},
        ],
        'tags': {'building': 'yes'},
    }

    record = build_record(element)

    assert record is not None
    assert record['feature_id'] == 'way/999'
    assert record['geom']['type'] == 'Polygon'


def test_build_record_maps_node_to_point() -> None:
    element = {
        'type': 'node',
        'id': 7,
        'lat': 22.2,
        'lon': 100.1,
    }

    record = build_record(element)

    assert record is not None
    assert record['feature_id'] == 'node/7'
    assert record['geom'] == {
        'type': 'Point',
        'coordinates': [100.1, 22.2],
    }
