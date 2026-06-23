const MIN_LAT = -85.05112878;
const MAX_LAT = 85.05112878;
const referenceDistanceMeters = 1_00;
function clampLat(lat) {
    return Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
}
function worldPixelSize(zoom) {
    return 256 * 2 ** zoom;
}
export function lonLatToWorldPixel(lon, lat, zoom) {
    const latClamped = clampLat(lat);
    const sinLat = Math.sin((latClamped * Math.PI) / 180);
    const size = worldPixelSize(zoom);
    const x = ((lon + 180) / 360) * size;
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
    return { x, y };
}
function worldPixelToLonLat(x, y, zoom) {
    const size = worldPixelSize(zoom);
    const lon = (x / size) * 360 - 180;
    const mercator = Math.PI - (2 * Math.PI * y) / size;
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
    return { lon, lat };
}
export function tileBounds4326(z, x, y) {
    const northwest = worldPixelToLonLat(x * 256, y * 256, z);
    const southeast = worldPixelToLonLat((x + 1) * 256, (y + 1) * 256, z);
    return [northwest.lon, southeast.lat, southeast.lon, northwest.lat];
}
export function latlngToTilekey2(lon, lat, zoom) {
    const tileCount = 2 ** zoom;
    const { x, y } = lonLatToWorldPixel(lon, lat, zoom);
    const tileX = Math.floor(x / 256);
    const tileY = Math.floor(y / 256);
    return {
        z: zoom,
        x: Math.max(0, Math.min(tileCount - 1, tileX)),
        y: Math.max(0, Math.min(tileCount - 1, tileY)),
    };
}
export function latlngToTilekey(lng, lat, zoom) {
    const latRad = (lat * Math.PI) / 180;
    const lng_ = ((lng + 180) % 360) / 360;
    const n = Math.pow(2, zoom);
    const x = Math.floor(lng_ * n);
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y, z: zoom };
}
export function enumerateChildTiles(baseTile, targetZoom) {
    if (targetZoom <= baseTile.z) {
        return [
            {
                ...baseTile,
                offsetX: 0,
                offsetY: 0,
            },
        ];
    }
    const factor = 2 ** (targetZoom - baseTile.z);
    const startX = baseTile.x * factor;
    const startY = baseTile.y * factor;
    const children = [];
    for (let y = 0; y < factor; y += 1) {
        for (let x = 0; x < factor; x += 1) {
            children.push({
                z: targetZoom,
                x: startX + x,
                y: startY + y,
                offsetX: x / factor,
                offsetY: y / factor,
            });
        }
    }
    return children;
}
export function disatanceToZoom(distance, min = 0, max = 19) {
    if (!Number.isFinite(distance) || distance <= 0) {
        return min;
    }
    const rawZoom = max - Math.log2(distance / referenceDistanceMeters);
    const zoom = Math.floor(rawZoom);
    return Math.max(min, Math.min(max, zoom));
}
export function zoomToDistance(zoomLevel, min = 0, max = 19) {
    const z = Math.max(min, Math.min(max, zoomLevel));
    // Return the midpoint of the [z, z+1] distance band so round-tripping is stable.
    const upper = referenceDistanceMeters * 2 ** (max - z);
    const lower = referenceDistanceMeters * 2 ** (max - (z + 1));
    return (upper + lower) / 2;
}
/**
 * Compute satellite composition detail level (lowAltitudeZoom) from camera distance.
 * Used in fly and groundOrbit modes to determine how many child tiles to composite.
 * lowAltitudeZoom: 1 = 1×1 (parent only), 2 = 2×2 grid, 3 = 4×4 grid, etc.
 */
export function distanceToLowAltitudeZoom(distance) {
    // if (distance > 30_000) return 1;
    // if (distance > 10_000) return 2;
    return 1;
}
