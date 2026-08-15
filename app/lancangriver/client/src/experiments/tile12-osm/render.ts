import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { TileCoords } from "../../osm/tiles.js";
import { createTileProjection, type TileProjection } from "./tile.js";

import * as polygonUtils from "./_polygon.js";
import { PolygonFeatureToGeometry } from "./_types.js";
import { BuildingVariantBucket } from "./buildings/_types.js";
import {
  buildBuildingPerFeature,
  buildBuildingPloygonPerFeature,
} from "./buildings/index.js";
import { getBuildingTexture } from "./buildings/base.js";
import { HighwayGeometryEntry } from "./highways/_types.js";
import {
  HIGHWAY_WIDTH_METERS_SCALE,
  isHighwayFeature,
} from "./highways/base.js";
import { createHighwayGeometry } from "./highways/index.js";
import { addWaterFlow, isRiverWaterFeature } from "./waters/index.js";
import {
  createWaterMaterial,
  createWaterRiverMaterial,
} from "./waters/materials.js";
import {
  createHighwayMaterial,
  createHighwayPolygonMaterial,
} from "./highways/materials.js";
import { createBuildingRoofMaterial } from "./roofs/materials.js";
import {
  createBuildingFaceMaterial,
  createBuildingWallMaterial,
} from "./buildings/materials.js";

type TileVectorGroup = {
  group: THREE.Group;
  projection: TileProjection;
  objectCount: number;
  getHighwayBWMask: () => THREE.CanvasTexture;
  dispose: () => void;
};

type GeometryKind =
  | "buildingRoof"
  | "buildingWall"
  | "buildingFace"
  | "water"
  | "other"
  | "highway"
  | "river"
  | "highway2"
  | "line"
  | "point";

type GeometryBuckets = Omit<
  Record<GeometryKind, THREE.BufferGeometry[]>,
  "highway"
> & {
  highway: HighwayGeometryEntry[];
};

function addPolygon(
  feature: GeoJSON.Feature,
  rings: GeoJSON.Position[][],
  projection: TileProjection,
): PolygonFeatureToGeometry {
  const shape = polygonUtils.polygonShape(rings, projection);

  if (!shape) {
    return null;
  }

  const centroid = polygonUtils.shapeCentroidFromPoints(shape);
  const kind = polygonUtils.classifyPolygonFeature(feature);

  let extrudedMeters = 0;
  let geometry: THREE.BufferGeometry;

  if (kind === "building") {
    return buildBuildingPloygonPerFeature(feature, shape, centroid, kind);
  }

  geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);

  const positionAttr = geometry.getAttribute("position");
  if (positionAttr) {
    const gisUv = new Float32Array(positionAttr.count * 2);
    for (let index = 0; index < positionAttr.count; index += 1) {
      gisUv[index * 2 + 0] =
        positionAttr.getX(index) / projection.widthMeters + 0.5;
      gisUv[index * 2 + 1] =
        -positionAttr.getZ(index) / projection.heightMeters + 0.5;
    }
    geometry.setAttribute("gisUv", new THREE.BufferAttribute(gisUv, 2));
  }

  geometry.translate(0, kind === "water" ? 0.1 : 0.05, 0);

  return {
    kind,
    centroid,
    geometry,
    extrudedMeters,
  };
}

function addLine(
  coordinates: GeoJSON.Position[],
  projection: TileProjection,
): THREE.BufferGeometry | null {
  if (coordinates.length < 2) {
    return null;
  }

  const segments: THREE.Vector3[] = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = projection.project(coordinates[index - 1]);
    const end = projection.project(coordinates[index]);
    segments.push(
      new THREE.Vector3(start.x, 0.35, start.z),
      new THREE.Vector3(end.x, 0.35, end.z),
    );
  }

  return new THREE.BufferGeometry().setFromPoints(segments);
}

function addPoint(
  position: GeoJSON.Position,
  projection: TileProjection,
  markerTemplate: THREE.SphereGeometry,
): THREE.BufferGeometry {
  const projected = projection.project(position);
  const geometry = markerTemplate.clone();
  geometry.translate(
    projected.x,
    markerTemplate.parameters.radius,
    projected.z,
  );
  return geometry;
}

function addMergedMesh(
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  material: THREE.Material,
): void {
  if (geometries.length === 0) {
    return;
  }

  if (geometries.length === 1) {
    group.add(new THREE.Mesh(geometries[0], material));
    return;
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    for (const geometry of geometries) {
      group.add(new THREE.Mesh(geometry, material));
    }
    return;
  }

  for (const geometry of geometries) {
    geometry.dispose();
  }

  group.add(new THREE.Mesh(merged, material));
}

