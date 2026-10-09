import * as THREE from 'three';
import { latLngToMetersOffset, LatLng } from './_fns';
import { DemAtlas } from './_demAtlas';

export interface PlaceRenderOptions {
  elevationOffset?: number;
}

const PLACE_RANKS: Record<
  string,
  { priority: number; label: string; color: string; badgeColor: string }
> = {
  city: { priority: 1, label: 'City', color: '#ffcc00', badgeColor: 'rgba(255, 204, 0, 0.25)' },
  town: { priority: 2, label: 'Town', color: '#66d9ef', badgeColor: 'rgba(102, 217, 239, 0.25)' },
  village: {
    priority: 3,
    label: 'Village',
    color: '#a6e22e',
    badgeColor: 'rgba(166, 226, 46, 0.25)',
  },
  hamlet: {
    priority: 4,
    label: 'Hamlet',
    color: '#e6db74',
    badgeColor: 'rgba(230, 219, 116, 0.2)',
  },
  locality: {
    priority: 5,
    label: 'Locality',
    color: '#ffffff',
    badgeColor: 'rgba(255, 255, 255, 0.15)',
  },
  suburb: { priority: 6, label: 'Suburb', color: '#fd971f', badgeColor: 'rgba(253, 151, 31, 0.2)' },
  neighbourhood: {
    priority: 7,
    label: 'Neighbourhood',
    color: '#fd971f',
    badgeColor: 'rgba(253, 151, 31, 0.2)',
  },
  isolated_dwelling: {
    priority: 8,
    label: 'Dwelling',
    color: '#cccccc',
    badgeColor: 'rgba(200, 200, 200, 0.15)',
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

function createPlaceSpriteTexture(
  primaryText: string,
  subText: string | null,
  placeType: string,
): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const width = 512;
  const height = 160;
  canvas.width = width;
  canvas.height = height;

  if (ctx) {
    ctx.clearRect(0, 0, width, height);

    const rankInfo = PLACE_RANKS[placeType] || PLACE_RANKS.locality;

    // Background pill/card
    const radius = 24;
    const paddingX = 24;
    const paddingY = 16;
    const cardWidth = width - paddingX * 2;
    const cardHeight = height - paddingY * 2;
    const startX = paddingX;
    const startY = paddingY;

    // Draw rounded background card
    ctx.fillStyle = 'rgba(12, 24, 33, 0.82)';
    ctx.strokeStyle = rankInfo.color;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.roundRect(startX, startY, cardWidth, cardHeight, radius);
    ctx.fill();
    ctx.stroke();

    // Type indicator dot
    ctx.fillStyle = rankInfo.color;
    ctx.beginPath();
    ctx.arc(startX + 36, startY + cardHeight / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Primary Text
    ctx.fillStyle = '#ffffff';
    ctx.font =
      'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = subText ? 'bottom' : 'middle';
    const textX = startX + 64;
    const textY = subText ? startY + cardHeight / 2 + 6 : startY + cardHeight / 2;
    ctx.fillText(primaryText, textX, textY, cardWidth - 90);

    // Subtitle Text (English / Pinyin)
    if (subText) {
      ctx.fillStyle = '#9cb3c9';
      ctx.font =
        '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SUSEMono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(subText, textX, startY + cardHeight / 2 + 10, cardWidth - 90);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { texture, aspect: width / height };
}

function sampleElevationFromAtlas(demAtlas: DemAtlas, u: number, v: number): number {
  const clampedU = Math.min(1, Math.max(0, u));
  const clampedV = Math.min(1, Math.max(0, v));

  const x = Math.min(demAtlas.atlasWidth - 1, Math.floor(clampedU * demAtlas.atlasWidth));
  const y = Math.min(demAtlas.atlasHeight - 1, Math.floor(clampedV * demAtlas.atlasHeight));
  const index = y * demAtlas.atlasWidth + x;

  const rawElevation = demAtlas.atlasData[index];
  if (Number.isFinite(rawElevation) && rawElevation > -500 && rawElevation < 9000) {
    return rawElevation - demAtlas.demMedian;
  }
  return 0;
}

export function buildPlacesGroup(
  featureCollection: GeoJSON.FeatureCollection,
  worldCenterLatlng: LatLng,
  demAtlas: DemAtlas,
  elevationOffset = 30,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'places-group';

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

    const pinHeight = elevationOffset;
    const groundY = terrainHeight;
    const labelY = groundY + pinHeight;

    // 1. Vertical tether line from ground to label
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, groundY, z),
      new THREE.Vector3(x, labelY, z),
    ]);

    const rankColor = PLACE_RANKS[placeType]?.color || '#ffffff';
    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(rankColor),
      transparent: true,
      opacity: 0.65,
    });
    const tetherLine = new THREE.Line(lineGeometry, lineMaterial);
    group.add(tetherLine);

    // 2. Ground anchor point
    const dotGeometry = new THREE.SphereGeometry(1.8, 8, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(rankColor),
    });
    const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
    dotMesh.position.set(x, groundY, z);
    group.add(dotMesh);

    // 3. Billboard Sprite Label
    const { texture, aspect } = createPlaceSpriteTexture(primaryName, subName, placeType);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    const spriteHeight = 200;
    const spriteWidth = spriteHeight * aspect;

    sprite.position.set(x, labelY + spriteHeight * 0.45, z);
    sprite.scale.set(spriteWidth, spriteHeight, 1);
    group.add(sprite);
  }

  return group;
}

export function disposePlacesGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat.dispose());
      } else {
        object.material?.dispose();
      }
    } else if (object instanceof THREE.Sprite) {
      object.geometry?.dispose();
      if (object.material.map) {
        object.material.map.dispose();
      }
      object.material.dispose();
    }
  });
  group.clear();
}
