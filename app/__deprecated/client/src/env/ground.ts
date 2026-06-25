import * as THREE from "three";

export function buildGroundGeometry(
  width: number,
  height: number,
  widthSegments: number,
  heightSegments: number,
) {
  const geometry = new THREE.BufferGeometry();

  const vertex: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const triangles: number[] = [];

  const offsetX = 0;
  const offsetY = 0;

  const dx = width / widthSegments;
  const dy = height / heightSegments;

  let x = 0;
  let y = 0;
  let u = 0;
  let v = 0;

  const Index = (i: number, j: number) => {
    return i * (heightSegments + 1) + j;
  };

  for (let i = 0; i <= widthSegments; i++) {
    for (let j = 0; j <= heightSegments; j++) {
      x = -offsetX + i * dx;
      y = -offsetY + j * dy;

      vertex.push(x, y, 0);
      normal.push(0, 0, 1);

      u = x / width;
      v = y / height;
      uv.push(u, v);
    }
  }

  for (let i = 0; i < widthSegments; i++) {
    for (let j = 0; j < heightSegments; j++) {
      triangles.push(
        Index(i, j),
        Index(i + 1, j),
        Index(i + 1, j + 1),
        Index(i + 1, j + 1),
        Index(i, j + 1),
        Index(i, j)
      );
    }
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertex, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(triangles);

  return geometry;
}