function addMergedLineSegments(
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  material: THREE.LineBasicMaterial,
): void {
  if (geometries.length === 0) {
    return;
  }

  if (geometries.length === 1) {
    group.add(new THREE.LineSegments(geometries[0], material));
    return;
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    for (const geometry of geometries) {
      group.add(new THREE.LineSegments(geometry, material));
    }
    return;
  }

  for (const geometry of geometries) {
    geometry.dispose();
  }

  group.add(new THREE.LineSegments(merged, material));
}

function addFeature(
  feature: GeoJSON.Feature,
  projection: TileProjection,
  buckets: GeometryBuckets,
  buildingBuckets: Map<string, BuildingVariantBucket>,
  markerTemplate: THREE.SphereGeometry,
): number {
  const geometry = feature.geometry;

  if (!geometry) {
    return 0;
  }

  switch (geometry.type) {
    case "Polygon": {
      const polygon = addPolygon(feature, geometry.coordinates, projection);

      if (!polygon) {
        return 0;
      }

      if (polygon.kind === "building") {
        buildBuildingPerFeature(polygon, feature, buildingBuckets, projection);
      } else if (polygon.kind === "highway") {
        buckets.highway2.push(polygon.geometry);
      } else if (polygon.kind === "water") {
        if (isRiverWaterFeature(feature)) {
          addWaterFlow(feature, polygon.geometry);
          buckets.river.push(polygon.geometry);
        } else {
          addWaterFlow(feature, polygon.geometry);
          buckets.water.push(polygon.geometry);
        }
      } else {
        buckets[polygon.kind].push(polygon.geometry);
      }

      return 1;
    }
    case "MultiPolygon": {
      return geometry.coordinates.reduce((count, polygon) => {
        const shape = addPolygon(feature, polygon, projection);

        if (!shape) {
          return count;
        }

        if (shape.kind === "building") {
          buildBuildingPerFeature(shape, feature, buildingBuckets, projection);
        } else if (shape.kind === "highway") {
          buckets.highway2.push(shape.geometry);
        } else if (shape.kind === "water") {
          if (isRiverWaterFeature(feature)) {
            addWaterFlow(feature, shape.geometry);
            buckets.river.push(shape.geometry);
          } else {
            addWaterFlow(feature, shape.geometry);
            buckets.water.push(shape.geometry);
          }
        } else {
          // other
          buckets[shape.kind].push(shape.geometry);
        }
        return count + 1;
      }, 0);
    }
    case "LineString": {
      const line = addLine(geometry.coordinates, projection);
      if (!line) {
        return 0;
      }

      if (isHighwayFeature(feature)) {
        buckets.highway.push(
          ...createHighwayGeometry(feature, geometry.coordinates, projection),
        );

        line.dispose();
      } else {
        buckets.line.push(line);
      }

      return 1;
    }
    case "MultiLineString":
      return geometry.coordinates.reduce((count, line) => {
        const geometry = addLine(line, projection);
        if (!geometry) {
          return count;
        }

        if (isHighwayFeature(feature)) {
          buckets.highway.push(
            ...createHighwayGeometry(feature, line, projection),
          );
          geometry.dispose();
        } else {
          buckets.line.push(geometry);
        }

        return count + 1;
      }, 0);
    case "Point":
      buckets.point.push(
        addPoint(geometry.coordinates, projection, markerTemplate),
      );
      return 1;
    case "MultiPoint":
      return geometry.coordinates.reduce(
        (count, point) =>
          count +
          (buckets.point.push(addPoint(point, projection, markerTemplate)), 1),
        0,
      );
    default:
      return 0;
  }
}

