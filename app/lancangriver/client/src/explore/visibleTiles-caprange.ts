import * as THREE from "three";

import { SphereTileKey } from "../calc/types";
import { latlngToTilekey, tileBounds4326 } from "../calc/mercator";
import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";

const WEB_MERCATOR_MAX_LAT = 85.05112878;

type TileSample = {
  corners: THREE.Vector3[];
  center: THREE.Vector3;
};

type TileXRange = {
  start: number;
  end: number;
};

type TileIterationRanges = {
  xRanges: TileXRange[];
  yStart: number;
  yEnd: number;
};

function normalizeLng(lng: number): number {
  const normalized = ((((lng + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}

function toVector3(lat: number, lng: number, radius: number) {
  const p = latlngToSphere(lat, lng, radius);
  return new THREE.Vector3(p.x, p.y, p.z);
}

function getTileSample(key: SphereTileKey, radius: number): TileSample {
  const [west, south, east, north] = tileBounds4326(key.z, key.x, key.y);

  const corners = [
    toVector3(south, west, radius),
    toVector3(north, west, radius),
    toVector3(south, east, radius),
    toVector3(north, east, radius),
  ];

  const center = corners
    .reduce((acc, point) => acc.add(point), new THREE.Vector3())
    .multiplyScalar(0.25)
    .normalize()
    .multiplyScalar(radius);

  return { corners, center };
}

function getSphericalCap(camera: THREE.PerspectiveCamera, radius: number) {
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const distanceFromCenter = cameraPosition.length();

  if (!Number.isFinite(distanceFromCenter) || distanceFromCenter <= radius) {
    return {
      axis: new THREE.Vector3(0, 1, 0),
      minDot: -1,
      capAngle: Math.PI,
      cameraPosition,
    };
  }

  const horizonAngle = Math.acos(
    THREE.MathUtils.clamp(radius / distanceFromCenter, 0, 1),
  );
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const horizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * camera.aspect,
  );
  const viewHalfAngle = Math.max(verticalHalfFov, horizontalHalfFov);
  const margin = THREE.MathUtils.degToRad(3);
  const capAngle = Math.min(Math.PI, horizonAngle + viewHalfAngle + margin);

  return {
    axis: cameraPosition.clone().normalize(),
    minDot: Math.cos(capAngle),
    capAngle,
    cameraPosition,
  };
}

function getTileIterationRanges(
  axis: THREE.Vector3,
  capAngle: number,
  targetZoom: number,
): TileIterationRanges {
  const tileCount = 2 ** targetZoom;
  const centerLat = THREE.MathUtils.radToDeg(
    Math.asin(THREE.MathUtils.clamp(axis.y, -1, 1)),
  );
  const centerLng = THREE.MathUtils.radToDeg(Math.atan2(axis.x, axis.z));
  const capDeg = THREE.MathUtils.radToDeg(capAngle);

  const minLat = Math.max(-WEB_MERCATOR_MAX_LAT, centerLat - capDeg);
  const maxLat = Math.min(WEB_MERCATOR_MAX_LAT, centerLat + capDeg);

  const yNorth = latlngToTilekey(0, maxLat, targetZoom).y;
  const ySouth = latlngToTilekey(0, minLat, targetZoom).y;
  const yStart = Math.max(0, Math.min(yNorth, ySouth));
  const yEnd = Math.min(tileCount - 1, Math.max(yNorth, ySouth));

  const latCos = Math.cos(THREE.MathUtils.degToRad(centerLat));
  const lngRadius =
    Math.abs(latCos) < 1e-6 ? 180 : Math.min(180, capDeg / Math.abs(latCos));

  if (lngRadius >= 179.999) {
    return {
      xRanges: [{ start: 0, end: tileCount - 1 }],
      yStart,
      yEnd,
    };
  }

  const minLng = normalizeLng(centerLng - lngRadius);
  const maxLng = normalizeLng(centerLng + lngRadius);

  const xMin = latlngToTilekey(minLng, 0, targetZoom).x;
  const xMax = latlngToTilekey(maxLng, 0, targetZoom).x;

  if (minLng <= maxLng) {
    return {
      xRanges: [{ start: Math.min(xMin, xMax), end: Math.max(xMin, xMax) }],
      yStart,
      yEnd,
    };
  }

  return {
    xRanges: [
      { start: xMin, end: tileCount - 1 },
      { start: 0, end: xMax },
    ],
    yStart,
    yEnd,
  };
}

function isTileInsideSphericalCap(
  sample: TileSample,
  axis: THREE.Vector3,
  minDot: number,
): boolean {
  const centerDot = sample.center.clone().normalize().dot(axis);
  if (centerDot >= minDot) {
    return true;
  }

  for (const corner of sample.corners) {
    if (corner.clone().normalize().dot(axis) >= minDot) {
      return true;
    }
  }

  return false;
}

function isTileVisibleInFrustum(
  sample: TileSample,
  frustum: THREE.Frustum,
): boolean {
  let maxDist = 0;
  for (const point of sample.corners) {
    maxDist = Math.max(maxDist, point.distanceTo(sample.center));
  }

  return frustum.intersectsSphere(
    new THREE.Sphere(sample.center, maxDist * 1.1),
  );
}

function isTileFacingCamera(
  sample: TileSample,
  cameraPosition: THREE.Vector3,
): boolean {
  const normal = sample.center.clone().normalize();
  const toCamera = cameraPosition.clone().sub(sample.center).normalize();
  return normal.dot(toCamera) > 0.001;
}

/**
 * Option 1 (3D cap-range): enumerate target-zoom tiles, prefilter by spherical
 * cap in world-space, then apply frustum and facing checks.
 */
export function getVisibleTilesInCapRange(
  camera: THREE.PerspectiveCamera,
  targetZoom: number,
  radius: number = EARTH_RADIUS,
): SphereTileKey[] {
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);

  const { axis, minDot, capAngle, cameraPosition } = getSphericalCap(
    camera,
    radius,
  );

  const { xRanges, yStart, yEnd } = getTileIterationRanges(
    axis,
    capAngle,
    targetZoom,
  );
  const visible: SphereTileKey[] = [];

  console.log(xRanges.length);

  for (const xRange of xRanges) {
    for (let x = xRange.start; x <= xRange.end; x += 1) {
      for (let y = yStart; y <= yEnd; y += 1) {
        const key: SphereTileKey = { z: targetZoom, x, y };
        const sample = getTileSample(key, radius);

        if (!isTileInsideSphericalCap(sample, axis, minDot)) {
          continue;
        }

        if (!isTileVisibleInFrustum(sample, frustum)) {
          continue;
        }

        if (!isTileFacingCamera(sample, cameraPosition)) {
          continue;
        }

        visible.push(key);
      }
    }
  }

  return visible;
}
