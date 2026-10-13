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

export type RoadLabelsGroup = LabelGroup;

export const DEFAULT_LABEL_ROADS = [
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
];

export const ROAD_LABEL_SCALE = DEFAULT_LABEL_SCALE;

export const DEFAULT_ROAD_LOD_CONFIG: Record<string, LabelLodConfig> = {
  motorway: {
    maxDistance: 45_000,
    fadeDistance: 10_000,
  },
  motorway_link: {
    maxDistance: 35_000,
    fadeDistance: 8_000,
  },
  trunk: {
    maxDistance: 45_000,
    fadeDistance: 10_000,
  },
  trunk_link: {
    maxDistance: 35_000,
    fadeDistance: 8_000,
  },
  primary: {
    maxDistance: 25_000,
    fadeDistance: 6_000,
  },
  primary_link: {
    maxDistance: 20_000,
    fadeDistance: 5_000,
  },
  secondary: {
    maxDistance: 15_000,
    fadeDistance: 4_000,
  },
  secondary_link: {
    maxDistance: 12_000,
    fadeDistance: 3_000,
  },
  tertiary: {
    maxDistance: 8_000,
    fadeDistance: 2_500,
  },
  tertiary_link: {
    maxDistance: 7_000,
    fadeDistance: 2_000,
  },
  residential: {
    maxDistance: 4_500,
    fadeDistance: 1_200,
  },
  unclassified: {
    maxDistance: 4_500,
    fadeDistance: 1_200,
  },
};

export const ROAD_LABEL_RANKS: Record<string, LabelCategoryStyle> = {
  motorway: {
    priority: 1,
    color: '#fb923c', // Orange
    subColor: '#ffedd5',
    fontSize: 42,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 34,
  },
  trunk: {
    priority: 1,
    color: '#f59e0b', // Amber
    subColor: '#fef3c7',
    fontSize: 42,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 34,
  },
  primary: {
    priority: 2,
    color: '#fbbf24', // Warm Gold
    subColor: '#fef9c3',
    fontSize: 36,
    subFontSize: 18,
    haloWidth: 7,
    screenHeight: 30,
  },
  secondary: {
    priority: 3,
    color: '#38bdf8', // Sky Blue
    subColor: '#e0f2fe',
    fontSize: 32,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 26,
  },
  tertiary: {
    priority: 4,
    color: '#f1f5f9', // Slate White
    subColor: '#cbd5e1',
    fontSize: 28,
    subFontSize: 15,
    haloWidth: 6,
    screenHeight: 22,
  },
  default: {
    priority: 5,
    color: '#cbd5e1',
    subColor: '#94a3b8',
    fontSize: 26,
    subFontSize: 14,
    haloWidth: 5,
    screenHeight: 20,
  },
};

export interface RoadLabelOptions {
  /**
   * Road categories allowed to have labels.
   * Defaults to major roads: motorway, trunk, primary, secondary, tertiary (and their links).
   */
  label_roads?: string[];
  labelRoads?: string[];
  elevationOffset?: number;
  viewportSize?: { value: THREE.Vector2 };
  lodConfig?: Partial<Record<string, LabelLodConfig>>;
  minDistanceBetweenSameRoadMeters?: number;
}

