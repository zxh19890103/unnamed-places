/**
 * Earth's radius (in meters) on equator
 */
const ER = 6.378137 * 1e6;

const PI = Math.PI,
  _log = Math.log,
  _tan = Math.tan,
  _cos = Math.cos,
  _floor = Math.floor,
  _pow = Math.pow,
  _atan = Math.atan,
  _sinh = Math.sinh;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const ZOOM_BASIS = 12;
export const Meters_per_lat = 111132;
export function Meters_per_lon(lat) {
  return 111320 * _cos(lat * DEG2RAD);
}

export function tileToLatLon(x, y, zoom) {
  const n = _pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = _atan(_sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = latRad * RAD2DEG;
  return { lat, lng };
}

export function convert4326To3857(latlng) {
  // X coordinate: linear conversion
  let x = latlng.lng * DEG2RAD * ER;

  // Y coordinate: Mercator projection formula
  let y = _log(_tan(((90 + latlng.lat) * PI) / 360)) * ER;

  return { x, y };
}

export function calcTileBBOX(x, y, z) {
  const leftTop = tileToLatLon(x, y, z);
  const rightTop = tileToLatLon(x + 1, y, z);
  const leftBottom = tileToLatLon(x, y + 1, z);
  const rightBottom = tileToLatLon(x + 1, y + 1, z);
  const center = tileToLatLon(x + 0.5, y + 0.5, z);

  const bbox = `${leftBottom.lat},${leftBottom.lng},${rightTop.lat},${rightTop.lng}`;
  const bbox3857 = `${convert4326To3857(leftBottom)},${convert4326To3857(
    rightTop,
  )}`;

  const dLng = rightTop.lng - leftBottom.lng;
  const dLat = rightTop.lat - leftBottom.lat;

  const meters_per_lon = Meters_per_lon(center.lat);

  console.log("meters_per_lon=", meters_per_lon);
  console.log("Meters_per_lat=", Meters_per_lat);

  const measure_on_x = meters_per_lon * dLng;
  const measure_on_y = Meters_per_lat * dLat;

  return {
    x,
    y,
    z,
    placement: "none",
    leftTop,
    rightTop,
    leftBottom,
    rightBottom,
    center,
    measureX: measure_on_x,
    measureY: measure_on_y,
    dLng: dLng,
    dLat: dLat,
    bbox: bbox,
    bbox3857: bbox3857,
  };
}

export const createLatlngToTileCoordProjector = (xyz) => {
  const bbox = calcTileBBOX(xyz.x, xyz.y, xyz.z);

  const meters_per_lon = Meters_per_lon(bbox.center.lat);

  const project = (lnglat) => {
    const dlat = lnglat[1] - bbox.leftBottom.lat;
    const dlng = lnglat[0] - bbox.leftBottom.lng;

    const x = meters_per_lon * dlng;
    const y = Meters_per_lat * dlat;

    return [x, y, 0];
  };

  return project;
};
