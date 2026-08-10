import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildTileVectorGroup,
  buildWaterFlowUv,
  getHighwayOffGroundMeters,
} from "./render";

const tile = { z: 12, x: 1024, y: 1024 };

function feature(
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties = {},
): GeoJSON.Feature {
  return { type: "Feature", geometry, properties };
}

function findBuildingRoofYExtents(
  result: ReturnType<typeof buildTileVectorGroup>,
): {
  minY: number;
  maxY: number;
} {
  const roofMeshes = result.group.children.filter(
    (object): object is THREE.Mesh =>
      object instanceof THREE.Mesh &&
      object.material instanceof THREE.MeshStandardMaterial,
  );

  const roofY: number[] = [];
  for (const mesh of roofMeshes) {
    const position = mesh.geometry.getAttribute("position");
    if (!position) {
      continue;
    }

    for (let index = 0; index < position.count; index += 1) {
      roofY.push(position.getY(index));
    }
  }

  return {
    minY: Math.min(...roofY),
    maxY: Math.max(...roofY),
  };
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

  it("computes highway offsets from layer and bridge or tunnel tags", () => {
    expect(
      getHighwayOffGroundMeters(
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
      ),
    ).toBeCloseTo(0.18, 5);

    expect(
      getHighwayOffGroundMeters(
        feature(
          {
            type: "LineString",
            coordinates: [
              [-90, 66.4],
              [-89.995, 66.405],
            ],
          },
          { highway: "primary", bridge: "yes" },
        ),
      ),
    ).toBeCloseTo(2.68, 5);

    expect(
      getHighwayOffGroundMeters(
        feature(
          {
            type: "LineString",
            coordinates: [
              [-90, 66.4],
              [-89.995, 66.405],
            ],
          },
          { highway: "primary", tunnel: "yes", layer: -1 },
        ),
      ),
    ).toBeCloseTo(-3.82, 5);
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

    const materialHexes = new Set(
      result.group.children.flatMap((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return [];
        }

        if (object.material instanceof THREE.MeshStandardMaterial) {
          return [object.material.color.getHexString()];
        }

        if (object.material instanceof THREE.ShaderMaterial) {
          const baseColor = object.material.uniforms.baseColor?.value;
          if (baseColor instanceof THREE.Color) {
            return [baseColor.getHexString()];
          }
        }

        return [];
      }),
    );

    expect(materialHexes.size).toBeGreaterThanOrEqual(3);
  });

  it("fills building metadata with random atlas grid indices in R and G", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
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
      ],
      tile,
    );

    const buildingMesh = result.group.children.find(
      (object): object is THREE.Mesh =>
        object instanceof THREE.Mesh &&
        object.geometry.getAttribute("metadata") !== undefined,
    );

    expect(buildingMesh).toBeTruthy();

    const metadata = buildingMesh!.geometry.getAttribute("metadata");
    const position = buildingMesh!.geometry.getAttribute("position");

    expect(metadata).toBeTruthy();
    expect(metadata.itemSize).toBe(4);
    expect(metadata.count).toBe(position.count);

    const expected = Array.from({ length: position.count }, () => [
      2, 1, 0, 0,
    ]).flat();

    expect(Array.from(metadata.array)).toEqual(expected);

    randomSpy.mockRestore();
  });

  it("uses a custom shader material to sample the correct atlas cell", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {});

    const texture = new THREE.Texture() as THREE.Texture<HTMLImageElement>;
    const loadSpy = vi
      .spyOn(THREE.TextureLoader.prototype, "load")
      .mockImplementation(() => texture as any);

    const { buildTileVectorGroup: buildTileVectorGroupWithTexture } =
      await import("./render");

    const result = buildTileVectorGroupWithTexture(
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
      ],
      tile,
    );

    const wallMesh = result.group.children.find(
      (
        object,
      ): object is THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> =>
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.ShaderMaterial &&
        object.material.uniforms.map?.value === texture &&
        object.geometry.getAttribute("metadata") !== undefined,
    );

    expect(wallMesh).toBeTruthy();

    expect(wallMesh!.material.uniforms.baseColor?.value).toBeInstanceOf(
      THREE.Color,
    );
    expect(wallMesh!.material.uniforms.atlasGridSize?.value).toBeInstanceOf(
      THREE.Vector2,
    );
    expect(wallMesh!.material.vertexShader).toContain(
      "attribute vec4 metadata;",
    );
    expect(wallMesh!.material.vertexShader).toContain(
      "vAtlasGridIndex = metadata.xy;",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "varying vec2 vAtlasGridIndex;",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "uniform vec2 atlasGridSize;",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "uniform float atlasUvInset;",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "vec2 localUv = fract(vUv * 2.0);",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "localUv = localUv * (1.0 - atlasUvInset * 2.0) + atlasUvInset;",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "vec2 atlasUv = (vAtlasGridIndex + localUv) / atlasGridSize;",
    );
    expect(wallMesh!.material.fragmentShader).toContain(
      "dot(normal, lightDir)",
    );

    loadSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("caps guessed height for small-footprint buildings", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);

    const result = buildTileVectorGroup(
      [
        feature(
          {
            type: "Polygon",
            coordinates: [
              [
                [-90, 66.4],
                [-89.99995, 66.4],
                [-89.99995, 66.40005],
                [-90, 66.40005],
                [-90, 66.4],
              ],
            ],
          },
          { building: "yes" },
        ),
      ],
      tile,
    );

    const { maxY } = findBuildingRoofYExtents(result);

    expect(maxY).toBeLessThan(16);

    randomSpy.mockRestore();
  });

  it("still allows taller guessed heights for larger footprints", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);

    const result = buildTileVectorGroup(
      [
        feature(
          {
            type: "Polygon",
            coordinates: [
              [
                [-90, 66.4],
                [-89.998, 66.4],
                [-89.998, 66.402],
                [-90, 66.402],
                [-90, 66.4],
              ],
            ],
          },
          { building: "yes" },
        ),
      ],
      tile,
    );

    const { minY, maxY } = findBuildingRoofYExtents(result);

    expect(maxY).toBeGreaterThan(minY + 20);

    randomSpy.mockRestore();
  });

  it("keeps flow UV zeroed for non-river water polygons", () => {
    const polygon = new THREE.ShapeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(100, 0),
        new THREE.Vector2(100, 20),
        new THREE.Vector2(0, 20),
      ]),
    );
    polygon.rotateX(-Math.PI / 2);

    const flowUvArray = buildWaterFlowUv(
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
        { natural: "water", water: "lake" },
      ),
      polygon,
    );

    expect(flowUvArray.length).toBeGreaterThan(0);
    expect(Array.from(flowUvArray)).toSatisfy((values: number[]) =>
      values.every((value) => value === 0),
    );

    polygon.dispose();
  });

  it("computes directional flow UV for river water polygons", () => {
    const polygon = new THREE.ShapeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(100, 8),
        new THREE.Vector2(100, 18),
        new THREE.Vector2(0, 10),
      ]),
    );
    polygon.rotateX(-Math.PI / 2);

    const flowUvArray = buildWaterFlowUv(
      feature(
        {
          type: "Polygon",
          coordinates: [
            [
              [-90.0, 66.4],
              [-89.985, 66.401],
              [-89.986, 66.406],
              [-90.001, 66.405],
              [-90.0, 66.4],
            ],
          ],
        },
        { natural: "water", waterway: "riverbank" },
      ),
      polygon,
    );

    const values = Array.from(flowUvArray);
    const uValues = values.filter((_, index) => index % 2 === 0);
    const vValues = values.filter((_, index) => index % 2 === 1);

    const uRange = Math.max(...uValues) - Math.min(...uValues);
    const vRange = Math.max(...vValues) - Math.min(...vValues);

    expect(uRange).toBeGreaterThan(0.1);
    expect(vRange).toBeGreaterThan(0.1);

    polygon.dispose();
  });
});
