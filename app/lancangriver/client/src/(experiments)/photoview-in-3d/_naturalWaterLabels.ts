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

export type NaturalWaterLodConfig = LabelLodConfig;
export type NaturalWaterLabelsGroup = LabelGroup;

export interface NaturalWaterRenderOptions {
  elevationOffset?: number;
  viewportSize?: { value: THREE.Vector2 };
  lodConfig?: Partial<Record<string, NaturalWaterLodConfig>>;
}

export const NATURAL_WATER_LABEL_SCALE = DEFAULT_LABEL_SCALE;

export const DEFAULT_NATURAL_WATER_LOD_CONFIG: Record<string, NaturalWaterLodConfig> = {
  lake: {
    maxDistance: 45_000,
    fadeDistance: 10_000,
  },
  reservoir: {
    maxDistance: 35_000,
    fadeDistance: 8_000,
  },
  basin: {
    maxDistance: 25_000,
    fadeDistance: 6_000,
  },
  pond: {
    maxDistance: 12_000,
    fadeDistance: 3_000,
  },
  spring: {
    maxDistance: 8_000,
    fadeDistance: 2_000,
  },
  drinking_water: {
    maxDistance: 6_000,
    fadeDistance: 1_500,
  },
  default: {
    maxDistance: 10_000,
    fadeDistance: 2_500,
  },
};

const NATURAL_WATER_RANKS: Record<string, LabelCategoryStyle> = {
  lake: {
    priority: 1,
    color: '#38bdf8', // Vibrant Sky Blue
    subColor: '#bae6fd',
    fontSize: 46,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 38,
  },
  reservoir: {
    priority: 2,
    color: '#06b6d4', // Cyan
    subColor: '#a5f3fc',
    fontSize: 40,
    subFontSize: 18,
    haloWidth: 7,
    screenHeight: 32,
  },
  basin: {
    priority: 3,
    color: '#2dd4bf', // Teal
    subColor: '#99f6e4',
    fontSize: 34,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 28,
  },
  pond: {
    priority: 4,
    color: '#34d399', // Emerald/Mint
    subColor: '#a7f3d0',
    fontSize: 30,
    subFontSize: 15,
    haloWidth: 6,
    screenHeight: 24,
  },
  spring: {
    priority: 4,
    color: '#67e8f9', // Light Aqua
    subColor: '#cffafe',
    fontSize: 28,
    subFontSize: 14,
    haloWidth: 5,
    screenHeight: 22,
  },
  drinking_water: {
    priority: 5,
    color: '#e0f2fe', // Soft Ice Blue
    subColor: '#bae6fd',
    fontSize: 26,
    subFontSize: 13,
    haloWidth: 5,
    screenHeight: 20,
  },
  default: {
    priority: 4,
    color: '#38bdf8',
    subColor: '#bae6fd',
    fontSize: 30,
    subFontSize: 15,
    haloWidth: 6,
    screenHeight: 24,
  },
};

function getWaterTags(feature: GeoJSON.Feature): Record<string, string | undefined> {
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

function getNaturalWaterName(tags: Record<string, string | undefined>): string | null {
  const name =
    tags['name:zh'] ||
    tags['name:zh-Hans'] ||
    tags['name:zh_pinyin'] ||
    tags['name'] ||
    tags['name:en'];

  return name ? name.trim() : null;
}

function getNaturalWaterSubName(
  tags: Record<string, string | undefined>,
  primaryName: string,
): string | null {
  const en = tags['name:en'];
  if (en && en !== primaryName) {
    return en;
  }
  const pinyin = tags['name:zh_pinyin'];
  if (pinyin && pinyin !== primaryName) {
    return pinyin;
  }
  return null;
}

function getWaterType(tags: Record<string, string | undefined>): string {
  const raw = tags.water ?? tags.natural ?? tags.amenity ?? tags.feature_type;
  if (typeof raw === 'string') {
    return raw.toLowerCase().split(';')[0].trim();
  }
  return 'default';
}

/**
 * Builds billboard label sprites for natural water features.
 * Strictly considers only Point geometries with valid names.
 */
export function buildNaturalWaterLabelsGroup(
  featureCollection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  elevationOffset = 0.5,
  viewportUniform?: { value: THREE.Vector2 },
  customLodConfig?: Partial<Record<string, NaturalWaterLodConfig>>,
): NaturalWaterLabelsGroup {
  const { group, sharedViewportUniform } = createLabelGroup(
    'natural-water-labels-group',
    viewportUniform,
  );
  const features = featureCollection.features || [];

  for (const feature of features) {
    // Strictly consider only Point geometries
    if (!feature.geometry || feature.geometry.type !== 'Point') {
      continue;
    }

    const tags = getWaterTags(feature);
    const primaryName = getNaturalWaterName(tags);
    if (!primaryName) {
      continue;
    }

    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const subName = getNaturalWaterSubName(tags, primaryName);
    const waterType = getWaterType(tags);

    // Calculate meter offset relative to worldCenterLatlng
    const { x, z } = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);

    // Sample terrain elevation from the DemAtlas DataTexture
    const demUv = demAtlas.getDemUv(lat, lng);
    const groundY = sampleElevationFromAtlas(demAtlas, demUv.u, demUv.v);

    // Resolve LOD thresholds
    const lodSetting =
      customLodConfig?.[waterType] ??
      DEFAULT_NATURAL_WATER_LOD_CONFIG[waterType] ??
      DEFAULT_NATURAL_WATER_LOD_CONFIG.default;

    const rankInfo = NATURAL_WATER_RANKS[waterType] || NATURAL_WATER_RANKS.default;

    const { texture, aspect, screenHeight } = createLabelSpriteTexture(
      primaryName,
      subName,
      rankInfo,
    );

    const sprite = createLabelSprite({
      texture,
      aspect,
      screenHeight,
      scale: NATURAL_WATER_LABEL_SCALE,
      viewportUniform: sharedViewportUniform,
      lodConfig: lodSetting,
      position: new THREE.Vector3(x, groundY + elevationOffset, z),
    });

    group.add(sprite);
  }

  return group;
}

export const disposeNaturalWaterLabelsGroup = disposeLabelGroup;
