import * as THREE from "three";

import type { TileCoords } from "../../osm/tiles";
import {
  classifyPolygonFeature,
  createTileProjection,
  readFeatureNumber,
  type TileProjection,
} from "./tile";

type TileVectorGroup = {
  group: THREE.Group;
  projection: TileProjection;
  objectCount: number;
  dispose: () => void;
};

const DEFAULT_BUILDING_HEIGHT = 12;

function ringPoints(
  ring: GeoJSON.Position[],
  projection: TileProjection,
): THREE.Vector2[] {
  const end = ring.length > 1 ? ring.length - 1 : ring.length;
  return ring.slice(0, end).map((position) => {
    const { x, z } = projection.project(position);
    return new THREE.Vector2(x, -z);
  });
}

function polygonShape(
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

function buildingHeight(feature: GeoJSON.Feature): number {
  const height = readFeatureNumber(feature, "height");
  if (height !== null && height > 0) {
    return height;
  }

  const levels = readFeatureNumber(feature, "building:levels");
  if (levels !== null && levels > 0) {
    return levels * 3.2;
  }

  return DEFAULT_BUILDING_HEIGHT;
}

function addPolygon(
  group: THREE.Group,
  feature: GeoJSON.Feature,
  rings: GeoJSON.Position[][],
  projection: TileProjection,
  materials: {
    building: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    other: THREE.MeshStandardMaterial;
  },
): number {
  const shape = polygonShape(rings, projection);
  if (!shape) {
    return 0;
  }

  const kind = classifyPolygonFeature(feature);
  let geometry: THREE.BufferGeometry;
  let material: THREE.MeshStandardMaterial;

  if (kind === "building") {
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1, buildingHeight(feature)),
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1,
    });
    material = materials.building;
  } else {
    geometry = new THREE.ShapeGeometry(shape);
    material = kind === "water" ? materials.water : materials.other;
  }

  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  if (kind !== "building") {
    mesh.position.y = kind === "water" ? 0.1 : 0.05;
  }
  group.add(mesh);
  return 1;
}

function addLine(
  group: THREE.Group,
  coordinates: GeoJSON.Position[],
  projection: TileProjection,
  material: THREE.LineBasicMaterial,
): number {
  if (coordinates.length < 2) {
    return 0;
  }

  const points = coordinates.map((position) => {
    const { x, z } = projection.project(position);
    return new THREE.Vector3(x, 0.35, z);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  group.add(new THREE.Line(geometry, material));
  return 1;
}

function addPoint(
  group: THREE.Group,
  position: GeoJSON.Position,
  projection: TileProjection,
  geometry: THREE.SphereGeometry,
  material: THREE.MeshStandardMaterial,
): number {
  const projected = projection.project(position);
  const marker = new THREE.Mesh(geometry, material);
  marker.position.set(projected.x, geometry.parameters.radius, projected.z);
  group.add(marker);
  return 1;
}

function addFeature(
  group: THREE.Group,
  feature: GeoJSON.Feature,
  projection: TileProjection,
  resources: {
    materials: {
      building: THREE.MeshStandardMaterial;
      water: THREE.MeshStandardMaterial;
      other: THREE.MeshStandardMaterial;
      line: THREE.LineBasicMaterial;
      point: THREE.MeshStandardMaterial;
    };
    pointGeometry: THREE.SphereGeometry;
  },
): number {
  const geometry = feature.geometry;
  if (!geometry) {
    return 0;
  }

  switch (geometry.type) {
    case "Polygon":
      return addPolygon(
        group,
        feature,
        geometry.coordinates,
        projection,
        resources.materials,
      );
    case "MultiPolygon":
      return geometry.coordinates.reduce(
        (count, polygon) =>
          count +
          addPolygon(group, feature, polygon, projection, resources.materials),
        0,
      );
    case "LineString":
      return addLine(
        group,
        geometry.coordinates,
        projection,
        resources.materials.line,
      );
    case "MultiLineString":
      return geometry.coordinates.reduce(
        (count, line) =>
          count + addLine(group, line, projection, resources.materials.line),
        0,
      );
    case "Point":
      return addPoint(
        group,
        geometry.coordinates,
        projection,
        resources.pointGeometry,
        resources.materials.point,
      );
    case "MultiPoint":
      return geometry.coordinates.reduce(
        (count, point) =>
          count +
          addPoint(
            group,
            point,
            projection,
            resources.pointGeometry,
            resources.materials.point,
          ),
        0,
      );
    default:
      return 0;
  }
}

export function buildTileVectorGroup(
  features: GeoJSON.Feature[],
  tile: TileCoords,
): TileVectorGroup {
  const projection = createTileProjection(tile);
  const group = new THREE.Group();
  group.name = `tile-vectors-${tile.z}-${tile.x}-${tile.y}`;

  const markerRadius = Math.max(
    1,
    Math.min(projection.widthMeters, projection.heightMeters) * 0.004,
  );
  const materials = {
    building: new THREE.MeshStandardMaterial({
      color: "#d39b62",
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    water: new THREE.MeshStandardMaterial({
      color: "#3b82a0",
      roughness: 0.58,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    other: new THREE.MeshStandardMaterial({
      color: "#8b9a73",
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    line: new THREE.LineBasicMaterial({ color: "#f5d28c" }),
    point: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.7 }),
  };
  const pointGeometry = new THREE.SphereGeometry(markerRadius, 10, 8);
  const resources = { materials, pointGeometry };

  let objectCount = 0;
  for (const feature of features) {
    objectCount += addFeature(group, feature, projection, resources);
  }

  const halfWidth = projection.widthMeters * 0.5;
  const halfHeight = projection.heightMeters * 0.5;
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfWidth, 0.2, -halfHeight),
    new THREE.Vector3(halfWidth, 0.2, -halfHeight),
    new THREE.Vector3(halfWidth, 0.2, halfHeight),
    new THREE.Vector3(-halfWidth, 0.2, halfHeight),
  ]);
  const outlineMaterial = new THREE.LineBasicMaterial({ color: "#d1d5db" });
  group.add(new THREE.LineLoop(outlineGeometry, outlineMaterial));

  return {
    group,
    projection,
    objectCount,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
        }
      });

      for (const material of Object.values(materials)) {
        material.dispose();
      }
      pointGeometry.dispose();
      outlineMaterial.dispose();
    },
  };
}
