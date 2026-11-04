import type { JourneyGeoNode, PhotoRecord } from './types';

export const MERCATOR_MAX_LATITUDE = 85.0511287798066;
export const DEFAULT_MIN_CHIP_LEVEL = 2;
export const DEFAULT_MAX_CHIP_LEVEL = 20;

export type PhotoChipBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type PhotoChip = {
  id: string; // `${level}/${x}/${y}`
  level: number;
  x: number;
  y: number;
  parentId: string | null;
  childIds: string[];
  photoCount: number;
  representativePhotoId: string;
  representativeLat: number;
  representativeLng: number;
  bounds: PhotoChipBounds;
};

export type PhotoChipHierarchy = {
  revision: string;
  minLevel: number;
  maxLevel: number;
  chipsByLevel: Map<number, Map<string, PhotoChip>>;
  allChips: Map<string, PhotoChip>;
  chipPhotoIds: Map<string, string[]>;
  photoMap: Map<string, PhotoRecord>;
  rootChipIds: string[];
  totalValidPhotos: number;
};

export type PhotoChipSelection = {
  chipId: string;
  revision: string;
  selectionType: 'single-photo' | 'multi-photo';
  photoIds: string[];
  representativePhotoId: string;
  representativeLat: number;
  representativeLng: number;
};

export function clampLatitude(lat: number): number {
  return Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, lat));
}

export function normalizeLongitude(lng: number): number {
  let normalized = (((lng + 180) % 360) + 360) % 360 - 180;
  if (normalized === -180 && lng > 0) {
    normalized = 180;
  }
  return normalized;
}

