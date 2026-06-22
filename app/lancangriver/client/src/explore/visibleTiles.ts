import * as THREE from "three";

import { latlngToTilekey, tileBounds4326 } from "../calc/mercator";
import { latlngToSphere, sphereToLatlng } from "../calc/sphere";
import { SphereTileKey } from "../calc/types";

const EPSILON = 0.001;
const SAFETY_PADDING_RINGS = 2;

type TileSample = {
  corners: THREE.Vector3[];
  center: THREE.Vector3;
};

type QueueItem = {
  x: number;
  y: number;
  ring: number;
};

function makeFrustum(camera: THREE.PerspectiveCamera): THREE.Frustum {
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);
  return frustum;
}

function tileSample(key: SphereTileKey, radius: number): TileSample {
  const [west, south, east, north] = tileBounds4326(key.z, key.x, key.y);
  const corners = [
    latlngToSphere(south, west, radius),
    latlngToSphere(north, west, radius),
    latlngToSphere(south, east, radius),
    latlngToSphere(north, east, radius),
  ].map((p) => new THREE.Vector3(p.x, p.y, p.z));

  const center = corners
    .reduce((acc, corner) => acc.add(corner), new THREE.Vector3())
    .multiplyScalar(0.25)
    .normalize()
    .multiplyScalar(radius);

  return { corners, center };
}

function isSampleInFrustum(
  sample: TileSample,
  frustum: THREE.Frustum,
): boolean {
  let maxDist = 0;
  for (const corner of sample.corners) {
    maxDist = Math.max(maxDist, corner.distanceTo(sample.center));
  }
  const bounds = new THREE.Sphere(sample.center, maxDist * 1.1);
  return frustum.intersectsSphere(bounds);
}

function isSampleFacingCamera(
  sample: TileSample,
  cameraPosition: THREE.Vector3,
): boolean {
  const normal = sample.center.clone().normalize();
  const toCamera = cameraPosition.clone().sub(sample.center).normalize();
  return normal.dot(toCamera) > EPSILON;
}

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function wrapX(x: number, tileCount: number): number {
  return ((x % tileCount) + tileCount) % tileCount;
}

function modDistance(a: number, b: number, modulo: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, modulo - d);
}

function tileId(z: number, x: number, y: number): string {
  return `${z}:${x}:${y}`;
}

function rayDirectionFromNdc(
  camera: THREE.PerspectiveCamera,
  ndcX: number,
  ndcY: number,
): THREE.Vector3 {
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const worldPoint = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  return worldPoint.sub(cameraPosition).normalize();
}

function intersectRaySphere(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  radius: number,
): THREE.Vector3 | null {
  const b = 2 * origin.dot(direction);
  const c = origin.lengthSq() - radius * radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return null;
  }

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / 2;
  const t2 = (-b + sqrtD) / 2;

  let t = Number.POSITIVE_INFINITY;
  if (t1 > 0) {
    t = t1;
  }
  if (t2 > 0) {
    t = Math.min(t, t2);
  }

  if (!Number.isFinite(t)) {
    return null;
  }

  return origin.clone().addScaledVector(direction, t);
}

function getCenterSpherePoint(
  camera: THREE.PerspectiveCamera,
  radius: number,
): THREE.Vector3 {
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const centerRayDirection = rayDirectionFromNdc(camera, 0, 0);
  const hit = intersectRaySphere(cameraPosition, centerRayDirection, radius);

  if (hit) {
    return hit;
  }

  return cameraPosition.clone().normalize().multiplyScalar(radius);
}

