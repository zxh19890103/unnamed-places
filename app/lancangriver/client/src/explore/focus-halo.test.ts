import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SphereTile, TileMaterialMode } from "./SphereTile.class";
import { TileEmptyMaterial } from "./materials/TileEmptyMaterial.class";
import { buildFocusNeighbors } from "./setup";

vi.mock("./materials/TileBasicMaterial.class", () => {
  class MockTileBasicMaterial extends THREE.MeshBasicMaterial {}
  return { TileBasicMaterial: MockTileBasicMaterial };
});

const toId = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

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

describe("focus halo selection", () => {
  it("returns zero halo tiles for [0,0]", () => {
    const out = buildFocusNeighbors({ lat: 40.7, lng: 14.4 }, [0, 0]);

    expect(out.haloTiles).toHaveLength(0);
    expect(out.focusTilesWithRole.every((tile) => tile.role === "core")).toBe(
      true,
    );
    expect(out.focusTiles).toEqual(out.coreFocusTiles);
  });

  it("creates symmetric halo ring for [1,1]", () => {
    const out = buildFocusNeighbors({ lat: 40.7, lng: 14.4 }, [1, 1]);

    expect(out.coreFocusTiles).toHaveLength(15);
    expect(out.haloTiles).toHaveLength(20);
    expect(out.focusTilesWithRole).toHaveLength(35);

    const coreCount = out.focusTilesWithRole.filter(
      (tile) => tile.role === "core",
    ).length;
    const haloCount = out.focusTilesWithRole.filter(
      (tile) => tile.role === "halo",
    ).length;

    expect(coreCount).toBe(15);
    expect(haloCount).toBe(20);

    const roleSwitchIdx = out.focusTilesWithRole.findIndex(
      (tile) => tile.role === "halo",
    );
    expect(roleSwitchIdx).toBe(15);
    expect(out.focusTilesWithRole.slice(0, roleSwitchIdx)).toSatisfy((tiles) =>
      tiles.every((tile) => tile.role === "core"),
    );
    expect(out.focusTilesWithRole.slice(roleSwitchIdx)).toSatisfy((tiles) =>
      tiles.every((tile) => tile.role === "halo"),
    );
  });

  it("has no duplicate keys", () => {
    const out = buildFocusNeighbors({ lat: 89.999, lng: 179.999 }, [2, 3]);

    const ids = out.focusTilesWithRole.map((tile) =>
      toId(tile.key.z, tile.key.x, tile.key.y),
    );

    expect(new Set(ids).size).toBe(ids.length);

    const expectedOrder = [
      ...out.coreFocusTiles.map((tile) => toId(tile.z, tile.x, tile.y)),
      ...out.haloTiles.map((tile) => toId(tile.z, tile.x, tile.y)),
    ];
    expect(ids).toEqual(expectedOrder);
  });
});
