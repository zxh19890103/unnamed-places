import * as THREE from "three";
import { TileProjection } from "../../tile";
import * as helpers from "../_helpers";

const building_roof_building_factories__fence = (
  _roofprint: number[],
  features: GeoJSON.Feature,
  heightMeters: number,
  projection: TileProjection,
): THREE.BufferGeometry => {
  const appendPenthouse = createRandomRoofPenthouseAppender(
    features,
    heightMeters,
    projection,
  );

  const geometry = new THREE.BufferGeometry();

  const rings = helpers.getFeatureRoofRings(features, heightMeters, projection);

  if (rings.length === 0) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([], 2));
    return geometry;
  }

  const fenceHeightMeters = 4;
  const barrierThicknessMeters = 1;

  const contour2d = rings[0].map(([x, _y, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour2d, []);

  const flatPoints = rings[0];
  const baseY = heightMeters;
  const topY = heightMeters + fenceHeightMeters;
  const inwardSign = helpers.signedArea2D(contour2d) >= 0 ? 1 : -1;
  const wallInnerOffset = new THREE.Vector2();
  const wallOuterOffset = new THREE.Vector2();
  const positions: number[] = [];
  const uvs: number[] = [];

  // Ground fill.
  for (const [a, b, c] of triangles) {
    const p0 = flatPoints[a];
    const p1 = flatPoints[b];
    const p2 = flatPoints[c];

    positions.push(p0[0], baseY, p0[2]);
    positions.push(p1[0], baseY, p1[2]);
    positions.push(p2[0], baseY, p2[2]);

    uvs.push(0, 0, 0, 0, 0, 0);
  }

  // Per-edge wall slabs built from the contour ring, not from the triangulation.
  for (let index = 0; index < contour2d.length; index += 1) {
    const next = (index + 1) % contour2d.length;
    const p0 = flatPoints[index];
    const p1 = flatPoints[next];

    if (
      !helpers.lineNormals2D(
        contour2d[index],
        contour2d[next],
        wallOuterOffset,
        wallInnerOffset,
      )
    ) {
      continue;
    }

    const inwardX = wallInnerOffset.x * inwardSign * barrierThicknessMeters;
    const inwardZ = wallInnerOffset.y * inwardSign * barrierThicknessMeters;

    const outerBottom0: [number, number, number] = [p0[0], baseY, p0[2]];
    const outerBottom1: [number, number, number] = [p1[0], baseY, p1[2]];
    const outerTop0: [number, number, number] = [p0[0], topY, p0[2]];
    const outerTop1: [number, number, number] = [p1[0], topY, p1[2]];

    const innerBottom0: [number, number, number] = [
      p0[0] + inwardX,
      baseY,
      p0[2] + inwardZ,
    ];
    const innerBottom1: [number, number, number] = [
      p1[0] + inwardX,
      baseY,
      p1[2] + inwardZ,
    ];
    const innerTop0: [number, number, number] = [
      p0[0] + inwardX,
      topY,
      p0[2] + inwardZ,
    ];
    const innerTop1: [number, number, number] = [
      p1[0] + inwardX,
      topY,
      p1[2] + inwardZ,
    ];

    helpers.pushQuad(
      positions,
      uvs,
      outerBottom0,
      outerBottom1,
      outerTop0,
      outerTop1,
    );
    helpers.pushQuad(
      positions,
      uvs,
      innerBottom1,
      innerBottom0,
      innerTop1,
      innerTop0,
    );
    helpers.pushQuad(
      positions,
      uvs,
      outerTop0,
      outerTop1,
      innerTop0,
      innerTop1,
    );
    helpers.pushQuad(
      positions,
      uvs,
      outerBottom0,
      innerBottom0,
      outerTop0,
      innerTop0,
    );
    helpers.pushQuad(
      positions,
      uvs,
      innerBottom1,
      outerBottom1,
      innerTop1,
      outerTop1,
    );
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  const centroid = new THREE.Vector3(...helpers.calculateCentroid(rings[0]));
  appendPenthouse(geometry, centroid, 11, 12, 16, 30);

  return geometry;
};

const createRandomRoofPenthouseAppender = (
  _features: GeoJSON.Feature,
  _heightMeters: number,
  _projection: TileProjection,
) => {
  return (
    geometry: THREE.BufferGeometry,
    placement: THREE.Vector3,
    heightMeters: number,
    widthMeters: number,
    depthMeters: number,
    angleDeg: number,
  ) => {
    const halfWidth = widthMeters / 2;
    const halfDepth = depthMeters / 2;
    const angleRad = THREE.MathUtils.degToRad(angleDeg);
    const yRotation = new THREE.Matrix4().makeRotationY(angleRad);

    const localVertices = [
      new THREE.Vector3(-halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, halfDepth),
      new THREE.Vector3(-halfWidth, 0, halfDepth),
      new THREE.Vector3(-halfWidth, heightMeters, -halfDepth),
      new THREE.Vector3(halfWidth, heightMeters, -halfDepth),
      new THREE.Vector3(halfWidth, heightMeters, halfDepth),
      new THREE.Vector3(-halfWidth, heightMeters, halfDepth),
    ].map((vertex) => vertex.applyMatrix4(yRotation).add(placement));

    const existingPosition = geometry.getAttribute("position");
    const existingUv = geometry.getAttribute("uv");
    const positions = existingPosition
      ? Array.from(existingPosition.array as ArrayLike<number>)
      : [];
    const uvs = existingUv
      ? Array.from(existingUv.array as ArrayLike<number>)
      : [];

    const pushTriangle = (
      a: THREE.Vector3,
      b: THREE.Vector3,
      c: THREE.Vector3,
    ) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      uvs.push(0, 0, 0, 0, 0, 0);
    };

    const [v0, v1, v2, v3, v4, v5, v6, v7] = localVertices;

    // bottom face
    pushTriangle(v0, v1, v2);
    pushTriangle(v0, v2, v3);

    // top face
    pushTriangle(v4, v7, v6);
    pushTriangle(v4, v6, v5);

    // front face (-z)
    pushTriangle(v0, v4, v5);
    pushTriangle(v0, v5, v1);

    // back face (+z)
    pushTriangle(v3, v2, v6);
    pushTriangle(v3, v6, v7);

    // left face (-x)
    pushTriangle(v0, v3, v7);
    pushTriangle(v0, v7, v4);

    // right face (+x)
    pushTriangle(v1, v5, v6);
    pushTriangle(v1, v6, v2);

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  };
};

export default building_roof_building_factories__fence;
