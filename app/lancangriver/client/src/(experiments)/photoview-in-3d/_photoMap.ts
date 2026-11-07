import type { PathOptions } from 'leaflet';
import { BASE_URL } from '@/calc/constants';
import type { PhotoRecord } from '@/photos/types';
import type { BBox } from './_tile';

export const MAP_CATEGORIES = ['natural_water', 'waters', 'highways', 'places'] as const;
export type MapCategory = (typeof MAP_CATEGORIES)[number];

export const MAP_CATEGORY_LABELS: Record<MapCategory, string> = {
  natural_water: 'Water polygons',
  waters: 'Waterways',
  highways: 'Highways',
  places: 'Places',
};

export function hasPhotoLocation(photo: PhotoRecord): boolean {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng)
    && photo.lat >= -90 && photo.lat <= 90 && photo.lng >= -180 && photo.lng <= 180;
}

export function getMapBboxKey(bbox: BBox | null): string | null {
  if (!bbox) return null;
  const { west, south, east, north } = bbox;
  if (![west, south, east, north].every(Number.isFinite)
    || west < -180 || east > 180 || south < -90 || north > 90
    || west >= east || south >= north) return null;
  return [west, south, east, north].join(',');
}

function isPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite);
}

function isCoordinateArray(value: unknown, check: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(check);
}

function isGeometry(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === 'GeometryCollection') {
    return 'geometries' in value && isCoordinateArray(value.geometries, isGeometry);
  }
  if (!('coordinates' in value)) return false;
  const coordinates = value.coordinates;
  switch (value.type) {
    case 'Point': return isPosition(coordinates);
    case 'MultiPoint':
    case 'LineString': return isCoordinateArray(coordinates, isPosition);
    case 'MultiLineString':
    case 'Polygon':
      return isCoordinateArray(coordinates, (line) => isCoordinateArray(line, isPosition));
    case 'MultiPolygon':
      return isCoordinateArray(coordinates, (polygon) =>
        isCoordinateArray(polygon, (ring) => isCoordinateArray(ring, isPosition)));
    default: return false;
  }
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
  if (!value || typeof value !== 'object' || !('type' in value)
    || value.type !== 'FeatureCollection' || !('features' in value)
    || !Array.isArray(value.features)) return false;
  return value.features.every((feature: unknown) =>
    !!feature && typeof feature === 'object'
    && 'type' in feature && feature.type === 'Feature'
    && 'geometry' in feature && (feature.geometry === null || isGeometry(feature.geometry)));
}

export async function fetchPhotoMapLayer(
  category: MapCategory,
  bbox: string,
  signal: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(`${BASE_URL}/vector/${category}?bbox=${bbox}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const data: unknown = await response.json();
  if (!isFeatureCollection(data)) throw new Error('Invalid GeoJSON FeatureCollection');
  return data;
}

export function featureText(feature: GeoJSON.Feature, key: string): string {
  const properties = feature.properties;
  const value = properties?.tags?.[key] ?? properties?.[key];
  return typeof value === 'string' ? value : '';
}

export function placeName(feature: GeoJSON.Feature): string {
  return featureText(feature, 'name:zh') || featureText(feature, 'name:zh-Hans')
    || featureText(feature, 'name') || featureText(feature, 'name:en');
}

export function placeLabelStyle(feature: GeoJSON.Feature): {
  fontSize: number;
  fontWeight: number;
  minZoom: number;
} {
  const category = featureText(feature, 'place') || featureText(feature, 'feature_type');
  switch (category) {
    case 'city': return { fontSize: 16, fontWeight: 700, minZoom: 0 };
    case 'town': return { fontSize: 14, fontWeight: 600, minZoom: 10 };
    case 'suburb': return { fontSize: 13, fontWeight: 600, minZoom: 10 };
    case 'village': return { fontSize: 12, fontWeight: 500, minZoom: 12 };
    case 'hamlet': return { fontSize: 11, fontWeight: 500, minZoom: 14 };
    case 'neighbourhood':
    case 'locality':
    case 'isolated_dwelling':
      return { fontSize: 10, fontWeight: 400, minZoom: 14 };
    default: return { fontSize: 11, fontWeight: 500, minZoom: 14 };
  }
}

export function photoMapStyle(category: MapCategory, feature?: GeoJSON.Feature): PathOptions {
  if (category === 'natural_water') {
    return { color: '#397d91', weight: 1, fillColor: '#24586b', fillOpacity: 0.8 };
  }
  if (category === 'waters') return { color: '#63adc0', weight: 2, opacity: 0.85 };
  const kind = feature ? featureText(feature, 'highway') || featureText(feature, 'feature_type') : '';
  if (/^(motorway|trunk|primary)/.test(kind)) return { color: '#e8b779', weight: 3 };
  if (/^(secondary|tertiary)/.test(kind)) return { color: '#cabca0', weight: 2 };
  if (/^(path|footway|track|cycleway|steps)/.test(kind)) {
    return { color: '#98a99c', weight: 1, dashArray: '3 4' };
  }
  return { color: '#aeb8af', weight: 1.5, opacity: 0.8 };
}
