from pipeline.src.ingest.osm_ingest import build_overpass_query


def test_build_overpass_query_uses_bbox_order() -> None:
    query = build_overpass_query([99.0, 21.0, 101.5, 23.0])
    assert '(21.0,99.0,23.0,101.5)' in query
    assert 'waterway' in query
    assert 'highway' in query
    assert 'building' in query
