import * as THREE from "three";

type Parameters = {
  size?: number;
  thickness?: number;
};

export class DuckGeometry extends THREE.BufferGeometry {
  static __storybook(): Parameters {
    return {
      size: 1.25,
      thickness: 0.28,
    };
  }

  constructor(params: Parameters = {}) {
    super();

    const size = params.size ?? 1;
    const thickness = params.thickness ?? 0.2;
    const halfThickness = thickness / 2;

    const profile = [
      [-1.32, -0.04],
      [-1.15, -0.28],
      [-0.8, -0.42],
      [-0.36, -0.48],
      [0.16, -0.46],
      [0.58, -0.34],
      [0.94, -0.18],
      [1.18, 0.02],
      [1.22, 0.18],
      [1.08, 0.34],
      [0.78, 0.52],
      [0.42, 0.62],
      [0.1, 0.66],
      [-0.2, 0.6],
      [-0.54, 0.48],
      [-0.82, 0.32],
      [-1.02, 0.14],
      [-1.18, 0.0],
      [-1.28, -0.02],
    ];

    const positions: number[] = [];
    const indices: number[] = [];
    const addVertex = (x: number, y: number, z: number) => {
      positions.push(x * size, y * size, z);
    };

    const topCenter = { x: 0, y: 0, z: halfThickness };
    const bottomCenter = { x: 0, y: 0, z: -halfThickness };

    addVertex(topCenter.x, topCenter.y, topCenter.z);
    addVertex(bottomCenter.x, bottomCenter.y, bottomCenter.z);

    const topVertices: Array<{ x: number; y: number; z: number }> = [];
    const bottomVertices: Array<{ x: number; y: number; z: number }> = [];

    profile.forEach(([x, y]) => {
      topVertices.push({ x: x * size, y: y * size, z: halfThickness });
      bottomVertices.push({ x: x * size, y: y * size, z: -halfThickness });
    });

    topVertices.forEach((vertex, index) => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });

    bottomVertices.forEach((vertex, index) => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });

    const baseIndex = 2;
    const topOffset = 2 + profile.length;

    for (let i = 0; i < profile.length; i += 1) {
      const next = (i + 1) % profile.length;
      const topA = baseIndex + i;
      const topB = baseIndex + next;
      const bottomA = topOffset + i;
      const bottomB = topOffset + next;

      indices.push(0, topA, topB);
      indices.push(1, bottomB, bottomA);
      indices.push(topA, bottomA, bottomB);
      indices.push(topA, bottomB, topB);
    }

    this.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.setIndex(indices);
    this.computeVertexNormals();
  }
}
