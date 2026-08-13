import * as THREE from "three";
import { TileProjection } from "./tile";
import { PolygonFeatureKind } from "./_types";

const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;

export function readFeatureString(
  feature: GeoJSON.Feature,
  key: string,
): string | null {
  const properties = feature.properties;
  if (!properties || typeof properties !== "object") {
    return null;
  }

  const direct = (properties as Record<string, unknown>)[key];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const tags = (properties as Record<string, unknown>).tags;
  if (tags && typeof tags === "object") {
    const fromTags = (tags as Record<string, unknown>)[key];
    if (typeof fromTags === "string" && fromTags.trim().length > 0) {
      return fromTags;
    }
  }

  return null;
}

export function polygonShape(
  rings: GeoJSON.Position[][],
  projection: TileProjection,
): THREE.Shape | null {
  if (rings.length === 0) {
    return null;
  }

  const outer = ringPoints(rings[0], projection);
  if (outer.length < 3) {
    return null;
  }

  const shape = new THREE.Shape(outer);
  for (const ring of rings.slice(1)) {
    const hole = ringPoints(ring, projection);
    if (hole.length >= 3) {
      shape.holes.push(new THREE.Path(hole));
    }
  }

  return shape;
}

export function shapeCentroidFromPoints(shape: THREE.Shape): [number, number] {
  const points = shape.getPoints();

  if (points.length < 3) {
    return [0, 0];
  }

  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;

    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  if (Math.abs(twiceArea) <= 1e-8) {
    let sumX = 0;
    let sumY = 0;

    for (const point of points) {
      sumX += point.x;
      sumY += point.y;
    }

    const avgX = sumX / points.length;
    const avgY = sumY / points.length;
    return [avgX, -avgY];
  }

  const cx = centroidX / (3 * twiceArea);
  const cy = centroidY / (3 * twiceArea);

  // Shape points are built in (x, -z), so flip back to (x, z).
  return [cx, -cy];
}

export function ringPoints(
  ring: GeoJSON.Position[],
  projection: TileProjection,
): THREE.Vector2[] {
  const end = ring.length > 1 ? ring.length - 1 : ring.length;
  return ring.slice(0, end).map((position) => {
    const { x, z } = projection.project(position);
    return new THREE.Vector2(x, -z);
  });
}

export function ringAreaSquareMeters(ring: GeoJSON.Position[]): number {
  const end = ring.length > 1 ? ring.length - 1 : ring.length;
  if (end < 3) {
    return 0;
  }

  const refLon = Number(ring[0]?.[0] ?? 0);
  const latitudes = ring.slice(0, end).map((position) => Number(position[1]));
  if (latitudes.some((latitude) => !Number.isFinite(latitude))) {
    return 0;
  }

  const refLat =
    latitudes.reduce((sum, latitude) => sum + latitude, 0) / latitudes.length;
  const cosRefLat = Math.cos(refLat * DEG_TO_RAD);

  const project = (position: GeoJSON.Position): { x: number; y: number } => {
    const lon = Number(position[0]);
    const lat = Number(position[1]);
    return {
      x: (lon - refLon) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosRefLat,
      y: lat * DEG_TO_RAD * EARTH_RADIUS_METERS,
    };
  };

  let twiceArea = 0;
  for (let index = 0; index < end; index += 1) {
    const current = project(ring[index]);
    const next = project(ring[(index + 1) % end]);
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea) * 0.5;
}

export function polygonAreaSquareMeters(rings: GeoJSON.Position[][]): number {
  if (rings.length === 0) {
    return 0;
  }

  const outer = ringAreaSquareMeters(rings[0]);
  const holes = rings
    .slice(1)
    .reduce((sum, hole) => sum + ringAreaSquareMeters(hole), 0);
  return Math.max(outer - holes, 0);
}

export function featureFootprintAreaSquareMeters(
  feature: GeoJSON.Feature,
): number | null {
  const geometry = feature.geometry;
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return polygonAreaSquareMeters(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    const area = geometry.coordinates.reduce(
      (sum, polygon) => sum + polygonAreaSquareMeters(polygon),
      0,
    );
    return Math.max(area, 0);
  }

  return null;
}

export function readProperty(feature: GeoJSON.Feature, key: string): unknown {
  const properties = feature.properties;
  if (!properties || typeof properties !== "object") {
    return undefined;
  }

  if (key in properties) {
    return properties[key];
  }

  const tags = properties.tags;
  if (tags && typeof tags === "object" && key in tags) {
    return (tags as Record<string, unknown>)[key];
  }

  return undefined;
}

export function classifyPolygonFeature(
  feature: GeoJSON.Feature,
): PolygonFeatureKind {
  if (
    readProperty(feature, "feature_type") === "building" ||
    readProperty(feature, "building") !== undefined
  ) {
    return "building";
  }

  if (
    readProperty(feature, "natural") === "water" ||
    readProperty(feature, "water") !== undefined ||
    readProperty(feature, "waterway") !== undefined
  ) {
    return "water";
  }

  if (readProperty(feature, "highway") !== undefined) {
    return "highway";
  }

  return "other";
}

export function readFeatureNumber(
  feature: GeoJSON.Feature,
  key: string,
): number | null {
  const value = readProperty(feature, key);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
