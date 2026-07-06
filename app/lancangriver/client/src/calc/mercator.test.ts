import { describe, expect, it } from "vitest";
import { disatanceToZoom, mergeTileExtents, zoomToDistance } from "./mercator";
import { latlngToTilekey } from "./mercator";

const MIN_ZOOM = 0;
const MAX_ZOOM = 19;
const REFERENCE_DISTANCE_METERS = 100;

function avg(a: number, b: number): number {
  return (a + b) / 2;
}

describe("mercator distance/zoom mapping", () => {
  it("round-trips every zoom representative distance exactly", () => {
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z += 1) {
      const d = zoomToDistance(z, MIN_ZOOM, MAX_ZOOM);
      expect(disatanceToZoom(d, MIN_ZOOM, MAX_ZOOM)).toBe(z);
    }
  });

  it("follows adjacent zoom-level average relation for full z coverage", () => {
    for (let z = MIN_ZOOM; z < MAX_ZOOM; z += 1) {
      const d = REFERENCE_DISTANCE_METERS * 2 ** (MAX_ZOOM - z);
      const d1 = REFERENCE_DISTANCE_METERS * 2 ** (MAX_ZOOM - (z + 1));

      expect(disatanceToZoom(d, MIN_ZOOM, MAX_ZOOM)).toBe(z);
      expect(disatanceToZoom(d1, MIN_ZOOM, MAX_ZOOM)).toBe(z + 1);
      expect(zoomToDistance(z, MIN_ZOOM, MAX_ZOOM)).toBe(avg(d, d1));
    }
  });

  it("covers all distance bands for getZoomLvFromDistance", () => {
    for (let z = MIN_ZOOM; z < MAX_ZOOM; z += 1) {
      const upper = zoomToDistance(z, MIN_ZOOM, MAX_ZOOM);
      const lower = zoomToDistance(z + 1, MIN_ZOOM, MAX_ZOOM);
      const midpoint = avg(upper, lower);

      expect(disatanceToZoom(upper, MIN_ZOOM, MAX_ZOOM)).toBe(z);
      expect(disatanceToZoom(midpoint, MIN_ZOOM, MAX_ZOOM)).toBe(z);
    }

    const dMax = zoomToDistance(MAX_ZOOM, MIN_ZOOM, MAX_ZOOM);
    expect(disatanceToZoom(dMax, MIN_ZOOM, MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(disatanceToZoom(dMax * 0.5, MIN_ZOOM, MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(disatanceToZoom(dMax * 0.01, MIN_ZOOM, MAX_ZOOM)).toBe(MAX_ZOOM);
  });

  it("handles clamping and invalid distance inputs", () => {
    expect(disatanceToZoom(Number.NaN, MIN_ZOOM, MAX_ZOOM)).toBe(MIN_ZOOM);
    expect(disatanceToZoom(Number.POSITIVE_INFINITY, MIN_ZOOM, MAX_ZOOM)).toBe(
      MIN_ZOOM,
    );
    expect(disatanceToZoom(0, MIN_ZOOM, MAX_ZOOM)).toBe(MIN_ZOOM);
    expect(disatanceToZoom(-1, MIN_ZOOM, MAX_ZOOM)).toBe(MIN_ZOOM);

    expect(
      disatanceToZoom(zoomToDistance(MIN_ZOOM) * 10, MIN_ZOOM, MAX_ZOOM),
    ).toBe(MIN_ZOOM);
    expect(
      disatanceToZoom(zoomToDistance(MAX_ZOOM) * 0.0001, MIN_ZOOM, MAX_ZOOM),
    ).toBe(MAX_ZOOM);

    expect(zoomToDistance(MIN_ZOOM - 10, MIN_ZOOM, MAX_ZOOM)).toBe(
      zoomToDistance(MIN_ZOOM, MIN_ZOOM, MAX_ZOOM),
    );
    expect(zoomToDistance(MAX_ZOOM + 10, MIN_ZOOM, MAX_ZOOM)).toBe(
      zoomToDistance(MAX_ZOOM, MIN_ZOOM, MAX_ZOOM),
    );
  });
});

describe("mercator tile key wrapping", () => {
  it("wraps longitudes below -180 into valid tile x", () => {
    const zoom = 5;
    const tileCount = 2 ** zoom;

    const key = latlngToTilekey(-181, 0, zoom);

    expect(key.x).toBeGreaterThanOrEqual(0);
    expect(key.x).toBeLessThan(tileCount);
    expect(key.y).toBeGreaterThanOrEqual(0);
    expect(key.y).toBeLessThan(tileCount);
  });

  it("keeps periodic longitude equivalence", () => {
    const zoom = 7;

    const keyA = latlngToTilekey(-181, 12.5, zoom);
    const keyB = latlngToTilekey(179, 12.5, zoom);

    expect(keyA.x).toBe(keyB.x);
    expect(keyA.y).toBe(keyB.y);
  });
});

describe("mergeTileExtents", () => {
  it("returns the union bounding box for all extents", () => {
    expect(
      mergeTileExtents(
        { west: -10, south: -5, east: 5, north: 10, latSpan: 0, lngSpan: 0 },
        { west: -20, south: -3, east: 8, north: 12, latSpan: 0, lngSpan: 0 },
        { west: -15, south: -8, east: 12, north: 6, latSpan: 0, lngSpan: 0 },
      ),
    ).toEqual({
      west: -20,
      south: -8,
      east: 12,
      north: 12,
    });
  });

  it("throws when called without extents", () => {
    expect(() => mergeTileExtents()).toThrow(
      "mergeTileExtents requires at least one extent",
    );
  });
});
