export type LatLng = {
  lat: number;
  lng: number;
  alt?: number;
};

export type WorldExtent = {
  north: number;
  east: number;
  west: number;
  south: number;

  latSpan: number;
  lngSpan: number;
};
