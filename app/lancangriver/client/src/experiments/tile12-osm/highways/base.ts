import * as THREE from "three";
import * as polygonUtils from "../_polygon.js";
import { HighwayCenterlineSample } from "./_types.js";

export const HIGHWAY_WIDTH_METERS_SCALE = 1.2;

const LANE_WIDTH_METERS = 3.5;
const DEFAULT_HIGHWAY_WIDTH_METERS = 4;

const HIGHWAY_TYPE_WIDTH_HINTS: Record<string, number> = {
  motorway: 7.5,
  trunk: 7.5,
  primary: 6.5,
  secondary: 5.75,
  tertiary: 5,
  unclassified: 4.25,
  residential: 4,
  living_street: 3.25,
  service: 3,
  road: 4,
  track: 2.5,
  path: 1.5,
  footway: 1.2,
  cycleway: 1.6,
  pedestrian: 2,
  steps: 1,
  bus_guideway: 4,
  corridor: 2,
};

const highwayClassOffsets: Record<string, number> = {
  motorway: 0.22,
  trunk: 0.2,
  primary: 0.18,
  secondary: 0.16,
  tertiary: 0.14,
  unclassified: 0.12,
  residential: 0.1,
  living_street: 0.08,
  service: 0.06,
  road: 0.06,
  track: 0.04,
  path: 0.03,
  footway: 0.02,
  cycleway: 0.025,
  pedestrian: 0.02,
  steps: 0.01,
  bus_guideway: 0.12,
  corridor: 0.08,
};

export function getHighwayOffGroundMeters(feature: GeoJSON.Feature) {
  const layer = polygonUtils.readFeatureNumber(feature, "layer") ?? 0;

  const isBridge = hasTruthyFeatureFlag(feature, "bridge");
  const isTunnel = hasTruthyFeatureFlag(feature, "tunnel");
  const isCovered = hasTruthyFeatureFlag(feature, "covered");

  const location = polygonUtils
    .readFeatureString(feature, "location")
    ?.toLowerCase()
    .trim();

  const hasBridgeLocation = location === "bridge";
  const hasTunnelLocation = location === "tunnel";

  const classBias = getHighwayClassOffset(feature);
  const layerBias = layer * 1.5;

  if (isTunnel || hasTunnelLocation) {
    return -2.5 + layerBias + classBias;
  }

  if (isBridge || hasBridgeLocation) {
    return 2.5 + layerBias + classBias;
  }

  let offGroundMeters = layerBias + classBias;

  if (polygonUtils.readFeatureString(feature, "embankment")) {
    offGroundMeters += 0.5;
  }

  if (polygonUtils.readFeatureString(feature, "cutting")) {
    offGroundMeters -= 0.5;
  }

  if (isCovered) {
    offGroundMeters -= 0.15;
  }

  return offGroundMeters;
}

function hasTruthyFeatureFlag(feature: GeoJSON.Feature, key: string): boolean {
  const value = polygonUtils.readFeatureString(feature, key);
  if (value !== null) {
    const normalized = value.toLowerCase().trim();
    return normalized === "yes" || normalized === "true" || normalized === "1";
  }

  const numeric = polygonUtils.readFeatureNumber(feature, key);
  if (numeric !== null) {
    return numeric !== 0;
  }

  const properties = feature.properties;
  if (!properties || typeof properties !== "object") {
    return false;
  }

  const direct = (properties as Record<string, unknown>)[key];
  return direct === true;
}

function getHighwayClassOffset(feature: GeoJSON.Feature): number {
  const type = polygonUtils
    .readFeatureString(feature, "highway")
    ?.toLowerCase()
    .trim();

  if (!type) {
    return 0;
  }

  const normalizedType = type.split(";")[0]?.trim() ?? type;

  return highwayClassOffsets[normalizedType] ?? 0;
}

export function isHighwayFeature(feature: GeoJSON.Feature): boolean {
  const property = polygonUtils.readFeatureString(feature, "highway");
  return property !== null && property !== undefined;
}

export function buildHighwayCenterlineSamples(
  path: THREE.CurvePath<THREE.Vector3>,
  distanceMeters: number,
  segmentCount: number = 0,
): HighwayCenterlineSample[] {
  const sampleCount = segmentCount
    ? segmentCount
    : Math.max(12, Math.ceil(distanceMeters / 2));

  const sampledPoints = path.getSpacedPoints(sampleCount);

  if (sampledPoints.length < 2) {
    return [
      { point: new THREE.Vector3(), cumulativeDistance: 0 },
      { point: new THREE.Vector3(0, 0, 0.001), cumulativeDistance: 0.001 },
    ];
  }

  const samples: HighwayCenterlineSample[] = [
    { point: sampledPoints[0].clone(), cumulativeDistance: 0 },
  ];

  let cumulativeDistance = 0;
  for (let index = 1; index < sampledPoints.length; index += 1) {
    cumulativeDistance += sampledPoints[index - 1].distanceTo(
      sampledPoints[index],
    );
    samples.push({
      point: sampledPoints[index].clone(),
      cumulativeDistance,
    });
  }

  return samples;
}

export function projectPointToHighwayCenterline(
  point: THREE.Vector3,
  centerline: HighwayCenterlineSample[],
): { sMeters: number; tMeters: number; point: THREE.Vector3 } {
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  let bestSMeters = 0;
  let bestTMeters = 0;

  const delta = new THREE.Vector3();
  const fromStart = new THREE.Vector3();
  const closest = new THREE.Vector3();

  for (let index = 0; index < centerline.length - 1; index += 1) {
    const start = centerline[index];
    const end = centerline[index + 1];

    delta.subVectors(end.point, start.point);

    const segmentLengthSq = delta.lengthSq();

    if (segmentLengthSq <= 1e-8) {
      continue;
    }

    fromStart.subVectors(point, start.point);

    const alongFactor = THREE.MathUtils.clamp(
      fromStart.dot(delta) / segmentLengthSq,
      0,
      1,
    );

    closest.copy(start.point).addScaledVector(delta, alongFactor);

    const distanceSq = point.distanceToSquared(closest);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestSMeters = Math.sqrt(distanceSq);
      bestTMeters =
        start.cumulativeDistance + Math.sqrt(segmentLengthSq) * alongFactor;
    }
  }

  if (!Number.isFinite(bestDistanceSq)) {
    return { sMeters: 0, tMeters: 0, point: point.clone() };
  }

  return {
    sMeters: bestSMeters,
    tMeters: bestTMeters,
    point: closest.clone(),
  };
}

function highwayWidthFromType(feature: GeoJSON.Feature): number {
  const highwayType = polygonUtils
    .readFeatureString(feature, "highway")
    ?.toLowerCase()
    .trim();
  if (!highwayType) {
    return DEFAULT_HIGHWAY_WIDTH_METERS;
  }

  const normalizedType = highwayType.split(";")[0]?.trim() ?? highwayType;
  return (
    HIGHWAY_TYPE_WIDTH_HINTS[normalizedType] ?? DEFAULT_HIGHWAY_WIDTH_METERS
  );
}

export function getHighwayWidthMeters(feature: GeoJSON.Feature): number {
  const explicitWidth = polygonUtils.readFeatureNumber(feature, "width");

  if (explicitWidth !== null && explicitWidth > 0) {
    return explicitWidth;
  }

  const lanes = polygonUtils.readFeatureNumber(feature, "lanes");
  if (lanes !== null && lanes > 0) {
    return Math.max(DEFAULT_HIGHWAY_WIDTH_METERS, lanes * LANE_WIDTH_METERS);
  }

  return highwayWidthFromType(feature);
}
