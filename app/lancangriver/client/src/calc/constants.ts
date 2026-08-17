export const BASE_URL = "http://localhost:4050";

export const EARTH_RADIUS = 6_371_008.8;

export const degToRadMultiplier = Math.PI / 180;
export const radToDegMultiplier = 180 / Math.PI;

export const ELEVATION_SCALE = 1.6;
export const FLY_MOVEMENT_SPEED = 10;
export const FLY_ROLL_SPEED = 0.1;

// kunming: 25.0389, 102.7183
export const START_CENTER_LON = 102.7183;
export const START_CENTER_LAT = 25.0389;

export const MAX_DEM_ZOOM = 15;

export const lodBaseDistanceMeters = 0;
export const zoomZeroDistanceMeters = 0;
export const maxTileZoom = 20;
export const frustumCullingMinZoom = 3;

export const maxOrbitZoomSpeed = 1.5;
export const minOrbitZoomSpeed = 0.000001;
export const maxOrbitRotateSpeed = 1;
export const minOrbitRotateSpeed = 0.000001;

export const nearPlaneAltitudeRatio = 0.1;
export const minNearPlaneMeters = 10;
export const maxNearPlaneMeters = EARTH_RADIUS * 0.1;
export const horizonFarPlaneMargin = 1.1;
export const minFarPlaneGapMeters = 1_000;

export const minOrbitAltitudeMeters = EARTH_RADIUS + 150;
export const maxOrbitDistanceMeters = EARTH_RADIUS * 2;

export const minRootTileZoom = 0;
export const maxRootTileZoom = 0;
