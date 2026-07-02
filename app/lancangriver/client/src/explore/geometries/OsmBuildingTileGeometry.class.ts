import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LatLng } from "../../calc/types";

type Parameters = {
  features: GeoJSON.Feature[];
  origin: LatLng;
  defaultHeightMeters?: number;
  minFootprintAreaSqm?: number;
};

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLng(lat: number): number {
  return Math.cos((lat * Math.PI) / 180) * METERS_PER_DEG_LAT;
}

function projectLngLatToLocal(
  point: GeoJSON.Position,
  origin: LatLng,
): THREE.Vector2 {
  const [lng, lat] = point;
  const x = (lng - origin.lng) * metersPerDegLng(origin.lat);
  const north = (lat - origin.lat) * METERS_PER_DEG_LAT;

  // Shape uses x/y; we store north in -y so post-rotation keeps +z as north.
  return new THREE.Vector2(x, -north);
}

function ringToShapePoints(
  ring: GeoJSON.Position[],
  origin: LatLng,
): THREE.Vector2[] {
  const clean = ring.length > 1 ? ring.slice(0, -1) : ring;
  return clean.map((point) => projectLngLatToLocal(point, origin));
}

function polygonArea(points: THREE.Vector2[]): number {
  if (points.length < 3) {
    return 0;
  }

  let area2 = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area2 += a.x * b.y - b.x * a.y;
  }

  return Math.abs(area2) * 0.5;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function resolveBuildingHeight(
  properties: GeoJSON.GeoJsonProperties,
  defaultHeightMeters: number,
): number {
  const explicitHeight = toNumber(properties?.height);
  if (explicitHeight && explicitHeight > 0) {
    return explicitHeight;
  }

  const levels = toNumber(properties?.["building:levels"]);
  if (levels && levels > 0) {
    return levels * 3.2;
  }

  return defaultHeightMeters;
}

function isBuildingFeature(feature: GeoJSON.Feature): boolean {
  const props = feature.properties;
  if (!props || typeof props !== "object") {
    return false;
  }

  if (props.feature_type === "building") {
    return true;
  }

  return typeof props.building === "string" || props.building === true;
}

function createPolygonGeometry(
  rings: GeoJSON.Position[][],
  origin: LatLng,
  height: number,
  minFootprintAreaSqm: number,
): THREE.ExtrudeGeometry | null {
  if (rings.length === 0) {
    return null;
  }

  const outer = ringToShapePoints(rings[0], origin);
  if (outer.length < 3 || polygonArea(outer) < minFootprintAreaSqm) {
    return null;
  }

  const shape = new THREE.Shape(outer);

  for (let holeIndex = 1; holeIndex < rings.length; holeIndex += 1) {
    const hole = ringToShapePoints(rings[holeIndex], origin);
    if (hole.length < 3) {
      continue;
    }

    shape.holes.push(new THREE.Path(hole));
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, height),
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });

  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export class OsmBuildingTileGeometry extends THREE.BufferGeometry {
  constructor(parameters: Parameters) {
    super();

    const {
      features,
      origin,
      defaultHeightMeters = 12,
      minFootprintAreaSqm = 4,
    } = parameters;

    const geoms: THREE.BufferGeometry[] = [];

    for (const feature of features) {
      if (!isBuildingFeature(feature) || !feature.geometry) {
        continue;
      }

      const height = resolveBuildingHeight(
        feature.properties,
        defaultHeightMeters,
      );

      if (feature.geometry.type === "Polygon") {
        const geom = createPolygonGeometry(
          feature.geometry.coordinates,
          origin,
          height,
          minFootprintAreaSqm,
        );
        if (geom) {
          geoms.push(geom);
        }
      }

      if (feature.geometry.type === "MultiPolygon") {
        for (const polygon of feature.geometry.coordinates) {
          const geom = createPolygonGeometry(
            polygon,
            origin,
            height,
            minFootprintAreaSqm,
          );
          if (geom) {
            geoms.push(geom);
          }
        }
      }
    }

    if (geoms.length === 0) {
      this.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(0), 3),
      );
      return;
    }

    const merged = mergeGeometries(geoms, false);
    for (const geom of geoms) {
      geom.dispose();
    }

    if (!merged) {
      this.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(0), 3),
      );
      return;
    }

    this.copy(merged);
    merged.dispose();
    this.computeVertexNormals();
    this.computeBoundingBox();
    this.computeBoundingSphere();
  }
}
