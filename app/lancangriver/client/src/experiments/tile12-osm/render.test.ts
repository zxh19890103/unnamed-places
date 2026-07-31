import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { buildTileVectorGroup } from "./render";

const tile = { z: 12, x: 1024, y: 1024 };

function feature(
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties = {},
): GeoJSON.Feature {
  return { type: "Feature", geometry, properties };
}

describe("buildTileVectorGroup", () => {
  it("renders polygons, lines, points, and the tile outline", () => {
    const result = buildTileVectorGroup(
      [
        feature(
          {
            type: "Polygon",
            coordinates: [
              [
                [-90, 66.4],
                [-89.99, 66.4],
                [-89.99, 66.41],
                [-90, 66.41],
                [-90, 66.4],
              ],
            ],
          },
          { building: "yes", height: 20 },
        ),
        feature(
          {
            type: "Polygon",
            coordinates: [
              [
                [-90, 66.4],
                [-89.99, 66.4],
                [-89.99, 66.41],
                [-90, 66.4],
              ],
            ],
          },
          { natural: "water" },
        ),
        feature({
          type: "LineString",
          coordinates: [
            [-90, 66.4],
            [-89.99, 66.41],
          ],
        }),
        feature({ type: "Point", coordinates: [-90, 66.4] }),
      ],
      tile,
    );

    const meshes = result.group.children.filter(
      (object): object is THREE.Mesh => object instanceof THREE.Mesh,
    );

    expect(result.objectCount).toBe(4);
    expect(
      meshes.some((mesh) => mesh.geometry.type === "ExtrudeGeometry"),
    ).toBe(true);
    expect(meshes.some((mesh) => mesh.geometry.type === "ShapeGeometry")).toBe(
      true,
    );
    expect(
      result.group.children.some((object) => object instanceof THREE.Line),
    ).toBe(true);
    expect(
      result.group.children.some((object) => object instanceof THREE.LineLoop),
    ).toBe(true);
  });

  it("disposes geometries and materials", () => {
    const result = buildTileVectorGroup(
      [feature({ type: "Point", coordinates: [-90, 66.4] })],
      tile,
    );
    const geometrySpies: ReturnType<typeof vi.spyOn>[] = [];
    const materialSpies: ReturnType<typeof vi.spyOn>[] = [];

    result.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometrySpies.push(vi.spyOn(object.geometry, "dispose"));
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          materialSpies.push(vi.spyOn(material, "dispose"));
        }
      }
    });

    result.dispose();

    expect(geometrySpies.every((spy) => spy.mock.calls.length > 0)).toBe(true);
    expect(materialSpies.every((spy) => spy.mock.calls.length > 0)).toBe(true);
  });
});
