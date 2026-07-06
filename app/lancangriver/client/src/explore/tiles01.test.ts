import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { latlngToSphere } from "../calc/sphere";
import { tile01 } from "./tiles01";

function createCamera(distanceFromOrigin: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    75,
    16 / 9,
    0.1,
    distanceFromOrigin * 2,
  );
  const position = latlngToSphere(0, 0, distanceFromOrigin);

  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  return camera;
}

describe("tile01", () => {
  it("refines a coarse tile when the camera is close", () => {
    const camera = createCamera(10_000_000);

    const tiles = tile01({ z: 0, x: 0, y: 0 }, camera);

    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.every((tile) => tile.leaf)).toBe(true);
    expect(tiles.every((tile) => tile.z > 0)).toBe(true);
  });

  it("keeps the root tile when the camera is far away", () => {
    const camera = createCamera(100_000_000);

    const tiles = tile01({ z: 0, x: 0, y: 0 }, camera);

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ z: 0, x: 0, y: 0, leaf: true });
  });
});
