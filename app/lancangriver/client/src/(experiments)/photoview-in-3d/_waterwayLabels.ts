import * as THREE from 'three';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';
import {
  type LabelLodConfig,
  type LabelCategoryStyle,
  type LabelGroup,
  DEFAULT_LABEL_SCALE,
  createLabelSpriteTexture,
  createLabelSprite,
  createLabelGroup,
  sampleElevationFromAtlas,
  disposeLabelGroup,
} from './_labels';

export type WaterwayLabelsGroup = LabelGroup;

export const DEFAULT_LABEL_WATERWAYS = [
  'river',
  'canal',
  'stream',
  'drain',
  'ditch',
  'tidal_channel',
  'brook',
];

export const WATERWAY_LABEL_SCALE = DEFAULT_LABEL_SCALE;

export const DEFAULT_WATERWAY_LOD_CONFIG: Record<string, LabelLodConfig> = {
  river: {
    maxDistance: 50_000,
    fadeDistance: 12_000,
  },
  canal: {
    maxDistance: 35_000,
    fadeDistance: 8_000,
  },
  tidal_channel: {
    maxDistance: 30_000,
    fadeDistance: 7_000,
  },
  stream: {
    maxDistance: 15_000,
    fadeDistance: 4_000,
  },
  brook: {
    maxDistance: 10_000,
    fadeDistance: 2_500,
  },
  drain: {
    maxDistance: 6_000,
    fadeDistance: 1_500,
  },
  ditch: {
    maxDistance: 5_000,
    fadeDistance: 1_200,
  },
  default: {
    maxDistance: 12_000,
    fadeDistance: 3_000,
  },
};

export const WATERWAY_LABEL_RANKS: Record<string, LabelCategoryStyle> = {
  river: {
    priority: 1,
    color: '#38bdf8', // Bright Cyan/Sky Blue
    subColor: '#bae6fd',
    fontSize: 44,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 36,
  },
  canal: {
    priority: 2,
    color: '#22d3ee', // Cyan
    subColor: '#a5f3fc',
    fontSize: 38,
    subFontSize: 18,
    haloWidth: 7,
    screenHeight: 30,
  },
  tidal_channel: {
    priority: 2,
    color: '#06b6d4', // Deep Cyan
    subColor: '#cffafe',
    fontSize: 36,
    subFontSize: 17,
    haloWidth: 7,
    screenHeight: 28,
  },
  stream: {
    priority: 3,
    color: '#2dd4bf', // Teal
    subColor: '#99f6e4',
    fontSize: 32,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 26,
  },
  brook: {
    priority: 3,
    color: '#34d399', // Mint
    subColor: '#a7f3d0',
    fontSize: 28,
    subFontSize: 14,
    haloWidth: 5,
    screenHeight: 22,
  },
  drain: {
    priority: 4,
    color: '#94a3b8', // Muted Slate
    subColor: '#cbd5e1',
    fontSize: 24,
    subFontSize: 12,
    haloWidth: 5,
    screenHeight: 18,
  },
  ditch: {
    priority: 4,
    color: '#94a3b8',
    subColor: '#cbd5e1',
    fontSize: 22,
    subFontSize: 12,
    haloWidth: 4,
    screenHeight: 18,
  },
  default: {
    priority: 3,
    color: '#38bdf8',
    subColor: '#bae6fd',
    fontSize: 30,
    subFontSize: 15,
    haloWidth: 6,
    screenHeight: 24,
  },
};

export interface WaterwayLabelOptions {
  label_waterways?: string[];
  labelWaterways?: string[];
  elevationOffset?: number;
  viewportSize?: { value: THREE.Vector2 };
  lodConfig?: Partial<Record<string, LabelLodConfig>>;
  minDistanceBetweenSameWaterwayMeters?: number;
}

function getWaterwayTags(feature: GeoJSON.Feature): Record<string, string | undefined> {
  const props = feature.properties || {};
  let tags: Record<string, any> = {};
  if (typeof props.tags === 'object' && props.tags !== null) {
    tags = { ...props.tags };
  } else if (typeof props.tags === 'string') {
    try {
      tags = JSON.parse(props.tags);
    } catch {
      // ignore
    }
  }
  return { ...props, ...tags };
}

function getWaterwayType(tags: Record<string, string | undefined>): string {
  const raw = tags.waterway ?? tags.feature_type;
  if (typeof raw === 'string') {
    return raw.toLowerCase().split(';')[0].trim();
  }
  return 'default';
}

function getWaterwayText(tags: Record<string, string | undefined>): {
  primaryText: string | null;
  subText: string | null;
} {
  const name =
    tags['name:zh'] ||
    tags['name:zh-Hans'] ||
    tags['name:zh_pinyin'] ||
    tags['name'] ||
    tags['name:en'];

  const ref = tags['ref'];

  if (name) {
    let sub = ref || tags['name:en'] || null;
    if (sub === name) {
      sub = null;
    }
    return {
      primaryText: name,
      subText: sub,
    };
  }

  if (ref) {
    return {
      primaryText: ref,
      subText: null,
    };
  }

  return { primaryText: null, subText: null };
}

function extractLineSegments(geom: GeoJSON.Geometry): GeoJSON.Position[][] {
  if (geom.type === 'LineString') {
    return [(geom as GeoJSON.LineString).coordinates];
  }
  if (geom.type === 'MultiLineString') {
    return (geom as GeoJSON.MultiLineString).coordinates;
  }
  return [];
}

