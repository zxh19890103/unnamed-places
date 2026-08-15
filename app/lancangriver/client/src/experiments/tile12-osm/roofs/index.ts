import * as THREE from "three";
import { RoofGeometryFactory, RoofStyle } from "./_types.js";
import { TileProjection } from "../tile.js";
import building_roof_building_factories__fence from "./builders/fence.js";
import building_roof_building_factories__flat from "./builders/flat.js";
import building_roof_building_factories__fun from "./builders/fun.js";
import building_roof_building_factories__modern from "./builders/modern.js";

export const createBuildingRoofGeometry = (
  features: GeoJSON.Feature,
  heightMeters: number,
  projection: TileProjection,
  roofStyle: RoofStyle,
): THREE.BufferGeometry => {
  const geometry =
    building_roof_building_factories[roofStyle]?.(
      [],
      features,
      heightMeters,
      projection,
    ) ?? null;

  geometry.computeVertexNormals();
  return geometry;
};

export function resolveBuildingRoofStyle(
  feature: GeoJSON.Feature,
  heightMeters: number,
): RoofStyle {
  const props = feature.properties as Record<string, unknown> | null;
  const roofShapeRaw = (props?.["roof:shape"] ??
    props?.["roof:style"] ??
    "") as string;
  const roofShape =
    roofShapeRaw.toLowerCase().trim().split(";")[0]?.trim() ?? "";

  if (
    roofShape === "fence" ||
    roofShape === "railing" ||
    roofShape === "parapet"
  ) {
    return "fence";
  }

  if (heightMeters < 10) {
    return "fun";
  }

  if (heightMeters > 40) {
    return "fence";
  }

  const raw = (props?.["building"] ??
    props?.["building:use"] ??
    props?.["amenity"] ??
    "") as string;
  const type = raw.toLowerCase().trim().split(";")[0]?.trim() ?? "";

  if (FUN_ROOF_TYPES.has(type)) {
    return "fun";
  }

  return "flat";
}

// Building types that suit a pyramid-style roof
const FUN_ROOF_TYPES = new Set([
  "house",
  "detached",
  "bungalow",
  "hut",
  "cabin",
  "church",
  "cathedral",
  "mosque",
  "synagogue",
  "chapel",
  "pagoda",
]);

export const building_roof_building_factories: Record<
  RoofStyle,
  RoofGeometryFactory
> = {
  fence: null,
  flat: null,
  fun: null,
  modern: null,
  skillion: null,
  gabled: null,
  hipped: null,
};

building_roof_building_factories.flat = building_roof_building_factories__flat;
building_roof_building_factories.fun = building_roof_building_factories__fun;
building_roof_building_factories.modern =
  building_roof_building_factories__modern;
building_roof_building_factories.fence =
  building_roof_building_factories__fence;
