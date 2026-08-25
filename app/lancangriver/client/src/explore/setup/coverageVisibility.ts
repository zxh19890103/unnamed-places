import * as THREE from 'three';

import { EARTH_RADIUS, sphereToLatlng } from '@/_3dtiles';

type TileKeyLike = {
  z: number;
  x: number;
  y: number;
};

export type VisibleCoverageTile = {
  key: string;
  z: number;
  x: number;
  y: number;
};

const DEFAULT_PADDING_PX = 40;
const DEFAULT_SAMPLE_STEP_PX = 56;
const MAX_BBOX_SPAN_KM = 30;
const KM_PER_LAT_DEGREE = 111.32;

function tileOverlaps(a: TileKeyLike, b: TileKeyLike): boolean {
  if (a.z === b.z) {
    return a.x === b.x && a.y === b.y;
  }

  if (a.z < b.z) {
    const delta = b.z - a.z;
    return b.x >> delta === a.x && b.y >> delta === a.y;
  }

  const delta = a.z - b.z;
  return a.x >> delta === b.x && a.y >> delta === b.y;
}

export type LatLngBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type ComputeVisibleGroundBBoxOptions = {
  camera: THREE.PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  paddingPx?: number;
  sampleStepPx?: number;
};

/** Raycasts a screen-space grid onto the earth sphere and returns the lat/lng bbox of the hits. */
export function computeVisibleGroundBBox({
  camera,
  viewportWidth,
  viewportHeight,
  paddingPx = DEFAULT_PADDING_PX,
  sampleStepPx = DEFAULT_SAMPLE_STEP_PX,
}: ComputeVisibleGroundBBoxOptions): LatLngBBox | null {
  const safeWidth = Math.max(1, Math.floor(viewportWidth));
  const safeHeight = Math.max(1, Math.floor(viewportHeight));
  const safePadding = Math.max(0, Math.floor(paddingPx));
  const safeStep = Math.max(8, Math.floor(sampleStepPx));

  const raycaster = new THREE.Raycaster();
  const earth = new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_RADIUS);
  const hitPoint = new THREE.Vector3();

  const sampleX: number[] = [];
  for (let x = -safePadding; x <= safeWidth + safePadding; x += safeStep) {
    sampleX.push(Math.min(safeWidth + safePadding, x));
  }
  if (sampleX[sampleX.length - 1] !== safeWidth + safePadding) {
    sampleX.push(safeWidth + safePadding);
  }

  const sampleY: number[] = [];
  for (let y = -safePadding; y <= safeHeight + safePadding; y += safeStep) {
    sampleY.push(Math.min(safeHeight + safePadding, y));
  }

  if (sampleY[sampleY.length - 1] !== safeHeight + safePadding) {
    sampleY.push(safeHeight + safePadding);
  }

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let hasHit = false;

  for (const screenY of sampleY) {
    const ndcY = 1 - (screenY / safeHeight) * 2;

    for (const screenX of sampleX) {
      const ndcX = (screenX / safeWidth) * 2 - 1;

      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      if (!raycaster.ray.intersectSphere(earth, hitPoint)) {
        continue;
      }

      const latlng = sphereToLatlng(hitPoint.x, hitPoint.y, hitPoint.z);
      hasHit = true;
      west = Math.min(west, latlng.lng);
      east = Math.max(east, latlng.lng);
      south = Math.min(south, latlng.lat);
      north = Math.max(north, latlng.lat);
    }
  }

  if (!hasHit) {
    return null;
  }

  return clampBBoxSpanKm({ west, south, east, north }, MAX_BBOX_SPAN_KM);
}

/** Clamps a bbox so its lat/lng spans never exceed maxSpanKm, keeping it centered. */
function clampBBoxSpanKm(bbox: LatLngBBox, maxSpanKm: number): LatLngBBox {
  const centerLat = (bbox.south + bbox.north) / 2;
  const centerLng = (bbox.west + bbox.east) / 2;

  const maxLatSpanDeg = maxSpanKm / KM_PER_LAT_DEGREE;
  const cosLat = Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
  const maxLngSpanDeg = maxSpanKm / (KM_PER_LAT_DEGREE * cosLat);

  const latSpan = Math.min(bbox.north - bbox.south, maxLatSpanDeg);
  const lngSpan = Math.min(bbox.east - bbox.west, maxLngSpanDeg);

  return {
    west: centerLng - lngSpan / 2,
    east: centerLng + lngSpan / 2,
    south: centerLat - latSpan / 2,
    north: centerLat + latSpan / 2,
  };
}

export const coverageVisibilityInternals = {
  tileOverlaps,
};
