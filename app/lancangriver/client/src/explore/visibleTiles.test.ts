import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { latlngToTilekey } from "../calc/mercator";
import { EARTH_RADIUS, latlngToSphere } from "../calc/sphere";
import { getVisibleTiles } from "./visibleTiles";

function createCamera(
  lat: number,
  lng: number,
  distanceFromCenter: number = EARTH_RADIUS * 1.5,
): THREE.PerspectiveCamera {
  const position = latlngToSphere(lat, lng, distanceFromCenter);
  const camera = new THREE.PerspectiveCamera(
    75,
    16 / 9,
    1000,
    EARTH_RADIUS * 2,
  );

  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  return camera;
}

describe("getVisibleTiles", () => {
  it("returns visible tiles in front of the camera", () => {
    const zoom = 4;
    const tileCount = 2 ** zoom;
    const camera = createCamera(0, 0);

    const result = getVisibleTiles(camera, zoom, EARTH_RADIUS);

    expect(result.length).toBeGreaterThan(0);
    for (const key of result) {
      expect(key.z).toBe(zoom);
      expect(key.x).toBeGreaterThanOrEqual(0);
      expect(key.x).toBeLessThan(tileCount);
      expect(key.y).toBeGreaterThanOrEqual(0);
      expect(key.y).toBeLessThan(tileCount);
    }
  });

  it("does not include a known backside tile", () => {
    const zoom = 5;
    const camera = createCamera(0, 0);
    const opposite = latlngToTilekey(180, 0, zoom);

    const result = getVisibleTiles(camera, zoom, EARTH_RADIUS);
    const hasOpposite = result.some(
      (key) => key.x === opposite.x && key.y === opposite.y,
    );

    expect(hasOpposite).toBe(false);
  });

  it("can include tiles on both sides of the x seam near dateline views", () => {
    const zoom = 3;
    const tileCount = 2 ** zoom;
    const camera = createCamera(0, 179.5);

    const result = getVisibleTiles(camera, zoom, EARTH_RADIUS);

    expect(result.length).toBeGreaterThan(0);
    const hasLowX = result.some((key) => key.x <= 1);
    const hasHighX = result.some((key) => key.x >= tileCount - 2);
    expect(hasLowX && hasHighX).toBe(true);
  });
});
