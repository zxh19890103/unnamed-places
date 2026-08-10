import sys
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.src.preprocess.cv2_clean_satellite_images import CATEGORIES, remove_small_components


def test_remove_small_components_filters_noise() -> None:
    labels = np.full((12, 12), CATEGORIES['other']['id'], dtype=np.uint8)
    water_id = CATEGORIES['water']['id']

    labels[1:4, 1:4] = water_id
    labels[6:10, 6:10] = water_id

    filtered = remove_small_components(labels, area_threshold=10)

    assert filtered[1, 1] == CATEGORIES['other']['id']
    assert filtered[6, 6] == water_id
