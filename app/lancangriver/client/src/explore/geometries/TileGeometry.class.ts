import * as THREE from "three";
import { LatLng } from "../../calc/types";
import { latlngToSphere } from "../../calc/sphere";

type Parameters = {
  southwest: LatLng;
  northeast: LatLng;
  latSegments?: number;
  lngSegments?: number;
  radius?: number;
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

    const latSegments = validateSegments(
      "latSegments",
      parameters.latSegments ?? 16,
    );

    const lngSegments = validateSegments(
      "lngSegments",
      parameters.lngSegments ?? 16,
    );

    const latDelta = northeast.lat - southwest.lat;
    const westLng = southwest.lng;
    const eastLng =
      northeast.lng < westLng ? northeast.lng + 360 : northeast.lng;
    const lngDelta = eastLng - westLng;

    const vertexCount = (latSegments + 1) * (lngSegments + 1);

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    let vertexOffset = 0;
    let uvOffset = 0;

    for (let latIndex = 0; latIndex <= latSegments; latIndex += 1) {
      const latT = latIndex / latSegments;
      const lat = southwest.lat + latDelta * latT;

      for (let lngIndex = 0; lngIndex <= lngSegments; lngIndex += 1) {
        const lngT = lngIndex / lngSegments;
        const lng = westLng + lngDelta * lngT;
        const { x, y, z } = latlngToSphere(lat, lng, radius);

        positions[vertexOffset] = x;
        positions[vertexOffset + 1] = y;
        positions[vertexOffset + 2] = z;

        const invLength = 1 / Math.hypot(x, y, z);
        normals[vertexOffset] = x * invLength;
        normals[vertexOffset + 1] = y * invLength;
        normals[vertexOffset + 2] = z * invLength;

        uvs[uvOffset] = lngT;
        uvs[uvOffset + 1] = latT;

        vertexOffset += 3;
        uvOffset += 2;
      }
    }

    const indexCount = latSegments * lngSegments * 6;
    const indexArrayType = vertexCount > 65_535 ? Uint32Array : Uint16Array;
    const indices = new indexArrayType(indexCount);

    let indexOffset = 0;
    const verticesPerRow = lngSegments + 1;

    for (let latIndex = 0; latIndex < latSegments; latIndex += 1) {
      const rowStart = latIndex * verticesPerRow;
      const nextRowStart = (latIndex + 1) * verticesPerRow;

      for (let lngIndex = 0; lngIndex < lngSegments; lngIndex += 1) {
        const a = rowStart + lngIndex;
        const b = a + 1;
        const c = nextRowStart + lngIndex;
        const d = c + 1;

        indices[indexOffset] = a;
        indices[indexOffset + 1] = c;
        indices[indexOffset + 2] = b;

        indices[indexOffset + 3] = b;
        indices[indexOffset + 4] = c;
        indices[indexOffset + 5] = d;

        indexOffset += 6;
      }
    }

    this.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    this.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.setIndex(new THREE.BufferAttribute(indices, 1));
    this.computeBoundingSphere();
  }
}
