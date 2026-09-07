import { EARTH_RADIUS } from '@/calc/constants';

export const lodBaseDistanceMeters = 0;
export const zoomZeroDistanceMeters = 0;
export const maxTileZoom = 20;
export const frustumCullingMinZoom = 3;

export const maxOrbitZoomSpeed = 1.5;
export const minOrbitZoomSpeed = 0.000001;
export const maxOrbitRotateSpeed = 1;
export const minOrbitRotateSpeed = 0.000001;

export const minOrbitAltitudeMeters = EARTH_RADIUS + 150;
export const maxOrbitDistanceMeters = EARTH_RADIUS * 2;

export const minRootTileZoom = 0;
export const maxRootTileZoom = 0;
