import { describe, expect, it } from "vitest";

import { TileDebugMaterial } from "./TileDebugMaterial.class";

describe("TileDebugMaterial", () => {
  it("uses a stable color for the same tile key", () => {
    const a = new TileDebugMaterial({ tileKey: { z: 7, x: 12, y: 33 } });
    const b = new TileDebugMaterial({ tileKey: { z: 7, x: 12, y: 33 } });

    expect(a.color.getHex()).toBe(b.color.getHex());
  });

  it("varies color between different tile keys", () => {
    const a = new TileDebugMaterial({ tileKey: { z: 7, x: 12, y: 33 } });
    const b = new TileDebugMaterial({ tileKey: { z: 7, x: 13, y: 33 } });

    expect(a.color.getHex()).not.toBe(b.color.getHex());
  });

  it("does not use any texture map", () => {
    const material = new TileDebugMaterial({ tileKey: { z: 1, x: 0, y: 0 } });
    expect(material.map).toBeNull();
  });
});
