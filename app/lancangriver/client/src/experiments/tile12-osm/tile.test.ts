import { describe, expect, it } from "vitest";

import {
  classifyPolygonFeature,
  createTileProjection,
  parseTile12Key,
} from "./tile";

describe("parseTile12Key", () => {
  it("parses a canonical zoom-12 key", () => {
    expect(parseTile12Key("12/1024/1024")).toEqual({
      z: 12,
      x: 1024,
      y: 1024,
    });
  });

  it.each([
    "11/1024/1024",
    "12/4096/0",
    "12/0/4096",
    "12/-1/0",
    "12/1.5/2",
    "12/1/2/3",
  ])("rejects invalid key %s", (key) => {
    expect(parseTile12Key(key)).toBeNull();
  });
});

describe("tile projection", () => {
  it("projects the tile center to the local origin", () => {
    const projection = createTileProjection({ z: 12, x: 1024, y: 1024 });
    const projected = projection.project([
      projection.center.lng,
      projection.center.lat,
    ]);

    expect(projected.x).toBeCloseTo(0, 6);
    expect(projected.z).toBeCloseTo(0, 6);
    expect(projection.widthMeters).toBeGreaterThan(0);
    expect(projection.heightMeters).toBeGreaterThan(0);
  });
});

describe("classifyPolygonFeature", () => {
  it("recognizes buildings and water from MVT properties", () => {
    expect(
      classifyPolygonFeature({
        type: "Feature",
        properties: { building: "yes" },
        geometry: null,
      }),
    ).toBe("building");
    expect(
      classifyPolygonFeature({
        type: "Feature",
        properties: { tags: { natural: "water" } },
        geometry: null,
      }),
    ).toBe("water");
  });

  it("classifies other polygons as neutral", () => {
    expect(
      classifyPolygonFeature({
        type: "Feature",
        properties: { landuse: "grass" },
        geometry: null,
      }),
    ).toBe("other");
  });
});
