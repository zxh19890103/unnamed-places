import { describe, expect, it } from "vitest";
import { latlngToSphere } from "../../calc/sphere";
import { TileGeometry } from "./TileGeometry.class";

describe("TileGeometry", () => {
  it("builds indexed position/normal/uv attributes", () => {
    const geometry = new TileGeometry({
      southwest: { lat: 10, lng: 20 },
      northeast: { lat: 12, lng: 22 },
    });

    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex();

    expect(position).toBeTruthy();
    expect(normal).toBeTruthy();
    expect(uv).toBeTruthy();
    expect(index).toBeTruthy();

    expect(position.count).toBe((16 + 1) * (16 + 1));
    expect(normal.count).toBe(position.count);
    expect(uv.count).toBe(position.count);
    expect(index?.count).toBe(16 * 16 * 6);
  });

  it("maps southwest and northeast corners to sphere coordinates", () => {
    const southwest = { lat: 31, lng: 97 };
    const northeast = { lat: 32, lng: 98 };

    const geometry = new TileGeometry({
      southwest,
      northeast,
      latSegments: 2,
      lngSegments: 2,
    });

    const position = geometry.getAttribute("position");
    const southwestVertex = 0;
    const northeastVertex = 2 * (2 + 1) + 2;

    const sw = latlngToSphere(southwest.lat, southwest.lng);
    const ne = latlngToSphere(northeast.lat, northeast.lng);

    const swDelta = Math.hypot(
      position.getX(southwestVertex) - sw.x,
      position.getY(southwestVertex) - sw.y,
      position.getZ(southwestVertex) - sw.z,
    );
    const neDelta = Math.hypot(
      position.getX(northeastVertex) - ne.x,
      position.getY(northeastVertex) - ne.y,
      position.getZ(northeastVertex) - ne.z,
    );

    expect(swDelta).toBeLessThan(1);
    expect(neDelta).toBeLessThan(1);
  });

  it("unwraps antimeridian-longitude tiles", () => {
    const geometry = new TileGeometry({
      southwest: { lat: 0, lng: 170 },
      northeast: { lat: 10, lng: -170 },
      latSegments: 1,
      lngSegments: 1,
    });

    const position = geometry.getAttribute("position");
    const northeastVertex = 1 * (1 + 1) + 1;
    const expected = latlngToSphere(10, -170);

    const delta = Math.hypot(
      position.getX(northeastVertex) - expected.x,
      position.getY(northeastVertex) - expected.y,
      position.getZ(northeastVertex) - expected.z,
    );

    expect(delta).toBeLessThan(1);
  });
});
