import * as THREE from 'three';
import { LatLng } from '@/calc/types';

export const EARTH_RADIUS = 6_371_008.8;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

// 6,378 km, 6,357 km

export type EarthTileRuntime = {
  eyeAngle: number;
};

export type { LatLng };

export const WEB_MERCATOR_MAX_LAT = 85.05112878;

const WGS84_A = 6_378_137;
const WGS84_B = 6_356_752.314245;
const WGS84_E2 = (WGS84_A ** 2 - WGS84_B ** 2) / WGS84_A ** 2;

export function normalizeLongitude(lng: number): number {
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

function latlngToPerfectSphere(lat: number, lng: number, alt: number = 0): THREE.Vector3Like {
  const latRad = lat * DEG_TO_RAD;
  const lngRad = lng * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);

  const r = EARTH_RADIUS + alt;

  return {
    x: r * cosLat * Math.sin(lngRad),
    y: r * Math.sin(latRad),
    z: r * cosLat * Math.cos(lngRad),
  };
}

function perfectSphereToLatlng(x: number, y: number, z: number): LatLng {
  const radius = Math.hypot(x, y, z);

  if (radius === 0) {
    throw new Error('sphereToLatlng requires a non-zero vector');
  }

  const lat = Math.asin(y / radius) * RAD_TO_DEG;
  const lng = Math.atan2(x, z) * RAD_TO_DEG;

  return { lat, lng: normalizeLongitude(lng) };
}

function latlngToEllipsoid(lat: number, lng: number): THREE.Vector3Like {
  const latRad = lat * DEG_TO_RAD;
  const lngRad = lng * DEG_TO_RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  return {
    x: primeVertical * cosLat * Math.sin(lngRad),
    y: primeVertical * (1 - WGS84_E2) * sinLat,
    z: primeVertical * cosLat * Math.cos(lngRad),
  };
}

function ellipsoidToLatlng(x: number, y: number, z: number): LatLng {
  const horizontal = Math.hypot(x, z);

  if (horizontal === 0 && y === 0) {
    throw new Error('ellipsoidToLatlng requires a non-zero vector');
  }

  if (horizontal === 0) {
    return {
      lat: y > 0 ? 90 : -90,
      lng: 0,
    };
  }

  const lng = Math.atan2(x, z) * RAD_TO_DEG;

  // Iterative geodetic latitude solve for ECEF -> lat/lng on WGS84.
  let latRad = Math.atan2(y, horizontal * (1 - WGS84_E2));
  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(latRad);
    const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    latRad = Math.atan2(y + WGS84_E2 * primeVertical * sinLat, horizontal);
  }

  return {
    lat: latRad * RAD_TO_DEG,
    lng: normalizeLongitude(lng),
  };
}

export function distanceToZoomLevel(
  dist: number,
  minZoom: number = 0,
  maxZoom: number = 21,
  referenceAltitude = 32_000_000.0,
) {
  if (!Number.isFinite(dist)) return minZoom;
  if (dist <= 0) return maxZoom;

  const zoomLevel = Math.floor(Math.log2(referenceAltitude / dist));

  if (!Number.isFinite(zoomLevel)) {
    return minZoom;
  }

  return THREE.MathUtils.clamp(zoomLevel, minZoom, maxZoom);
}

/**
 * Inverse of {@link distanceToZoomLevel}: returns the lower-bound ground
 * distance that maps back to the requested zoom level.
 */
export function zoomLevelToDistance(
  zoom: number,
  minZoom: number = 0,
  maxZoom: number = 21,
  referenceAltitude = 32_000_000.0,
) {
  if (!Number.isFinite(zoom)) return referenceAltitude;
  const clampedZoom = THREE.MathUtils.clamp(zoom, minZoom, maxZoom);
  return referenceAltitude / Math.pow(2, clampedZoom + 0.5);
}

const latlngToSphere = latlngToPerfectSphere;
const sphereToLatlng = perfectSphereToLatlng;

export { latlngToSphere, sphereToLatlng };