function getRingLimit(
  camera: THREE.PerspectiveCamera,
  zoom: number,
  radius: number,
  centerPoint: THREE.Vector3,
  centerKey: SphereTileKey,
): number {
  const tileCount = 2 ** zoom;
  if (tileCount <= 1) {
    return 0;
  }

  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const cameraDistance = cameraPosition.length();

  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const horizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * camera.aspect,
  );
  const viewHalfAngle = Math.max(verticalHalfFov, horizontalHalfFov);
  const horizonAngle =
    cameraDistance <= radius
      ? Math.PI
      : Math.acos(THREE.MathUtils.clamp(radius / cameraDistance, 0, 1));

  const centerNormal = centerPoint.clone().normalize();
  let edgeAngle = 0;
  const edgeSamples: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];

  for (const [ndcX, ndcY] of edgeSamples) {
    const direction = rayDirectionFromNdc(camera, ndcX, ndcY);
    const hit = intersectRaySphere(cameraPosition, direction, radius);
    if (!hit) {
      continue;
    }
    const angle = centerNormal.angleTo(hit.clone().normalize());
    edgeAngle = Math.max(edgeAngle, angle);
  }

  const margin = THREE.MathUtils.degToRad(2);
  const coverageAngle = Math.min(
    Math.PI,
    Math.max(horizonAngle + viewHalfAngle, edgeAngle) + margin,
  );

  const centerLatLng = sphereToLatlng(
    centerPoint.x,
    centerPoint.y,
    centerPoint.z,
  );
  const capDegrees = THREE.MathUtils.radToDeg(coverageAngle);

  const northKey = latlngToTilekey(
    centerLatLng.lng,
    clampLat(centerLatLng.lat + capDegrees),
    zoom,
  );
  const southKey = latlngToTilekey(
    centerLatLng.lng,
    clampLat(centerLatLng.lat - capDegrees),
    zoom,
  );
  const dy = Math.max(
    Math.abs(northKey.y - centerKey.y),
    Math.abs(southKey.y - centerKey.y),
  );

  const latRad = THREE.MathUtils.degToRad(centerLatLng.lat);
  const cosLat = Math.max(0.05, Math.abs(Math.cos(latRad)));
  const lngRadius = Math.min(180, capDegrees / cosLat);
  const eastKey = latlngToTilekey(
    centerLatLng.lng + lngRadius,
    centerLatLng.lat,
    zoom,
  );
  const westKey = latlngToTilekey(
    centerLatLng.lng - lngRadius,
    centerLatLng.lat,
    zoom,
  );
  const dx = Math.max(
    modDistance(centerKey.x, eastKey.x, tileCount),
    modDistance(centerKey.x, westKey.x, tileCount),
  );

  const ring = Math.max(dx, dy) + SAFETY_PADDING_RINGS;
  return Math.max(1, Math.min(tileCount, ring));
}

export const getVisibleTiles = (
  camera: THREE.PerspectiveCamera,
  zoom: number,
  radius: number,
): SphereTileKey[] => {
  if (!Number.isFinite(zoom) || zoom < 0) {
    return [];
  }

  const tileCount = 2 ** zoom;
  const frustum = makeFrustum(camera);
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());

  const centerPoint = getCenterSpherePoint(camera, radius);
  const centerLatLng = sphereToLatlng(
    centerPoint.x,
    centerPoint.y,
    centerPoint.z,
  );
  const centerKey = latlngToTilekey(centerLatLng.lng, centerLatLng.lat, zoom);
  const ringLimit = getRingLimit(camera, zoom, radius, centerPoint, centerKey);

  const visible: SphereTileKey[] = [];
  const queue: QueueItem[] = [{ x: centerKey.x, y: centerKey.y, ring: 0 }];
  const visited = new Set<string>([tileId(zoom, centerKey.x, centerKey.y)]);

  for (let idx = 0; idx < queue.length; idx += 1) {
    const node = queue[idx];
    const key: SphereTileKey = { z: zoom, x: node.x, y: node.y };
    const sample = tileSample(key, radius);

    const inFrustum = isSampleInFrustum(sample, frustum);
    const facing = isSampleFacingCamera(sample, cameraPosition);

    if (inFrustum && facing) {
      visible.push(key);
    }

    if (node.ring >= ringLimit) {
      continue;
    }

    if (!inFrustum && node.ring > 1) {
      continue;
    }

    const nextRing = node.ring + 1;
    const neighbors = [
      [node.x + 1, node.y],
      [node.x - 1, node.y],
      [node.x, node.y + 1],
      [node.x, node.y - 1],
    ];

    for (const [nextXRaw, nextY] of neighbors) {
      if (nextY < 0 || nextY >= tileCount) {
        continue;
      }

      const nextX = wrapX(nextXRaw, tileCount);
      const id = tileId(zoom, nextX, nextY);
      if (visited.has(id)) {
        continue;
      }

      visited.add(id);
      queue.push({ x: nextX, y: nextY, ring: nextRing });
    }
  }

  visible.sort((a, b) => a.y - b.y || a.x - b.x);
  return visible;
};
