import * as THREE from "three";
import { RoofStyle } from "./_types";

type RoofGeometryFactory = (roofprint: number[]) => THREE.BufferGeometry;

const create_geometry_roof_flat = (
  roofprint: number[],
): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(roofprint, 3),
  );

  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(new Array((2 * roofprint.length) / 3), 2),
  );

  return geometry;
};

const create_geometry_roof_fun = (roofprint: number[]) => {
  const geometry = new THREE.BufferGeometry();

  // Parse roofprint into points [x, y, z]
  let points: [number, number, number][] = [];
  for (let i = 0; i < roofprint.length; i += 3) {
    points.push([roofprint[i], roofprint[i + 1], roofprint[i + 2]]);
  }

  const centerScale = 0.2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const n = points.length;
  const heightMeters = 4;
  const metersToUvScale = 0.1;

  // Calculate centroid
  let cx = 0,
    cy = 0,
    cz = 0;

  for (const [x, y, z] of points) {
    cx += x;
    cy += y;
    cz += z;
  }

  cx /= points.length;
  cy /= points.length;
  cz /= points.length;

  // Scale points 1.5x around centroid
  const scaledPoints: [number, number, number][] = points.map(([x, y, z]) => [
    cx + (x - cx) * centerScale,
    y + heightMeters,
    cz + (z - cz) * centerScale,
  ]);

  points = points.map((p) => {
    return [cx + (p[0] - cx) * 1.2, p[1], cz + (p[2] - cz) * 1.2];
  });

  // Bottom face (fan triangulation from vertex 0)
  for (let i = 1; i < n - 1; i++) {
    positions.push(points[0][0], points[0][1], points[0][2]);
    positions.push(points[i][0], points[i][1], points[i][2]);
    positions.push(points[i + 1][0], points[i + 1][1], points[i + 1][2]);
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Top face (fan triangulation from vertex n, reversed winding)
  for (let i = 1; i < n - 1; i++) {
    positions.push(scaledPoints[0][0], scaledPoints[0][1], scaledPoints[0][2]);
    positions.push(
      scaledPoints[i + 1][0],
      scaledPoints[i + 1][1],
      scaledPoints[i + 1][2],
    );
    positions.push(scaledPoints[i][0], scaledPoints[i][1], scaledPoints[i][2]);
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Side faces (quads as two triangles)
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;

    // Triangle 1: bottom-i, bottom-next, top-i
    positions.push(points[i][0], points[i][1], points[i][2]);
    uvs.push(0, 0);

    positions.push(points[next][0], points[next][1], points[next][2]);
    uvs.push(distanceOf(points[i], points[next]) * metersToUvScale, 0);

    positions.push(scaledPoints[i][0], scaledPoints[i][1], scaledPoints[i][2]);
    uvs.push(0, distanceOf(scaledPoints[i], points[i]) * metersToUvScale);

    // Triangle 2: bottom-next, top-next, top-i
    positions.push(points[next][0], points[next][1], points[next][2]);
    uvs.push(distanceOf(points[i], points[next]) * metersToUvScale, 0);

    positions.push(
      scaledPoints[next][0],
      scaledPoints[next][1],
      scaledPoints[next][2],
    );
    uvs.push(
      distanceOf(scaledPoints[i], scaledPoints[next]) * metersToUvScale,
      distanceOf(points[next], scaledPoints[next]) * metersToUvScale,
    );

    positions.push(scaledPoints[i][0], scaledPoints[i][1], scaledPoints[i][2]);
    uvs.push(0, distanceOf(points[i], scaledPoints[i]) * metersToUvScale);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  return geometry;
};

export const create_geometry_roof: Record<RoofStyle, RoofGeometryFactory> = {
  flat: create_geometry_roof_flat,
  fun: create_geometry_roof_fun,
  skillion: null,
  gabled: null,
  hipped: null,
};

// Building types that suit a pyramid-style roof
const FUN_ROOF_TYPES = new Set([
  "house",
  "detached",
  "bungalow",
  "hut",
  "cabin",
  "church",
  "cathedral",
  "mosque",
  "synagogue",
  "chapel",
  "pagoda",
]);

export function resolveBuildingRoofStyle(
  feature: GeoJSON.Feature,
  heightMeters: number,
): RoofStyle {
  if (heightMeters < 10) {
    return "fun";
  }

  const props = feature.properties as Record<string, unknown> | null;
  const raw = (props?.["building"] ??
    props?.["building:use"] ??
    props?.["amenity"] ??
    "") as string;
  const type = raw.toLowerCase().trim().split(";")[0]?.trim() ?? "";

  if (FUN_ROOF_TYPES.has(type)) {
    return "fun";
  }

  return "flat";
}

function computeBaseline(feature: GeoJSON.Feature): THREE.Vector2[] {
  return null;
}

type ReadableRoof = {
  data: number[];
  edges: [THREE.Vector2, THREE.Vector2][];
  triangles: [THREE.Vector2, THREE.Vector2, THREE.Vector2][];
};

function toReableRoof(roofprint: number[]): ReadableRoof {
  return null;
}

function distanceOf(p0: number[], p1: number[]) {
  return Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]);
}