function getSegmentMidpointAndLength(coords: GeoJSON.Position[]): {
  midpoint: [number, number]; // [lng, lat]
  lengthMeters: number;
} {
  if (coords.length === 0) {
    return { midpoint: [0, 0], lengthMeters: 0 };
  }
  if (coords.length === 1) {
    return { midpoint: [coords[0][0], coords[0][1]], lengthMeters: 0 };
  }

  const dists: number[] = [];
  let totalDist = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const avgLatRad = ((lat1 + lat2) * 0.5 * Math.PI) / 180;
    const dLng = (lng2 - lng1) * 111320 * Math.cos(avgLatRad);
    const dLat = (lat2 - lat1) * 110574;
    const d = Math.hypot(dLng, dLat);
    dists.push(d);
    totalDist += d;
  }

  const halfDist = totalDist * 0.5;
  let accumulated = 0;
  for (let i = 0; i < dists.length; i += 1) {
    if (accumulated + dists[i] >= halfDist) {
      const remain = halfDist - accumulated;
      const ratio = dists[i] > 0 ? remain / dists[i] : 0;
      const lng = coords[i][0] + (coords[i + 1][0] - coords[i][0]) * ratio;
      const lat = coords[i][1] + (coords[i + 1][1] - coords[i][1]) * ratio;
      return { midpoint: [lng, lat], lengthMeters: totalDist };
    }
    accumulated += dists[i];
  }

  const last = coords[coords.length - 1];
  return { midpoint: [last[0], last[1]], lengthMeters: totalDist };
}

interface WaterwayLabelCandidate {
  primaryText: string;
  subText: string | null;
  waterwayType: string;
  midpoint: [number, number];
  lengthMeters: number;
}

export function buildWaterwayLabelsGroup(
  featureCollection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  elevationOffset = 0.8,
  viewportUniform?: { value: THREE.Vector2 },
  options?: WaterwayLabelOptions,
): WaterwayLabelsGroup {
  const { group, sharedViewportUniform } = createLabelGroup(
    'waterway-labels-group',
    viewportUniform,
  );

  const allowedWaterways = new Set(
    (options?.label_waterways ?? options?.labelWaterways ?? DEFAULT_LABEL_WATERWAYS).map((w) =>
      w.toLowerCase().trim(),
    ),
  );

  const minDistanceSameWaterway = options?.minDistanceBetweenSameWaterwayMeters ?? 4_000;
  const features = featureCollection.features || [];

  // 1. Filter features and collect candidates grouped by label text
  const candidatesByWaterway = new Map<string, WaterwayLabelCandidate[]>();

  for (const feature of features) {
    if (!feature.geometry) continue;

    const tags = getWaterwayTags(feature);
    const waterwayType = getWaterwayType(tags);

    // Filter by allowed waterway classes
    if (!allowedWaterways.has(waterwayType)) {
      continue;
    }

    const { primaryText, subText } = getWaterwayText(tags);
    if (!primaryText) continue;

    const segments = extractLineSegments(feature.geometry);
    for (const segment of segments) {
      if (segment.length < 2) continue;

      const { midpoint, lengthMeters } = getSegmentMidpointAndLength(segment);
      if (lengthMeters < 30) continue; // Skip trivial micro-segments

      const waterwayKey = `${primaryText}::${subText ?? ''}`;
      let list = candidatesByWaterway.get(waterwayKey);
      if (!list) {
        list = [];
        candidatesByWaterway.set(waterwayKey, list);
      }

      list.push({
        primaryText,
        subText,
        waterwayType,
        midpoint,
        lengthMeters,
      });
    }
  }

  // 2. Select non-overlapping candidates for each unique waterway
  const selectedCandidates: WaterwayLabelCandidate[] = [];

  for (const [, candidates] of candidatesByWaterway.entries()) {
    // Sort segments from longest to shortest to pick prominent waterway spans
    candidates.sort((a, b) => b.lengthMeters - a.lengthMeters);

    const placedForThisWaterway: [number, number][] = [];

    for (const cand of candidates) {
      const [lng, lat] = cand.midpoint;

      // Ensure this label is far enough from other labels of the same waterway
      const isTooClose = placedForThisWaterway.some(([pLng, pLat]) => {
        const avgLatRad = ((lat + pLat) * 0.5 * Math.PI) / 180;
        const dLng = (lng - pLng) * 111320 * Math.cos(avgLatRad);
        const dLat = (lat - pLat) * 110574;
        return Math.hypot(dLng, dLat) < minDistanceSameWaterway;
      });

      if (!isTooClose) {
        placedForThisWaterway.push(cand.midpoint);
        selectedCandidates.push(cand);
      }
    }
  }

  // 3. Create sprites for selected candidates
  for (const cand of selectedCandidates) {
    const [lng, lat] = cand.midpoint;

    // Calculate meter offset relative to worldCenterLatlng
    const { x, z } = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);

    // Sample terrain elevation from the DemAtlas DataTexture
    const demUv = demAtlas.getDemUv(lat, lng);
    const groundY = sampleElevationFromAtlas(demAtlas, demUv.u, demUv.v);

    const rankInfo =
      WATERWAY_LABEL_RANKS[cand.waterwayType] ?? WATERWAY_LABEL_RANKS.default;

    const lodSetting =
      options?.lodConfig?.[cand.waterwayType] ??
      DEFAULT_WATERWAY_LOD_CONFIG[cand.waterwayType] ??
      DEFAULT_WATERWAY_LOD_CONFIG.default;

    const { texture, aspect, screenHeight } = createLabelSpriteTexture(
      cand.primaryText,
      cand.subText,
      rankInfo,
    );

    const sprite = createLabelSprite({
      texture,
      aspect,
      screenHeight,
      scale: WATERWAY_LABEL_SCALE,
      viewportUniform: sharedViewportUniform,
      lodConfig: lodSetting,
      position: new THREE.Vector3(x, groundY + elevationOffset, z),
    });

    group.add(sprite);
  }

  return group;
}

export const disposeWaterwayLabelsGroup = disposeLabelGroup;
