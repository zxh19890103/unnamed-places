import { LatLng, SpherePoint } from "./types";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
export const EARTH_RADIUS = 6_371_008.8;

function normalizeLongitude(lng: number): number {
  const wrapped = (((lng + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

export function latlngToSphere(
  lat: number,
  lng: number,
  radius = EARTH_RADIUS,
): SpherePoint {
  const latRad = lat * DEG_TO_RAD;
  const lngRad = lng * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);

  return {
    x: radius * cosLat * Math.cos(lngRad),
    y: radius * Math.sin(latRad),
    z: radius * cosLat * Math.sin(lngRad),
  };
}

export function sphereToLatlng(x: number, y: number, z: number): LatLng {
  const radius = Math.hypot(x, y, z);

  if (radius === 0) {
    throw new Error("sphereToLatlng requires a non-zero vector");
  }

  const lat = Math.asin(y / radius) * RAD_TO_DEG;
  const lng = Math.atan2(z, x) * RAD_TO_DEG;

  return { lat, lng: normalizeLongitude(lng) };
}
