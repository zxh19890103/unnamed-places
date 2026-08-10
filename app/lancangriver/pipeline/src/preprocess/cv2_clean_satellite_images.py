import argparse
from pathlib import Path

import cv2
import numpy as np

# Category ids and solid fill colors (BGR, as used by OpenCV).
CATEGORIES = {
    'water': {'id': 1, 'color': (255, 128, 0)},
    'vegetation': {'id': 2, 'color': (34, 139, 34)},
    'bare_land': {'id': 3, 'color': (19, 69, 139)},
    'urban': {'id': 4, 'color': (169, 169, 169)},
    'other': {'id': 5, 'color': (255, 255, 255)},
}

# HSV ranges are for OpenCV's H:0-179, S:0-255, V:0-255 scale.
WATER_HUE_RANGE = (85, 130)
WATER_MIN_SATURATION = 40
WATER_MAX_VALUE = 200

VEGETATION_HUE_RANGE = (35, 90)
VEGETATION_MIN_SATURATION = 40

BARE_LAND_HUE_RANGE = (5, 35)
BARE_LAND_MIN_SATURATION = 30

URBAN_MAX_SATURATION = 40
URBAN_MIN_VALUE = 90

MORPH_KERNEL_SIZE = 5
MEDIAN_BLUR_KERNEL = 7


def preprocess_image(image_bgr: np.ndarray) -> np.ndarray:
    """Smooth the input image with median filtering before classification."""
    return cv2.medianBlur(image_bgr, MEDIAN_BLUR_KERNEL)


def classify_pixels(image_bgr: np.ndarray) -> np.ndarray:
    """Classify each pixel into a category id using HSV threshold rules."""
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)

    labels = np.full(hue.shape, CATEGORIES['other']['id'], dtype=np.uint8)

    water = (
        (hue >= WATER_HUE_RANGE[0])
        & (hue <= WATER_HUE_RANGE[1])
        & (saturation >= WATER_MIN_SATURATION)
        & (value <= WATER_MAX_VALUE)
    )
    vegetation = (
        (hue >= VEGETATION_HUE_RANGE[0])
        & (hue <= VEGETATION_HUE_RANGE[1])
        & (saturation >= VEGETATION_MIN_SATURATION)
    )
    bare_land = (
        (hue >= BARE_LAND_HUE_RANGE[0])
        & (hue <= BARE_LAND_HUE_RANGE[1])
        & (saturation >= BARE_LAND_MIN_SATURATION)
    )
    urban = (saturation <= URBAN_MAX_SATURATION) & (value >= URBAN_MIN_VALUE)

    # Later assignments win where rules overlap.
    labels[urban] = CATEGORIES['urban']['id']
    labels[bare_land] = CATEGORIES['bare_land']['id']
    labels[vegetation] = CATEGORIES['vegetation']['id']
    labels[water] = CATEGORIES['water']['id']

    return labels


def smooth_labels(labels: np.ndarray, kernel_size: int = MORPH_KERNEL_SIZE) -> np.ndarray:
    """Remove speckle noise per category with morphological open/close."""
    kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
    smoothed = np.full_like(labels, CATEGORIES['other']['id'])

    for category in CATEGORIES.values():
        mask = np.where(labels == category['id'], 255, 0).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        smoothed[mask == 255] = category['id']

    return smoothed


def remove_small_components(labels: np.ndarray, area_threshold: int = 200) -> np.ndarray:
    """Drop connected components smaller than the threshold."""
    cleaned = labels.copy()
    for category in CATEGORIES.values():
        mask = (cleaned == category['id']).astype(np.uint8)
        num_labels, components, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        for component_id in range(1, num_labels):
            area = stats[component_id, cv2.CC_STAT_AREA]
            if area < area_threshold:
                cleaned[components == component_id] = CATEGORIES['other']['id']
    return cleaned


def fill_unclassified_pixels(image_bgr: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Assign any remaining 'other' pixels to the nearest category by color similarity."""
    filled = labels.copy()
    other_id = CATEGORIES['other']['id']
    other_mask = filled == other_id
    if not np.any(other_mask):
        return filled

    category_ids = [category['id'] for category in CATEGORIES.values() if category['id'] != other_id]
    category_means = []
    for category_id in category_ids:
        pixels = image_bgr[filled == category_id]
        if pixels.size == 0:
            category_means.append(None)
        else:
            category_means.append(pixels.mean(axis=0).astype(np.float32))

    unresolved = np.argwhere(other_mask)
    if unresolved.size == 0:
        return filled

    for row, col in unresolved:
        pixel = image_bgr[row, col].astype(np.float32)
        best_id = other_id
        best_distance = float('inf')
        for category_id, mean in zip(category_ids, category_means):
            if mean is None:
                continue
            distance = float(np.linalg.norm(pixel - mean))
            if distance < best_distance:
                best_distance = distance
                best_id = category_id
        filled[row, col] = best_id

    return filled


def paint_categories(labels: np.ndarray) -> np.ndarray:
    """Paint each pixel with its category's solid color."""
    painted = np.zeros((*labels.shape, 3), dtype=np.uint8)
    for category in CATEGORIES.values():
        painted[labels == category['id']] = category['color']
    return painted


def clean_satellite_image(input_path: Path, output_path: Path, smooth: bool = True) -> Path:
    image = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f'Could not read image: {input_path}')

    image = preprocess_image(image)
    labels = classify_pixels(image)
    if smooth:
        labels = smooth_labels(labels)
        labels = remove_small_components(labels)

    labels = fill_unclassified_pixels(image, labels)
    painted = paint_categories(labels)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), painted)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Classify a satellite tile into solid-color categories.',
    )
    parser.add_argument('--input', required=True, help='Path to the input tile image.')
    parser.add_argument('--output', required=True, help='Path for the output .png file.')
    parser.add_argument(
        '--no-smooth',
        action='store_true',
        help='Skip morphological smoothing of category regions.',
    )
    args = parser.parse_args()

    output_path = clean_satellite_image(
        input_path=Path(args.input),
        output_path=Path(args.output),
        smooth=not args.no_smooth,
    )
    print(f'Wrote classified tile: {output_path}')


if __name__ == '__main__':
    main()
