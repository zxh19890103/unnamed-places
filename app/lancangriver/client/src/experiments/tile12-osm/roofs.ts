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

  return geometry;
};

const create_geometry_roof_fun = (roofprint: number[]) => {
  const geometry = new THREE.BufferGeometry();

  // Parse roofprint into points [x, y, z]
  const points: [number, number, number][] = [];
  for (let i = 0; i < roofprint.length; i += 3) {
    points.push([roofprint[i], roofprint[i + 1], roofprint[i + 2]]);
  }

  const scale = 0.5;

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
    cx + (x - cx) * scale,
    cy,
    cz + (z - cz) * scale,
  ]);

  const positions: number[] = [];
  const uvs: number[] = [];
  const n = points.length;
  const heightMeters = 4;
  const metersToUvScale = 0.1;

  // Bottom face (fan triangulation from vertex 0)
  for (let i = 1; i < n - 1; i++) {
    positions.push(points[0][0], points[0][1], points[0][2]);
    positions.push(points[i][0], points[i][1], points[i][2]);
    positions.push(points[i + 1][0], points[i + 1][1], points[i + 1][2]);
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Top face (fan triangulation from vertex n, reversed winding)
  for (let i = 1; i < n - 1; i++) {
    positions.push(
      scaledPoints[0][0],
      scaledPoints[0][1] + heightMeters,
      scaledPoints[0][2],
    );
    positions.push(
      scaledPoints[i + 1][0],
      scaledPoints[i + 1][1] + heightMeters,
      scaledPoints[i + 1][2],
    );
    positions.push(
      scaledPoints[i][0],
      scaledPoints[i][1] + heightMeters,
      scaledPoints[i][2],
    );
    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Side faces (quads as two triangles)
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;

    // Triangle 1: bottom-i, bottom-next, top-i
    positions.push(points[i][0], points[i][1], points[i][2]);
    positions.push(points[next][0], points[next][1], points[next][2]);
    positions.push(
      scaledPoints[i][0],
      scaledPoints[i][1] + heightMeters,
      scaledPoints[i][2],
    );
    {
      const t1_baseLen = Math.hypot(
        points[next][0] - points[i][0],
        points[next][2] - points[i][2],
      );
      const t1_leftSlant = Math.hypot(
        scaledPoints[i][0] - points[i][0],
        scaledPoints[i][1] + heightMeters - points[i][1],
        scaledPoints[i][2] - points[i][2],
      );
      // diagonal from bottom-next to top-i (the hypotenuse of this triangle)
      const t1_rightDiag = Math.hypot(
        scaledPoints[i][0] - points[next][0],
        scaledPoints[i][1] + heightMeters - points[next][1],
        scaledPoints[i][2] - points[next][2],
      );
      uvs.push(
        0,
        t1_leftSlant * metersToUvScale,
        t1_baseLen * metersToUvScale,
        t1_rightDiag * metersToUvScale,
        0,
        0,
      );
    }

    // Triangle 2: bottom-next, top-next, top-i
    positions.push(points[next][0], points[next][1], points[next][2]);
    positions.push(
      scaledPoints[next][0],
      scaledPoints[next][1] + heightMeters,
      scaledPoints[next][2],
    );
    positions.push(
      scaledPoints[i][0],
      scaledPoints[i][1] + heightMeters,
      scaledPoints[i][2],
    );
    {
      const t2_rightSlant = Math.hypot(
        scaledPoints[next][0] - points[next][0],
        scaledPoints[next][1] + heightMeters - points[next][1],
        scaledPoints[next][2] - points[next][2],
      );
      const t2_topLen = Math.hypot(
        scaledPoints[next][0] - scaledPoints[i][0],
        scaledPoints[next][2] - scaledPoints[i][2],
      );
      // diagonal from top-i to bottom-next (the hypotenuse of this triangle)
      const t2_diagLen = Math.hypot(
        points[next][0] - scaledPoints[i][0],
        points[next][1] - (scaledPoints[i][1] + heightMeters),
        points[next][2] - scaledPoints[i][2],
      );
      uvs.push(
        t2_diagLen * metersToUvScale,
        t2_rightSlant * metersToUvScale,
        t2_topLen * metersToUvScale,
        0,
        0,
        0,
      );
    }
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
