import { describe, expect, it } from "vitest";
import { tileImageUrl } from "../src/data/api";

describe("tileImageUrl", () => {
  it("builds image urls for satellite and dem tiles", () => {
    const satelliteUrl = tileImageUrl("http://localhost:4050", "satellite", {
      z: 11,
      x: 1234,
      y: 678,
    });
    const demUrl = tileImageUrl("http://localhost:4050", "dem", {
      z: 11,
      x: 1234,
      y: 678,
    });

    expect(satelliteUrl).toBe(
      "http://localhost:4050/raster/satellite/11/1234/678.jpeg",
    );
    expect(demUrl).toBe("http://localhost:4050/raster/dem/11/1234/678.png");
  });
});
