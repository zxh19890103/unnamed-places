import * as THREE from "three";
import * as polygonUtils from "../_polygon";

export function isRiverWaterFeature(feature: GeoJSON.Feature): boolean {
  const waterway = polygonUtils
    .readFeatureString(feature, "waterway")
    ?.toLowerCase()
    .trim();
  const water = polygonUtils
    .readFeatureString(feature, "water")
    ?.toLowerCase()
    .trim();
  const natural = polygonUtils
    .readFeatureString(feature, "natural")
    ?.toLowerCase()
    .trim();

  if (waterway) {
    const normalized = waterway.split(";")[0]?.trim() ?? waterway;
    if (
      ["river", "stream", "canal", "drain", "ditch", "riverbank"].includes(
        normalized,
      )
    ) {
      return true;
    }
  }

  if (water) {
    const normalized = water.split(";")[0]?.trim() ?? water;
    if (["river", "stream", "canal"].includes(normalized)) {
      return true;
    }
  }

  return natural === "water" && Boolean(waterway);
}

function computePrincipalFlowFrame(
  positionAttr:
    | THREE.BufferAttribute<THREE.BufferAttributeEventMap>
    | THREE.InterleavedBufferAttribute,
): {
  centerX: number;
  centerZ: number;
  majorX: number;
  majorZ: number;
} | null {
  if (positionAttr.count < 2) {
    return null;
  }

  let sumX = 0;
  let sumZ = 0;
  for (let index = 0; index < positionAttr.count; index += 1) {
    sumX += positionAttr.getX(index);
    sumZ += positionAttr.getZ(index);
  }

  const centerX = sumX / positionAttr.count;
  const centerZ = sumZ / positionAttr.count;

  let covarianceXX = 0;
  let covarianceXZ = 0;
  let covarianceZZ = 0;

  for (let index = 0; index < positionAttr.count; index += 1) {
    const dx = positionAttr.getX(index) - centerX;
    const dz = positionAttr.getZ(index) - centerZ;

    covarianceXX += dx * dx;
    covarianceXZ += dx * dz;
    covarianceZZ += dz * dz;
  }

  const trace = covarianceXX + covarianceZZ;
  const determinant = covarianceXX * covarianceZZ - covarianceXZ * covarianceXZ;
  const discriminant = Math.max(trace * trace * 0.25 - determinant, 0);
  const majorEigenvalue = trace * 0.5 + Math.sqrt(discriminant);

  let majorX = majorEigenvalue - covarianceZZ;
  let majorZ = covarianceXZ;

  const length = Math.hypot(majorX, majorZ);
  if (!Number.isFinite(length) || length <= 1e-6) {
    if (covarianceXX >= covarianceZZ) {
      majorX = 1;
      majorZ = 0;
    } else {
      majorX = 0;
      majorZ = 1;
    }
  } else {
    majorX /= length;
    majorZ /= length;
  }

  return {
    centerX,
    centerZ,
    majorX,
    majorZ,
  };
}

function buildWaterFlowUv(
  feature: GeoJSON.Feature,
  polygon: THREE.BufferGeometry,
): Float32Array {
  const itemSize = 2;
  const positionAttr = polygon.getAttribute("position");

  if (!positionAttr) {
    return new Float32Array(0);
  }

  const waterFlowUv = new Float32Array(positionAttr.count * itemSize);
  if (!isRiverWaterFeature(feature)) {
    return waterFlowUv;
  }

  const frame = computePrincipalFlowFrame(positionAttr);
  if (!frame) {
    return waterFlowUv;
  }

  const minorX = -frame.majorZ;
  const minorZ = frame.majorX;

  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  let minAcross = Number.POSITIVE_INFINITY;
  let maxAcross = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < positionAttr.count; index += 1) {
    const dx = positionAttr.getX(index) - frame.centerX;
    const dz = positionAttr.getZ(index) - frame.centerZ;

    const along = dx * frame.majorX + dz * frame.majorZ;
    const across = dx * minorX + dz * minorZ;

    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
  }

  const alongRange = maxAlong - minAlong;
  const acrossRange = maxAcross - minAcross;

  if (alongRange <= 1e-6 || acrossRange <= 1e-6) {
    return waterFlowUv;
  }

  const mertersToUvScale = 0.01;

  for (let index = 0; index < positionAttr.count; index += 1) {
    const base = index * itemSize;

    const dx = positionAttr.getX(index) - frame.centerX;
    const dz = positionAttr.getZ(index) - frame.centerZ;

    const along = dx * frame.majorX + dz * frame.majorZ;
    const across = dx * minorX + dz * minorZ;

    waterFlowUv[base] = mertersToUvScale * (across - minAcross);
    waterFlowUv[base + 1] = mertersToUvScale * (along - minAlong);
  }

  return waterFlowUv;
}

export function addWaterFlow(
  feature: GeoJSON.Feature,
  polygon: THREE.BufferGeometry,
): void {
  polygon.setAttribute(
    "flowUv",
    new THREE.BufferAttribute(buildWaterFlowUv(feature, polygon), 2),
  );
}
