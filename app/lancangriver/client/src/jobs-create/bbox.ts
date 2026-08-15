export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type LatLng = {
  lat: number;
  lng: number;
};

const DEFAULT_BBOX: BBox = {
  west: 120.15,
  south: 22.47,
  east: 120.45,
  north: 22.77,
};

/** Reads a `bbox=west,south,east,north` query param, falling back to a default. */
export function readBBoxFromSearch(search: string): BBox {
  const params = new URLSearchParams(search);
  const raw = params.get("bbox");
  if (!raw) {
    return DEFAULT_BBOX;
  }

  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return DEFAULT_BBOX;
  }

  const [west, south, east, north] = parts;
  return { west, south, east, north };
}

/** Reads a `latlng=lat,lng` query param, returning null when absent or invalid. */
export function readLatLngFromSearch(search: string): LatLng | null {
  const params = new URLSearchParams(search);
  const raw = params.get("latlng");
  if (!raw) {
    return null;
  }

  const parts = raw.split(",").map(Number);
  if (parts.length !== 2 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }

  const [lat, lng] = parts;
  return { lat, lng };
}
