import crypto from 'node:crypto';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFeatureId(rawFeature, fallbackIndex) {
  const rawId = rawFeature.id ?? rawFeature?.properties?.id;
  if (rawId !== undefined && rawId !== null && String(rawId).trim().length > 0) {
    return `overture/${String(rawId)}`;
  }

  const digest = crypto
    .createHash('sha1')
    .update(JSON.stringify(rawFeature))
    .digest('hex')
    .slice(0, 16);
  return `overture/generated-${fallbackIndex}-${digest}`;
}

function normalizeGeometryType(type) {
  if (type === 'Point' || type === 'LineString' || type === 'Polygon' || type === 'MultiPolygon') {
    return type;
  }

  return null;
}

export function normalizeOvertureFeatures(rawFeatures) {
  const features = Array.isArray(rawFeatures) ? rawFeatures : [];

  return features
    .map((rawFeature, index) => {
      if (!isObject(rawFeature) || rawFeature.type !== 'Feature') {
        return null;
      }

      const geometry = rawFeature.geometry;
      if (!isObject(geometry) || typeof geometry.type !== 'string') {
        return null;
      }

      const featureType = normalizeGeometryType(geometry.type);
      if (!featureType) {
        return null;
      }

      const tags = isObject(rawFeature.properties) ? rawFeature.properties : {};

      return {
        source: 'overture',
        feature_id: toFeatureId(rawFeature, index),
        feature_type: featureType,
        tags,
        geometry
      };
    })
    .filter((feature) => feature !== null);
}
