import { describe, expect, it } from "vitest";
import { latlngToSphere, sphereToLatlng } from "./sphere";

describe("sphere helpers", () => {
  it("maps equator and prime meridian to +X", () => {
    const point = latlngToSphere(0, 0);
    expect(point.x).toBeCloseTo(1, 12);
    expect(point.y).toBeCloseTo(0, 12);
    expect(point.z).toBeCloseTo(0, 12);
  });

  it("maps equator and 90E to +Z", () => {
    const point = latlngToSphere(0, 90);
    expect(point.x).toBeCloseTo(0, 12);
    expect(point.y).toBeCloseTo(0, 12);
    expect(point.z).toBeCloseTo(1, 12);
  });

  it("maps north pole to +Y", () => {
    const point = latlngToSphere(90, 0);
    expect(point.x).toBeCloseTo(0, 12);
    expect(point.y).toBeCloseTo(1, 12);
    expect(point.z).toBeCloseTo(0, 12);
  });

  it("supports radius scaling", () => {
    const point = latlngToSphere(0, -90, 10);
    expect(point.x).toBeCloseTo(0, 10);
    expect(point.y).toBeCloseTo(0, 10);
    expect(point.z).toBeCloseTo(-10, 10);
  });

  it("round-trips lat/lng for non-polar coordinates", () => {
    const point = latlngToSphere(31.13551645138972, 97.17658060985056, 6371);
    const ll = sphereToLatlng(point.x, point.y, point.z);

    expect(ll.lat).toBeCloseTo(31.13551645138972, 10);
    expect(ll.lng).toBeCloseTo(97.17658060985056, 10);
  });

  it("returns normalized longitude in [-180, 180)", () => {
    const p = latlngToSphere(0, 200);
    const ll = sphereToLatlng(p.x, p.y, p.z);

    expect(ll.lng).toBeCloseTo(-160, 10);
  });

  it("throws for zero-length vectors", () => {
    expect(() => sphereToLatlng(0, 0, 0)).toThrow(
      "sphereToLatlng requires a non-zero vector",
    );
  });
});