function getRoadTags(feature: GeoJSON.Feature): Record<string, string | undefined> {
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

function getRoadType(tags: Record<string, string | undefined>): string {
  const raw = tags.highway ?? tags.feature_type;
  if (typeof raw === 'string') {
    return raw.toLowerCase().split(';')[0].trim();
  }
  return 'unclassified';
}

function getRoadText(tags: Record<string, string | undefined>): {
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

interface RoadLabelCandidate {
  primaryText: string;
  subText: string | null;
  roadType: string;
  midpoint: [number, number];
  lengthMeters: number;
}

export function buildRoadLabelsGroup(
  featureCollection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  elevationOffset = 1.2,
  viewportUniform?: { value: THREE.Vector2 },
  options?: RoadLabelOptions,
): RoadLabelsGroup {
  const { group, sharedViewportUniform } = createLabelGroup('road-labels-group', viewportUniform);

  const allowedRoads = new Set(
    (options?.label_roads ?? options?.labelRoads ?? DEFAULT_LABEL_ROADS).map((r) =>
      r.toLowerCase().trim(),
    ),
  );

  const minDistanceSameRoad = options?.minDistanceBetweenSameRoadMeters ?? 3_500;
  const features = featureCollection.features || [];

  // 1. Filter features and collect candidates grouped by label text
  const candidatesByRoad = new Map<string, RoadLabelCandidate[]>();

  for (const feature of features) {
    if (!feature.geometry) continue;

    const tags = getRoadTags(feature);
    const roadType = getRoadType(tags);

    // Filter by allowed road classes (e.g. major roads only)
    if (!allowedRoads.has(roadType) && !allowedRoads.has(roadType.replace(/_link$/, ''))) {
      continue;
    }

    const { primaryText, subText } = getRoadText(tags);
    if (!primaryText) continue;

    const segments = extractLineSegments(feature.geometry);
    for (const segment of segments) {
      if (segment.length < 2) continue;

      const { midpoint, lengthMeters } = getSegmentMidpointAndLength(segment);
      if (lengthMeters < 30) continue; // Skip trivial micro-segments

      const roadKey = `${primaryText}::${subText ?? ''}`;
      let list = candidatesByRoad.get(roadKey);
      if (!list) {
        list = [];
        candidatesByRoad.set(roadKey, list);
      }

      list.push({
        primaryText,
        subText,
        roadType,
        midpoint,
        lengthMeters,
      });
    }
  }

  // 2. Select non-overlapping candidates for each unique road
  const selectedCandidates: RoadLabelCandidate[] = [];

  for (const [, candidates] of candidatesByRoad.entries()) {
    // Sort segments from longest to shortest to pick prominent road spans
    candidates.sort((a, b) => b.lengthMeters - a.lengthMeters);

    const placedForThisRoad: [number, number][] = [];

    for (const cand of candidates) {
      const [lng, lat] = cand.midpoint;

      // Ensure this label is far enough from other labels of the same road
      const isTooClose = placedForThisRoad.some(([pLng, pLat]) => {
        const avgLatRad = ((lat + pLat) * 0.5 * Math.PI) / 180;
        const dLng = (lng - pLng) * 111320 * Math.cos(avgLatRad);
        const dLat = (lat - pLat) * 110574;
        return Math.hypot(dLng, dLat) < minDistanceSameRoad;
      });

      if (!isTooClose) {
        placedForThisRoad.push(cand.midpoint);
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
    const terrainHeight = sampleElevationFromAtlas(demAtlas, demUv.u, demUv.v);
    const groundY = terrainHeight;

    // Resolve LOD and styling for this road category
    const baseType = cand.roadType.replace(/_link$/, '');
    const rankInfo =
      ROAD_LABEL_RANKS[cand.roadType] ??
      ROAD_LABEL_RANKS[baseType] ??
      ROAD_LABEL_RANKS.default;

    const lodSetting =
      options?.lodConfig?.[cand.roadType] ??
      DEFAULT_ROAD_LOD_CONFIG[cand.roadType] ??
      DEFAULT_ROAD_LOD_CONFIG[baseType] ??
      DEFAULT_ROAD_LOD_CONFIG.unclassified;

    const { texture, aspect, screenHeight } = createLabelSpriteTexture(
      cand.primaryText,
      cand.subText,
      rankInfo,
    );

    const sprite = createLabelSprite({
      texture,
      aspect,
      screenHeight,
      scale: ROAD_LABEL_SCALE,
      viewportUniform: sharedViewportUniform,
      lodConfig: lodSetting,
      position: new THREE.Vector3(x, groundY + elevationOffset, z),
    });

    group.add(sprite);
  }

  return group;
}

export const disposeRoadLabelsGroup = disposeLabelGroup;
