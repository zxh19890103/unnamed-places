import {
  convert4326To3857,
  Meters_per_lat,
  Meters_per_lon,
  tileToLatLon,
} from "./calc.js";

import type * as gj from "geojson";
import type { Texture } from "three";

export type TilePosition = {
  x: number;
  y: number;
  z: number;
};

export function splitTileDownTo4(x: number, y: number, zoom: number) {
  const z = zoom + 1;

  const bbox0 = calcTileBBOX(2 * x, 2 * y, z);
  bbox0.placement = "top-left";

  const bbox1 = calcTileBBOX(2 * x + 1, 2 * y, z);
  bbox1.placement = "top-right";

  const bbox2 = calcTileBBOX(2 * x, 2 * y + 1, z);
  bbox2.placement = "bottom-left";

  const bbox3 = calcTileBBOX(2 * x + 1, 2 * y + 1, z);
  bbox3.placement = "bottom-right";

  return {
    topLeft: bbox0,
    topRight: bbox1,
    bottomLeft: bbox2,
    bottomRight: bbox3,
    /**
     * bottomLeft, bottomRight, topLeft, topRight
     */
    asArray: [bbox2, bbox3, bbox0, bbox1],
  };
}

export function calcTileBBOX(x: number, y: number, z: number): TileBBOX {
  const leftTop = tileToLatLon(x, y, z);
  const rightTop = tileToLatLon(x + 1, y, z);
  const leftBottom = tileToLatLon(x, y + 1, z);
  const rightBottom = tileToLatLon(x + 1, y + 1, z);
  const center = tileToLatLon(x + 0.5, y + 0.5, z);

  const bbox = `${leftBottom.lat},${leftBottom.lng},${rightTop.lat},${rightTop.lng}`;
  const bbox3857 = `${convert4326To3857(leftBottom)},${convert4326To3857(
    rightTop
  )}`;

  const dLng = rightTop.lng - leftBottom.lng;
  const dLat = rightTop.lat - leftBottom.lat;

  const meters_per_lon = Meters_per_lon(center.lat);
  const measure_on_x = meters_per_lon * dLng;
  const measure_on_y = Meters_per_lat * dLat;

  return {
    x,
    y,
    z,
    placement: "none",
    leftTop,
    rightTop,
    leftBottom,
    rightBottom,
    center,
    measureX: measure_on_x,
    measureY: measure_on_y,
    dLng: dLng,
    dLat: dLat,
    bbox: bbox,
    bbox3857: bbox3857,
  };
}

export const getGoogleTileUrl = (xyz: TilePosition, styled = false) => {
  if (styled) {
    return `/gootile-styled/${xyz.z}/${xyz.x}/${xyz.y}`;
  } else {
    return `/gootile/${xyz.z}/${xyz.x}/${xyz.y}?scale=4`;
  }
};

export const createLatlngToTileCoordProjector = (xyz: TilePosition) => {
  const bbox = calcTileBBOX(xyz.x, xyz.y, xyz.z);

  const meters_per_lon = Meters_per_lon(bbox.center.lat);

  const project = (lnglat: gj.Position | GeoJsonLngLat) => {
    const dlat = lnglat[1] - bbox.leftBottom.lat;
    const dlng = lnglat[0] - bbox.leftBottom.lng;

    const x = meters_per_lon * dlng;
    const y = Meters_per_lat * dlat;

    return [x, y, 0] as TileCoords;
  };

  return project;
};

export type TileBBOX = {
  placement: TileBBOXSplitPlace;
  x: number;
  y: number;
  z: number;
  dLat: number;
  dLng: number;
  bbox: string;
  bbox3857: string;
  rightTop: L.LatLngLiteral;
  leftBottom: L.LatLngLiteral;
  center: L.LatLngLiteral;
  measureX: number;
  measureY: number;
  [k: string]: any;
};

type TileBBOXSplitPlace =
  | "none"
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export type TileElevation = {
  span: number;
  minElevation: number;
  maxElevation: number;
};

type TileCoords = [number, number, number];
type GeoJsonLngLat = [number, number];

export type TileCRSProjection = (
  lnglat: gj.Position | GeoJsonLngLat
) => TileCoords;

export type DemInformation = {
  texture: Texture;
  elevation: TileElevation;
};
