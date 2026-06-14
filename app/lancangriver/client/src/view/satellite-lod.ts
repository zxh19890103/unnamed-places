import type { TileKey } from "./request-scheduler";

export type ChildTile = TileKey & {
  offsetX: number;
  offsetY: number;
};

type SatelliteZoomBand = {
  zoom: number;
  minDistance: number;
  upperDistance: number;
};

const SATELLITE_ZOOM_BANDS: SatelliteZoomBand[] = [
  { zoom: 11, minDistance: 120_000, upperDistance: Number.POSITIVE_INFINITY },
  { zoom: 12, minDistance: 70_000, upperDistance: 120_000 },
  { zoom: 13, minDistance: 40_000, upperDistance: 70_000 },
  { zoom: 14, minDistance: 22_000, upperDistance: 40_000 },
  { zoom: 15, minDistance: 12_000, upperDistance: 22_000 },
  { zoom: 16, minDistance: 0, upperDistance: 12_000 },
];

const HYSTERESIS_DISTANCE = 5_000;

function chooseZoomForDistance(distanceToTile: number): number {
  for (const band of SATELLITE_ZOOM_BANDS) {
    if (distanceToTile >= band.minDistance) {
      return band.zoom;
    }
  }

  return 16;
}

function getUpperDistanceForZoom(zoom: number): number | undefined {
  return SATELLITE_ZOOM_BANDS.find((band) => band.zoom === zoom)?.upperDistance;
}

export function chooseSatelliteZoom(
  distanceToTile: number,
  currentZoom?: number,
): number {
  const desiredZoom = chooseZoomForDistance(distanceToTile);

  if (currentZoom == null || currentZoom === desiredZoom) {
    return desiredZoom;
  }

  if (currentZoom < 11 || currentZoom > 16) {
    return desiredZoom;
  }

  if (Math.abs(currentZoom - desiredZoom) > 1) {
    return desiredZoom;
  }

  const boundary =
    desiredZoom > currentZoom
      ? getUpperDistanceForZoom(desiredZoom)
      : getUpperDistanceForZoom(currentZoom);

  if (boundary == null) {
    return desiredZoom;
  }

  if (desiredZoom > currentZoom) {
    return distanceToTile >= boundary - HYSTERESIS_DISTANCE
      ? currentZoom
      : desiredZoom;
  }

  return distanceToTile <= boundary + HYSTERESIS_DISTANCE
    ? currentZoom
    : desiredZoom;
}

export function enumerateChildTiles(
  baseTile: TileKey,
  targetZoom: number,
): ChildTile[] {
  if (targetZoom <= baseTile.z) {
    return [
      {
        ...baseTile,
        z: baseTile.z,
        offsetX: 0,
        offsetY: 0,
      },
    ];
  }

  const factor = 2 ** (targetZoom - baseTile.z);
  const startX = baseTile.x * factor;
  const startY = baseTile.y * factor;
  const children: ChildTile[] = [];

  for (let y = 0; y < factor; y += 1) {
    for (let x = 0; x < factor; x += 1) {
      children.push({
        z: targetZoom,
        x: startX + x,
        y: startY + y,
        offsetX: x,
        offsetY: y,
      });
    }
  }

  return children;
}
