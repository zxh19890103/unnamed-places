import * as THREE from "three";
import { LatLng } from "../../calc/types";
import { latlngToSphere } from "../../calc/sphere";

type Parameters = {
  southwest: LatLng;
  northeast: LatLng;
  latSegments?: number;
  lngSegments?: number;
  radius?: number;
  skirtDepth?: number;
};

function validateSegments(name: string, value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer >= 1`);
  }

  return value;
}

export class TileGeometry extends THREE.BufferGeometry {
  constructor(parameters: Parameters) {
    super();

    const { southwest, northeast, radius = 1 } = parameters;
    const skirtDepth = Math.max(0, parameters.skirtDepth ?? 0);

    const latSegments = validateSegments(
      "latSegments",
      parameters.latSegments ?? 32,
    );

    const lngSegments = validateSegments(
      "lngSegments",
      parameters.lngSegments ?? 32,
    );

    const latDelta = northeast.lat - southwest.lat;
    const westLng = southwest.lng;
    const eastLng =
      northeast.lng < westLng ? northeast.lng + 360 : northeast.lng;
    const lngDelta = eastLng - westLng;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const addVertex = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      u: number,
      v: number,
    ): number => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
      return positions.length / 3 - 1;
    };

    for (let latIndex = 0; latIndex <= latSegments; latIndex += 1) {
      const latT = latIndex / latSegments;
      const lat = southwest.lat + latDelta * latT;

      for (let lngIndex = 0; lngIndex <= lngSegments; lngIndex += 1) {
        const lngT = lngIndex / lngSegments;
        const lng = westLng + lngDelta * lngT;
        const { x, y, z } = latlngToSphere(lat, lng, radius);

        const invLength = 1 / Math.hypot(x, y, z);
        addVertex(
          x,
          y,
          z,
          x * invLength,
          y * invLength,
          z * invLength,
          lngT,
          latT,
        );
      }
    }

    const indices: number[] = [];
    const verticesPerRow = lngSegments + 1;

    for (let latIndex = 0; latIndex < latSegments; latIndex += 1) {
      const rowStart = latIndex * verticesPerRow;
      const nextRowStart = (latIndex + 1) * verticesPerRow;

      for (let lngIndex = 0; lngIndex < lngSegments; lngIndex += 1) {
        const a = rowStart + lngIndex;
        const b = a + 1;
        const c = nextRowStart + lngIndex;
        const d = c + 1;

        indices.push(a, c, b, b, c, d);
      }
    }

    if (skirtDepth > 0) {
      const southEdge: number[] = [];
      const northEdge: number[] = [];
      const westEdge: number[] = [];
      const eastEdge: number[] = [];

      for (let lngIndex = 0; lngIndex <= lngSegments; lngIndex += 1) {
        southEdge.push(lngIndex);
        northEdge.push(latSegments * verticesPerRow + lngIndex);
      }

      for (let latIndex = 0; latIndex <= latSegments; latIndex += 1) {
        westEdge.push(latIndex * verticesPerRow);
        eastEdge.push(latIndex * verticesPerRow + lngSegments);
      }

      const addSkirtStrip = (edge: number[]) => {
        if (edge.length < 2) {
          return;
        }

        const skirtEdge: number[] = [];

        for (const topVertex of edge) {
          const p = topVertex * 3;
          const u = topVertex * 2;
          const px = positions[p];
          const py = positions[p + 1];
          const pz = positions[p + 2];
          const nx = normals[p];
          const ny = normals[p + 1];
          const nz = normals[p + 2];

          skirtEdge.push(
            addVertex(
              px - nx * skirtDepth,
              py - ny * skirtDepth,
              pz - nz * skirtDepth,
              nx,
              ny,
              nz,
              uvs[u],
              uvs[u + 1],
            ),
          );
        }

        for (let i = 0; i < edge.length - 1; i += 1) {
          const t0 = edge[i];
          const t1 = edge[i + 1];
          const b0 = skirtEdge[i];
          const b1 = skirtEdge[i + 1];

          indices.push(t0, t1, b0, t1, b1, b0);
          indices.push(b0, t1, t0, b0, b1, t1);
        }
      };

      addSkirtStrip(southEdge);
      addSkirtStrip(northEdge);
      addSkirtStrip(westEdge);
      addSkirtStrip(eastEdge);
    }

    const vertexCount = positions.length / 3;
    const indexArrayType = vertexCount > 65_535 ? Uint32Array : Uint16Array;

    this.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    this.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array(normals), 3),
    );
    this.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(uvs), 2),
    );
    this.setIndex(new THREE.BufferAttribute(new indexArrayType(indices), 1));
    this.computeBoundingSphere();
  }
}
