import { describe, expect, it } from "vitest";
import {
  createManifestTileSet,
  isTileInManifest,
  toTileId,
} from "../src/view/manifest-tiles";

describe("manifest tile filtering", () => {
  it("builds deterministic tile ids", () => {
    expect(toTileId({ z: 11, x: 1584, y: 852 })).toBe("11/1584/852");
  });

  it("checks tile membership against manifest", () => {
    const manifest = createManifestTileSet([
      { z: 11, x: 1584, y: 852 },
      { z: 11, x: 1584, y: 853 },
    ]);

    expect(isTileInManifest({ z: 11, x: 1584, y: 852 }, manifest)).toBe(true);
    expect(isTileInManifest({ z: 11, x: 1590, y: 900 }, manifest)).toBe(false);
  });
});
