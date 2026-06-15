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

const MIN_SATELLITE_ZOOM = 11;
const MAX_SATELLITE_ZOOM = 11;

const SATELLITE_ZOOM_BANDS: SatelliteZoomBand[] = [
  { zoom: 11, minDistance: 120_000, upperDistance: Number.POSITIVE_INFINITY },
];

const HYSTERESIS_DISTANCE = 5_000;

function chooseZoomForDistance(distanceToTile: number): number {
  for (const band of SATELLITE_ZOOM_BANDS) {
    if (distanceToTile >= band.minDistance) {
      return band.zoom;
    }
  }

  return MAX_SATELLITE_ZOOM;
}

function getUpperDistanceForZoom(zoom: number): number | undefined {
  return SATELLITE_ZOOM_BANDS.find((band) => band.zoom === zoom)?.upperDistance;
}

export function chooseSatelliteZoom(
  distanceToTile: number,
  currentZoom?: number,
): number {
  void distanceToTile;
  void currentZoom;
  return MIN_SATELLITE_ZOOM;
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
