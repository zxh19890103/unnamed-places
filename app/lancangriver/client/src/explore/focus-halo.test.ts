import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("./materials/TileBasicMaterial.class", () => {
  class MockTileBasicMaterial extends THREE.MeshBasicMaterial {}
  return { TileBasicMaterial: MockTileBasicMaterial };
});

import { SphereTile } from "./SphereTile.class";
import { TileEmptyMaterial } from "./materials/TileEmptyMaterial.class";

describe("SphereTile empty material", () => {
  it("switches to dedicated empty material", () => {
    const tile = new SphereTile(
      {} as any,
      {} as any,
      { z: 11, x: 1, y: 1 },
      {},
    );

    tile.setEmptyMaterial();

    expect(tile.material).toBeInstanceOf(TileEmptyMaterial);
    expect(tile.isEmptyMaterial()).toBe(true);
  });
});
