import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CloudGeometry } from "./CloudGeometry.class";
import { getLocalBasisAtPoint, latlngToSphere } from "../../calc/sphere";

describe("CloudGeometry", () => {
  it("creates a position attribute with one vertex per cloud", () => {
    const cloudCount = 128;
    const geometry = new CloudGeometry({
      latlng: { lat: 31.23, lng: 121.47 },
      radius: 1000,
      count: cloudCount,
      maxAltitudeDeg: 15,
      bandWidth: 500,
    });

    const position = geometry.getAttribute("position");
    const spriteIndex = geometry.getAttribute("spriteIndex");

    expect(position).toBeInstanceOf(THREE.BufferAttribute);
    expect(spriteIndex).toBeInstanceOf(THREE.BufferAttribute);
    expect(position.itemSize).toBe(3);
    expect(spriteIndex.itemSize).toBe(1);
    expect(position.count).toBe(cloudCount);
    expect(spriteIndex.count).toBe(cloudCount);

    for (let i = 0; i < spriteIndex.count; i += 1) {
      const value = spriteIndex.getX(i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(16);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("keeps vertices inside radius band and altitude FOV", () => {
    const radius = 2000;
    const bandWidth = 300;
    const maxAltitudeDeg = 10;
    const latlng = { lat: 24, lng: 102 };
    const geometry = new CloudGeometry({
      latlng,
      radius,
      count: 400,
      maxAltitudeDeg,
      bandWidth,
    });

    const person = latlngToSphere(latlng.lat, latlng.lng, 1);
    const { up } = getLocalBasisAtPoint(
      new THREE.Vector3(person.x, person.y, person.z),
    );
    const maxAngleRad = THREE.MathUtils.degToRad(maxAltitudeDeg);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = new THREE.Vector3();

    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i);

      const length = p.length();
      expect(length).toBeGreaterThanOrEqual(radius);
      expect(length).toBeLessThanOrEqual(radius + bandWidth);

      const dir = p.clone().normalize();
      const altitude = Math.asin(THREE.MathUtils.clamp(dir.dot(up), -1, 1));
      expect(altitude).toBeGreaterThanOrEqual(-1e-8);
      expect(altitude).toBeLessThanOrEqual(maxAngleRad + 1e-8);
    }
  });
});
