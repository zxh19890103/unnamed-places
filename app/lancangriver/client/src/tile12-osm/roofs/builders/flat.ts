import * as THREE from "three";
import { TileProjection } from "../../tile.js";
import * as helpers from "../_helpers.js";

const building_roof_building_factories__flat = (
  _roofprint: number[],
  features: GeoJSON.Feature,
  heightMeters: number,
  projection: TileProjection,
): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();

  const rings = helpers.getFeatureRoofRings(features, heightMeters, projection);
  if (rings.length === 0) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([], 2));
    return geometry;
  }

  const contour2d = rings[0].map(([x, _y, z]) => new THREE.Vector2(x, z));
  const holes2d = rings
    .slice(1)
    .map((ring) => ring.map(([x, _y, z]) => new THREE.Vector2(x, z)));
  const triangles = THREE.ShapeUtils.triangulateShape(contour2d, holes2d);

  const flatPoints = rings[0].concat(...rings.slice(1));
  const positions: number[] = [];
  const uvs: number[] = [];

  for (const [a, b, c] of triangles) {
    const p0 = flatPoints[a];
    const p1 = flatPoints[b];
    const p2 = flatPoints[c];

    positions.push(p0[0], p0[1], p0[2]);
    positions.push(p1[0], p1[1], p1[2]);
    positions.push(p2[0], p2[1], p2[2]);

    uvs.push(
      p0[0] / projection.widthMeters + 0.5,
      p0[2] / projection.heightMeters + 0.5,
    );
    uvs.push(
      p1[0] / projection.widthMeters + 0.5,
      p1[2] / projection.heightMeters + 0.5,
    );
    uvs.push(
      p2[0] / projection.widthMeters + 0.5,
      p2[2] / projection.heightMeters + 0.5,
    );
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  return geometry;
};

export default building_roof_building_factories__flat;
