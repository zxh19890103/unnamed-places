import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("./materials/TileBasicMaterial.class", () => {
  class MockTileBasicMaterial extends THREE.MeshBasicMaterial {}
  return { TileBasicMaterial: MockTileBasicMaterial };
});

import { SphereTile } from "./SphereTile.class";
import { TileEmptyMaterial } from "./materials/TileEmptyMaterial.class";
import { TileMaterialMode } from "./SphereTile.class";

describe("SphereTile empty material", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it("restores non-empty basic material after empty then basic mode", () => {
    const tile = new SphereTile(
      {} as any,
      {} as any,
      { z: 11, x: 1, y: 1 },
      {},
    );

    tile.setEmptyMaterial();
    tile.setMaterialMode(TileMaterialMode.Basic);

    expect(tile.isEmptyMaterial()).toBe(false);
    expect(tile.material).not.toBeInstanceOf(TileEmptyMaterial);
    expect(tile.getMaterialMode()).toBe(TileMaterialMode.Basic);
  });

  it("disposes previous material exactly once when swapping to empty", () => {
    const tile = new SphereTile(
      {} as any,
      {} as any,
      { z: 11, x: 1, y: 1 },
      {},
    );

    const disposeSpy = vi.spyOn(tile.material, "dispose");

    tile.setEmptyMaterial();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(tile.material).toBeInstanceOf(TileEmptyMaterial);
  });

  it("is idempotent when setEmptyMaterial is called repeatedly", () => {
    const tile = new SphereTile(
      {} as any,
      {} as any,
      { z: 11, x: 1, y: 1 },
      {},
    );

    const firstMaterial = tile.material;
    const disposeSpy = vi.spyOn(firstMaterial, "dispose");

    tile.setEmptyMaterial();
    const emptyAfterFirstCall = tile.material;
    tile.setEmptyMaterial();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(tile.material).toBe(emptyAfterFirstCall);
    expect(tile.material).toBeInstanceOf(TileEmptyMaterial);
  });
});
