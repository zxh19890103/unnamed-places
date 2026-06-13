from pipeline.src.common.config import load_corridor


def test_load_corridor_has_zoom_and_bbox() -> None:
    cfg = load_corridor('pipeline/config/pilot_corridor.json')
    assert cfg['zoom'] == 11
    assert cfg['corridor'][0]['bbox'] == [99.0, 21.0, 101.5, 23.0]