export function buildTileVectorGroup(
  features: GeoJSON.Feature[],
  tile: TileCoords,
  textureLoader: THREE.TextureLoader = null,
): TileVectorGroup {
  const projection = createTileProjection(tile);
  const group = new THREE.Group();
  group.name = `tile-vectors-${tile.z}-${tile.x}-${tile.y}`;

  const markerRadius = Math.max(
    1,
    Math.min(projection.widthMeters, projection.heightMeters) * 0.004,
  );

  const internalTextureLoader = textureLoader ?? new THREE.TextureLoader();

  const disposableMaterials: Array<THREE.Material> = [];

  const materials = {
    water: createWaterMaterial(internalTextureLoader, tile),
    river: createWaterRiverMaterial(internalTextureLoader, tile),
    highway2: createHighwayPolygonMaterial(internalTextureLoader, tile),
    highway: createHighwayMaterial(internalTextureLoader, tile),
    other: new THREE.MeshStandardMaterial({
      color: "#8b9a73",
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
    line: new THREE.LineBasicMaterial({ color: "#f5d28c" }),
    point: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.7 }),
  };

  disposableMaterials.push(
    materials.water,
    materials.other,
    materials.highway,
    materials.highway2,
    materials.river,
    materials.line,
    materials.point,
  );

  const markerTemplate = new THREE.SphereGeometry(markerRadius, 10, 8);

  const buckets: GeometryBuckets = {
    buildingRoof: [],
    buildingWall: [],
    buildingFace: [],
    water: [],
    river: [],
    other: [],
    highway2: [],
    highway: [],
    line: [],
    point: [],
  };

  const buildingBuckets = new Map<string, BuildingVariantBucket>();

  let objectCount = 0;
  for (const feature of features) {
    objectCount += addFeature(
      feature,
      projection,
      buckets,
      buildingBuckets,
      markerTemplate,
    );
  }

  const buildingTexture = getBuildingTexture(internalTextureLoader);

  const roofMaterial = createBuildingRoofMaterial("#fff", textureLoader, tile);

  const wallMaterial = createBuildingWallMaterial(
    "#fff",
    buildingTexture,
    textureLoader,
    tile,
  );

  const faceMaterial = createBuildingFaceMaterial("#f00", textureLoader, tile);

  disposableMaterials.push(roofMaterial, wallMaterial, faceMaterial);

  for (const bucket of buildingBuckets.values()) {
    addMergedMesh(group, bucket.roof, roofMaterial);
    addMergedMesh(group, bucket.wall, wallMaterial);
    addMergedMesh(group, bucket.face, faceMaterial);
  }

  addMergedMesh(group, buckets.highway2, materials.highway2);
  addMergedMesh(group, buckets.water, materials.water);
  addMergedMesh(group, buckets.river, materials.river);
  addMergedMesh(group, buckets.other, materials.other);

  {
    const defaultHighwaysGroup = new THREE.Group();
    defaultHighwaysGroup.name = `tile-highways-${tile.z}-${tile.x}-${tile.y}`;

    const highwayBuckets = new Map<string, HighwayGeometryEntry[]>();

    buckets.highway.forEach((ent) => {
      const value = highwayBuckets.get(ent.styleId);
      if (value) {
        value.push(ent);
      } else {
        highwayBuckets.set(ent.styleId, [ent]);
      }
    });

    for (const [styleId, entries] of highwayBuckets.entries()) {
      let material = null;

      if (styleId === "default") {
        material = materials.highway;
      } else {
        material = entries[0].category.getMaterial(textureLoader);
        disposableMaterials.push(material);
      }

      addMergedMesh(
        defaultHighwaysGroup,
        entries.map((entry) => entry.geometry),
        material,
      );
    }

    group.add(defaultHighwaysGroup);
  }

  addMergedLineSegments(group, buckets.line, materials.line);
  addMergedMesh(group, buckets.point, materials.point);

  const halfWidth = projection.widthMeters * 0.5;
  const halfHeight = projection.heightMeters * 0.5;

  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfWidth, 0.2, -halfHeight),
    new THREE.Vector3(halfWidth, 0.2, -halfHeight),
    new THREE.Vector3(halfWidth, 0.2, halfHeight),
    new THREE.Vector3(-halfWidth, 0.2, halfHeight),
  ]);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: "#d1d5db" });
  group.add(new THREE.LineLoop(outlineGeometry, outlineMaterial));

  const getHighwayBWMask = (): THREE.CanvasTexture | null => {
    if (buckets.highway.length === 0) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const halfWidth = projection.widthMeters * 0.5;
    const halfHeight = projection.heightMeters * 0.5;
    const metersToPixels = canvas.width / projection.widthMeters;

    for (const entry of buckets.highway) {
      if (entry.centerline.length < 2) {
        continue;
      }

      ctx.lineWidth = Math.max(
        4,
        entry.widthMeters * HIGHWAY_WIDTH_METERS_SCALE * metersToPixels,
      );

      ctx.beginPath();

      for (let index = 0; index < entry.centerline.length; index += 1) {
        const point = entry.centerline[index];
        const u =
          ((point.x + halfWidth) / projection.widthMeters) * canvas.width;
        const v =
          ((point.z + halfHeight) / projection.heightMeters) * canvas.height;

        if (index === 0) {
          ctx.moveTo(u, v);
        } else {
          ctx.lineTo(u, v);
        }
      }

      ctx.stroke();
    }

    // const div = document.createElement("div");
    // div.style.cssText = `background: #e019; position: fixed; top: 0; right: 0; width: 512px; height: 512px`;
    // document.body.appendChild(div);
    // canvas.style.cssText = `width: 512px; height: 512px;`;
    // div.appendChild(canvas);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    return texture;
  };

  return {
    group,
    projection,
    objectCount,
    getHighwayBWMask: getHighwayBWMask,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
        }
      });

      for (const material of disposableMaterials) {
        material?.dispose();
      }

      markerTemplate.dispose();
      outlineMaterial.dispose();
    },
  };
}
