from pipeline.src.ingest.river_centerline import build_river_query, filter_lancang_ways


def test_build_river_query_uses_bbox_order() -> None:
    query = build_river_query([97.1, 21.7, 101.2, 31.1])
    assert '(21.7,97.1,31.1,101.2)' in query
    assert 'waterway' in query


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
