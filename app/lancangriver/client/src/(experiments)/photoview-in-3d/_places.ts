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

export type PlaceLodConfig = LabelLodConfig;
export type PlacesGroup = LabelGroup;

export interface PlaceRenderOptions {
  elevationOffset?: number;
  viewportSize?: { value: THREE.Vector2 };
  lodConfig?: Partial<Record<string, PlaceLodConfig>>;
}

/**
 * Global scale multiplier for place label sprites on screen.
 * Increase to scale all place badges up proportionally (e.g. 1.5, 2.0).
 */
export const PLACE_LABEL_SCALE = DEFAULT_LABEL_SCALE;

/**
 * Configurable Level of Detail (LOD) distance thresholds (in meters) per place category.
 * - maxDistance: Distance from camera where the label is completely culled / invisible.
 * - fadeDistance: Distance buffer over which the label smoothly fades out (from 1.0 to 0.0 opacity).
 */
export const DEFAULT_PLACE_LOD_CONFIG: Record<string, PlaceLodConfig> = {
  city: {
    maxDistance: 60_000,
    fadeDistance: 15_000,
  },
  town: {
    maxDistance: 25_000,
    fadeDistance: 6_000,
  },
  suburb: {
    maxDistance: 25_000,
    fadeDistance: 6_000,
  },
  village: {
    maxDistance: 12_000,
    fadeDistance: 3_000,
  },
  hamlet: {
    maxDistance: 7_000,
    fadeDistance: 2_000,
  },
  neighbourhood: {
    maxDistance: 7_000,
    fadeDistance: 2_000,
  },
  locality: {
    maxDistance: 5_500,
    fadeDistance: 1_500,
  },
  isolated_dwelling: {
    maxDistance: 4_500,
    fadeDistance: 1_200,
  },
};

type PlaceCategoryStyle = LabelCategoryStyle;

const PLACE_RANKS: Record<string, PlaceCategoryStyle> = {
  city: {
    priority: 1,
    color: '#ffdd00', // Vibrant Gold
    subColor: '#fff3a8',
    fontSize: 54,
    subFontSize: 24,
    haloWidth: 10,
    screenHeight: 44,
  },
  town: {
    priority: 2,
    color: '#38bdf8', // Sky Blue
    subColor: '#bae6fd',
    fontSize: 44,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 36,
  },
  suburb: {
    priority: 2,
    color: '#fb923c', // Orange
    subColor: '#fed7aa',
    fontSize: 44,
    subFontSize: 20,
    haloWidth: 8,
    screenHeight: 36,
  },
  village: {
    priority: 3,
    color: '#4ade80', // Mint/Emerald Green
    subColor: '#bbf7d0',
    fontSize: 38,
    subFontSize: 18,
    haloWidth: 7,
    screenHeight: 30,
  },
  hamlet: {
    priority: 4,
    color: '#facc15', // Warm Ochre
    subColor: '#fef08a',
    fontSize: 32,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 26,
  },
  neighbourhood: {
    priority: 4,
    color: '#f472b6', // Rose
    subColor: '#fbcfe8',
    fontSize: 32,
    subFontSize: 16,
    haloWidth: 6,
    screenHeight: 26,
  },
  locality: {
    priority: 5,
    color: '#f1f5f9', // Clean White / Light Slate
    subColor: '#cbd5e1',
    fontSize: 28,
    subFontSize: 15,
    haloWidth: 6,
    screenHeight: 22,
  },
  isolated_dwelling: {
    priority: 5,
    color: '#cbd5e1', // Muted Slate
    subColor: '#94a3b8',
    fontSize: 26,
    subFontSize: 14,
    haloWidth: 5,
    screenHeight: 20,
  },
};

function getPlaceName(tags: Record<string, string | undefined>): string {
  return (
    tags['name:zh'] ||
    tags['name:zh-Hans'] ||
    tags['name:zh_pinyin'] ||
    tags['name'] ||
    tags['name:en'] ||
    'Place'
  );
}

function getPlaceSubName(tags: Record<string, string | undefined>): string | null {
  const primary = getPlaceName(tags);
  const en = tags['name:en'];
  if (en && en !== primary) {
    return en;
  }
  const pinyin = tags['name:zh_pinyin'];
  if (pinyin && pinyin !== primary) {
    return pinyin;
  }
  return null;
}

export function buildPlacesGroup(
  featureCollection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  elevationOffset = 0.5,
  viewportUniform?: { value: THREE.Vector2 },
  customLodConfig?: Partial<Record<string, PlaceLodConfig>>,
): PlacesGroup {
  const { group, sharedViewportUniform } = createLabelGroup('places-group', viewportUniform);
  const features = featureCollection.features || [];

  for (const feature of features) {
    if (!feature.geometry || feature.geometry.type !== 'Point') {
      continue;
    }

    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const tags = (feature.properties?.tags || feature.properties || {}) as Record<
      string,
      string | undefined
    >;
    const placeType = tags.place || 'locality';
    const primaryName = getPlaceName(tags);
    const subName = getPlaceSubName(tags);

    // Calculate meter offset relative to worldCenterLatlng
    const { x, z } = latLngToMetersOffset(lat, lng, worldCenterLatlng.lat, worldCenterLatlng.lng);

    // Sample terrain elevation from the DemAtlas DataTexture
    const demUv = demAtlas.getDemUv(lat, lng);
    const terrainHeight = sampleElevationFromAtlas(demAtlas, demUv.u, demUv.v);
    const groundY = terrainHeight;

    // Resolve LOD thresholds for this place category
    const lodSetting =
      customLodConfig?.[placeType] ??
      DEFAULT_PLACE_LOD_CONFIG[placeType] ??
      DEFAULT_PLACE_LOD_CONFIG.locality;

    const rankInfo = PLACE_RANKS[placeType] || PLACE_RANKS.locality;

    // Constant Screen-Size Billboard Sprite with integrated tether and ground anchor
    const { texture, aspect, screenHeight } = createLabelSpriteTexture(
      primaryName,
      subName,
      rankInfo,
    );

    const sprite = createLabelSprite({
      texture,
      aspect,
      screenHeight,
      scale: PLACE_LABEL_SCALE,
      viewportUniform: sharedViewportUniform,
      lodConfig: lodSetting,
      position: new THREE.Vector3(x, groundY + elevationOffset, z),
    });

    group.add(sprite);
  }

  return group;
}

export const disposePlacesGroup = disposeLabelGroup;

