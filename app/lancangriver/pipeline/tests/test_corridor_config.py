from pipeline.src.common.config import load_corridor


def test_load_corridor_has_zoom_and_bbox() -> None:
    cfg = load_corridor('pipeline/config/pilot_corridor.json')
    assert cfg['zoom'] == 11
    assert cfg['corridor'][0]['bbox'] == [99.0, 21.0, 101.5, 23.0]


def test_load_corridor_includes_origin_and_end() -> None:
    cfg = load_corridor('pipeline/config/pilot_corridor.json')
    assert cfg['origin'] == [97.17658060985056, 31.13551645138972]
    assert cfg['end'] == [101.12626731734983, 21.773330764859452]


def test_load_corridor_rejects_invalid_origin(tmp_path) -> None:
    bad = tmp_path / 'bad.json'
    bad.write_text(
        '{"zoom":11,"origin":[97.1],"end":[101.1,21.7],"corridor":[{"bbox":[99,21,101.5,23]}]}',
        encoding='utf-8',
    )
    try:
        load_corridor(str(bad))
        assert False, 'expected ValueError'
    except ValueError as err:
        assert 'origin' in str(err)
