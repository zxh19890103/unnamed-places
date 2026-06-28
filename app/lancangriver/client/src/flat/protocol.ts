import type { LatLng } from "../calc/types";

export const FLAT_CENTER_CONFIRMED = "flat:center-confirmed";

export function buildFlatModalUrl(center: LatLng | null) {
  if (!center) {
    return "/flat.html";
  }

  const search = new URLSearchParams({
    lat: `${center.lat}`,
    lng: `${center.lng}`,
  });

  return `/flat.html?${search.toString()}`;
}

export function readInitialCenterFromSearch(search: string): LatLng | null {
  const params = new URLSearchParams(search);
  const latRaw = params.get("lat");
  const lngRaw = params.get("lng");

  if (latRaw === null || lngRaw === null) {
    return null;
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}
