import * as THREE from "three";
import { PolygonFeatureKind, PolygonFeatureToGeometry } from "../_types";
import { createBuildingRoofGeometry, resolveBuildingRoofStyle } from "../roofs";
import { TileProjection } from "../tile";
import { BuildingVariantBucket } from "./_types";
import {
  applyBuildingRepeatUv,
  BUILDING_FACE_TEXTURE_GRID,
  BUILDING_TEXTURE_GRID,
  buildingVariantForFeature,
  ensureMetadataAttribute,
  getBuildingHeight,
  getOrCreateBuildingBucket,
  splitBuildingGeometryByFaceType,
} from "./base";

export const buildBuildingPerFeature = (
  polygon: PolygonFeatureToGeometry,
  feature: GeoJSON.Feature,
  buckets: Map<string, BuildingVariantBucket>,
  projection: TileProjection,
) => {
  const buildingBucket = getOrCreateBuildingBucket(
    buckets,
    buildingVariantForFeature(feature),
  );

  const roofStyle = resolveBuildingRoofStyle(feature, polygon.extrudedMeters);

  const roof = createBuildingRoofGeometry(
    feature,
    polygon.extrudedMeters,
    projection,
    roofStyle,
  );

  const split = splitBuildingGeometryByFaceType(polygon.geometry);
  polygon.geometry.dispose();

  if (roof) {
    ensureMetadataAttribute(
      roof,
      projection,
      BUILDING_TEXTURE_GRID,
      polygon.centroid,
    );
    buildingBucket.roof.push(roof);
  }

  if (split.wall) {
    ensureMetadataAttribute(
      split.wall,
      projection,
      BUILDING_TEXTURE_GRID,
      polygon.centroid,
    );
    buildingBucket.wall.push(split.wall);
  }

  if (split.face) {
    ensureMetadataAttribute(
      split.face,
      projection,
      BUILDING_FACE_TEXTURE_GRID,
      polygon.centroid,
    );
    buildingBucket.face.push(split.face);
  }
};

export const buildBuildingPloygonPerFeature = (
  feature: GeoJSON.Feature,
  shape: THREE.Shape,
  centroid: [number, number],
  kind: PolygonFeatureKind,
): PolygonFeatureToGeometry => {
  const buildingHeightMeters = Math.max(1, getBuildingHeight(feature));
  const extrudedMeters = buildingHeightMeters;

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: buildingHeightMeters,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });

  geometry.rotateX(-Math.PI / 2);
  applyBuildingRepeatUv(geometry);

  return {
    centroid,
    kind,
    geometry,
    extrudedMeters,
  };
};
