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
    const lineSegments = result.group.children.filter(
      (object): object is THREE.LineSegments =>
        object instanceof THREE.LineSegments,
    );

    expect(result.objectCount).toBe(4);
    expect(meshes.length).toBeGreaterThanOrEqual(3);
    expect(lineSegments.length).toBe(1);
    expect(
      result.group.children.some((object) => object instanceof THREE.LineLoop),
    ).toBe(true);
  });

  it("renders highway lines as merged meshes in a dedicated group", () => {
    const result = buildTileVectorGroup(
      [
        feature(
          {
            type: "LineString",
            coordinates: [
              [-90, 66.4],
              [-89.995, 66.405],
            ],
          },
          { highway: "primary" },
        ),
        feature(
          {
            type: "LineString",
            coordinates: [
              [-89.998, 66.401],
              [-89.992, 66.407],
            ],
          },
          { highway: "secondary" },
        ),
        feature({
          type: "LineString",
          coordinates: [
            [-90, 66.41],
            [-89.99, 66.415],
          ],
        }),
      ],
      tile,
    );

    const highwayGroup = result.group.children.find(
      (object): object is THREE.Group =>
        object instanceof THREE.Group && object.name.includes("tile-highways"),
    );

    expect(highwayGroup).toBeTruthy();
    expect(
      highwayGroup?.children.some((object) => object instanceof THREE.Mesh),
    ).toBe(true);
    expect(
      highwayGroup?.children.filter((object) => object instanceof THREE.Line)
        .length,
    ).toBe(0);
  });

  it("maps highway width from explicit tags before highway type defaults", () => {
    const result = buildTileVectorGroup(
      [
        feature(
          {
            type: "LineString",
            coordinates: [
              [-90, 66.4],
              [-89.995, 66.405],
            ],
          },
          { highway: "primary", width: "12" },
        ),
      ],
      tile,
    );

    const highwayGroup = result.group.children.find(
      (object): object is THREE.Group =>
        object instanceof THREE.Group && object.name.includes("tile-highways"),
    );
    const highwayMesh = highwayGroup?.children.find(
      (object): object is THREE.Mesh => object instanceof THREE.Mesh,
    );

    expect(highwayMesh).toBeTruthy();
    const width = new THREE.Box3()
      .setFromObject(highwayMesh!)
      .getSize(new THREE.Vector3()).x;
    expect(width).toBeGreaterThan(0);
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

  it("assigns variant building colors by building type", () => {
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
          { building: "house", height: 14 },
        ),
        feature(
          {
            type: "Polygon",
            coordinates: [
              [
                [-90.02, 66.4],
                [-90.01, 66.4],
                [-90.01, 66.41],
                [-90.02, 66.41],
                [-90.02, 66.4],
              ],
            ],
          },
          { building: "office", height: 16 },
        ),
      ],
      tile,
    );

    const buildingMeshes = result.group.children.filter(
      (object): object is THREE.Mesh =>
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshStandardMaterial,
    );
    const materialHexes = new Set(
      buildingMeshes.map((mesh) => mesh.material.color.getHexString()),
    );

    expect(materialHexes.size).toBeGreaterThanOrEqual(3);
  });
});