export function latLngToMercatorTileXY(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  const clampedLat = clampLatitude(lat);
  const normalizedLng = normalizeLongitude(lng);

  const xFrac = ((normalizedLng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const yFrac =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const x = Math.min(n - 1, Math.max(0, Math.floor(xFrac)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(yFrac)));

  return { x, y };
}

export function getChipLevelForMapZoom(
  mapZoom: number,
  minLevel = DEFAULT_MIN_CHIP_LEVEL,
  maxLevel = DEFAULT_MAX_CHIP_LEVEL,
): number {
  const targetLevel = Math.round(mapZoom) + 2;
  return Math.max(minLevel, Math.min(maxLevel, targetLevel));
}

export function buildPhotoChipHierarchy(
  records: PhotoRecord[],
  options?: {
    minLevel?: number;
    maxLevel?: number;
    revision?: string;
  },
): PhotoChipHierarchy {
  const minLevel = options?.minLevel ?? DEFAULT_MIN_CHIP_LEVEL;
  const maxLevel = options?.maxLevel ?? DEFAULT_MAX_CHIP_LEVEL;
  const revision = options?.revision ?? `rev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const photoMap = new Map<string, PhotoRecord>();
  const validPhotos: PhotoRecord[] = [];

  for (const record of records) {
    if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) {
      continue;
    }
    photoMap.set(record.id, record);
    validPhotos.push(record);
  }

  const chipsByLevel = new Map<number, Map<string, PhotoChip>>();
  for (let lvl = minLevel; lvl <= maxLevel; lvl += 1) {
    chipsByLevel.set(lvl, new Map<string, PhotoChip>());
  }

  const allChips = new Map<string, PhotoChip>();
  const chipPhotoIds = new Map<string, string[]>();

  if (validPhotos.length === 0) {
    return {
      revision,
      minLevel,
      maxLevel,
      chipsByLevel,
      allChips,
      chipPhotoIds,
      photoMap,
      rootChipIds: [],
      totalValidPhotos: 0,
    };
  }

  // 1. Assign each valid photo to a finest-level cell
  const finestBuckets = new Map<string, string[]>();
  for (const photo of validPhotos) {
    const { x, y } = latLngToMercatorTileXY(photo.lat, photo.lng, maxLevel);
    const cellId = `${maxLevel}/${x}/${y}`;
    const bucket = finestBuckets.get(cellId) ?? [];
    bucket.push(photo.id);
    finestBuckets.set(cellId, bucket);
  }

  // 2. Aggregate occupied cells upward from maxLevel to minLevel
  // levelPhotos tracks photoIds per cell at the current level
  let currentLevelPhotos = finestBuckets;
  const childrenMap = new Map<string, Set<string>>(); // parentId -> childIds
  const levelPhotosMap = new Map<number, Map<string, string[]>>();
  levelPhotosMap.set(maxLevel, finestBuckets);

  for (let lvl = maxLevel; lvl > minLevel; lvl -= 1) {
    const parentLevel = lvl - 1;
    const parentLevelPhotos = new Map<string, string[]>();

    for (const [cellId, photoIds] of currentLevelPhotos.entries()) {
      const parts = cellId.split('/');
      const x = Number.parseInt(parts[1], 10);
      const y = Number.parseInt(parts[2], 10);

      const parentX = Math.floor(x / 2);
      const parentY = Math.floor(y / 2);
      const parentId = `${parentLevel}/${parentX}/${parentY}`;

      const parentList = parentLevelPhotos.get(parentId) ?? [];
      for (const id of photoIds) {
        parentList.push(id);
      }
      parentLevelPhotos.set(parentId, parentList);

      const childSet = childrenMap.get(parentId) ?? new Set<string>();
      childSet.add(cellId);
      childrenMap.set(parentId, childSet);
    }

    levelPhotosMap.set(parentLevel, parentLevelPhotos);
    currentLevelPhotos = parentLevelPhotos;
  }

  // 3. Compute counts, centroids, bounds, and deterministic representatives for each chip
  for (let lvl = minLevel; lvl <= maxLevel; lvl += 1) {
    const levelMap = chipsByLevel.get(lvl)!;
    const cellsAtLevel = levelPhotosMap.get(lvl) ?? new Map<string, string[]>();

    for (const [cellId, photoIds] of cellsAtLevel.entries()) {
      chipPhotoIds.set(cellId, photoIds);

      const parts = cellId.split('/');
      const x = Number.parseInt(parts[1], 10);
      const y = Number.parseInt(parts[2], 10);

      const parentId =
        lvl > minLevel
          ? `${lvl - 1}/${Math.floor(x / 2)}/${Math.floor(y / 2)}`
          : null;

      const rawChildIds = childrenMap.get(cellId);
      const childIds = rawChildIds ? [...rawChildIds].sort() : [];

      let sumLat = 0;
      let sumLng = 0;
      let minLat = Number.POSITIVE_INFINITY;
      let maxLat = Number.NEGATIVE_INFINITY;
      let minLng = Number.POSITIVE_INFINITY;
      let maxLng = Number.NEGATIVE_INFINITY;

      for (const photoId of photoIds) {
        const p = photoMap.get(photoId)!;
        sumLat += p.lat;
        sumLng += p.lng;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      }

      const count = photoIds.length;
      const centroidLat = sumLat / count;
      const centroidLng = sumLng / count;
      const centroidLatRad = (centroidLat * Math.PI) / 180;
      const cosLat = Math.cos(centroidLatRad);

      // Deterministic representative photo selection:
      // Minimum squared Euclidean distance to centroid in Mercator-scaled degrees,
      // with tie breaking by photo ID.
      let bestPhotoId = photoIds[0];
      let bestDistSq = Number.POSITIVE_INFINITY;

      for (const photoId of photoIds) {
        const p = photoMap.get(photoId)!;
        const dLat = p.lat - centroidLat;
        const dLng = (p.lng - centroidLng) * cosLat;
        const distSq = dLat * dLat + dLng * dLng;

        if (distSq < bestDistSq - 1e-12) {
          bestDistSq = distSq;
          bestPhotoId = photoId;
        } else if (Math.abs(distSq - bestDistSq) <= 1e-12) {
          if (photoId.localeCompare(bestPhotoId) < 0) {
            bestDistSq = distSq;
            bestPhotoId = photoId;
          }
        }
      }

      const chip: PhotoChip = {
        id: cellId,
        level: lvl,
        x,
        y,
        parentId,
        childIds,
        photoCount: count,
        representativePhotoId: bestPhotoId,
        representativeLat: centroidLat,
        representativeLng: centroidLng,
        bounds: {
          minLat,
          maxLat,
          minLng,
          maxLng,
        },
      };

      levelMap.set(cellId, chip);
      allChips.set(cellId, chip);
    }
  }

  const rootChipIds = [...(chipsByLevel.get(minLevel)?.keys() ?? [])].sort();

  return {
    revision,
    minLevel,
    maxLevel,
    chipsByLevel,
    allChips,
    chipPhotoIds,
    photoMap,
    rootChipIds,
    totalValidPhotos: validPhotos.length,
  };
}

function toDayKey(takenAt: string | null): string {
  if (!takenAt) return 'unknown-date';
  const date = new Date(takenAt);
  if (Number.isNaN(date.getTime())) return 'unknown-date';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createGeoNodeFromChip(
  chip: PhotoChip,
  photos: PhotoRecord[],
): JourneyGeoNode {
  const byDateMap = new Map<string, PhotoRecord[]>();
  for (const photo of photos) {
    const dayKey = toDayKey(photo.takenAt);
    const existing = byDateMap.get(dayKey) ?? [];
    existing.push(photo);
    byDateMap.set(dayKey, existing);
  }

  const bydate = [...byDateMap.entries()]
    .map(([key, list]) => ({
      key,
      date: list[0]?.takenAt ? new Date(list[0].takenAt) : new Date(0),
      photos: list,
    }))
    .sort((left, right) => right.date.getTime() - left.date.getTime());

  return {
    chipKey: chip.id,
    displayLabel: `${chip.representativeLat.toFixed(2)}, ${chip.representativeLng.toFixed(2)}`,
    photoCount: photos.length,
    representativeLat: chip.representativeLat,
    representativeLng: chip.representativeLng,
    photoIds: photos.map((p) => p.id),
    photos,
    bydate,
  };
}
