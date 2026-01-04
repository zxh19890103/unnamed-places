import { convert4326To3857, tileToLatLon } from "./calc.js";

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
    dLng: rightTop.lng - leftBottom.lng,
    dLat: rightTop.lat - leftBottom.lat,
    bbox: bbox,
    bbox3857: bbox3857,
  };
}

export const getGoogleTileUrl = (xyz: TilePosition, styled = false) => {
  return `/gootile/${xyz.z}/${xyz.x}/${xyz.y}?styled=${styled}`;
  // return `https://mt1.google.com/vt/lyrs=s&x=${xyz.x}&y=${xyz.y}&z=${xyz.z}&scale=2&hl=en`;
};

type TileBBOX = {
  x: number;
  y: number;
  z: number;
  dLat: number;
  dLng: number;
  placement: TileBBOXSplitPlace;
  center: L.LatLngLiteral;
  bbox: string;
  bbox3857: string;
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
