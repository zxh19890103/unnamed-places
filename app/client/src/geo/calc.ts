/**
 * Earth's radius (in meters) on equator
 */
const ER = 6.378137 * 1e6;
/**
 * Earth's radius (in meters) on polar
 */
const EPR = 6.356752 * 1e6;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MAX_LAT = 85.05112877980659;

export const ZOOM_BASIS = 12;
export const Meters_per_lat = 111132;
export function Meters_per_lon(lat: number) {
  return 111320 * _cos(lat * DEG2RAD);
}

const PI = Math.PI,
  _log = Math.log,
  _tan = Math.tan,
  _cos = Math.cos,
  _floor = Math.floor,
  _pow = Math.pow,
  _atan = Math.atan,
  _sinh = Math.sinh;

export function latLonToTile(latlng: L.LatLngLiteral, zoom: number) {
  const latRad = latlng.lat * DEG2RAD;
  const n = _pow(2, zoom);
  const x = n * ((latlng.lng + 180) / 360);
  const y = (n * (1 - _log(_tan(latRad) + 1 / _cos(latRad)) / PI)) / 2;
  return {
    x: _floor(x),
    y: _floor(y),
    z: zoom,
  };
}

export function tileToLatLon(
  x: number,
  y: number,
  zoom: number
): L.LatLngLiteral {
  const n = _pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = _atan(_sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = latRad * RAD2DEG;
  return { lat, lng };
}

export function convert4326To3857(latlng: L.LatLngLiteral) {
  // X coordinate: linear conversion
  let x = latlng.lng * DEG2RAD * ER;

  // Y coordinate: Mercator projection formula
  let y = _log(_tan(((90 + latlng.lat) * PI) / 360)) * ER;

  return { x, y };
}
