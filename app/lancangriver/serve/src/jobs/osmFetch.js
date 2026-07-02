import { getZ12EnvelopeFromKey } from './tileCoverage.js';

function isClosedRing(coords) {
  if (!Array.isArray(coords) || coords.length < 4) {
    return false;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function toFeatureFromElement(element) {
  const id = `${element.type}/${element.id}`;
  const tags = element.tags ?? {};

  if (element.type === 'node' && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return {
      source: 'osm',
      feature_id: id,
      feature_type: 'Point',
      tags,
      geometry: { type: 'Point', coordinates: [element.lon, element.lat] }
    };
  }

  if (element.type === 'way' && Array.isArray(element.geometry) && element.geometry.length >= 2) {
    const coords = element.geometry.map((point) => [point.lon, point.lat]);

    if (isClosedRing(coords)) {
      return {
        source: 'osm',
        feature_id: id,
        feature_type: 'Polygon',
        tags,
        geometry: { type: 'Polygon', coordinates: [coords] }
      };
    }

    return {
      source: 'osm',
      feature_id: id,
      feature_type: 'LineString',
      tags,
      geometry: { type: 'LineString', coordinates: coords }
    };
  }

  return null;
}

export async function fetchOsmFeaturesForZ12Key(z12Key, options = {}) {
  const endpoint = options.endpoint ?? process.env.OSM_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
  const { minLon, minLat, maxLon, maxLat } = getZ12EnvelopeFromKey(z12Key);

  const query = [
    '[out:json][timeout:25];',
    `(`,
    `  node(${minLat},${minLon},${maxLat},${maxLon});`,
    `  way(${minLat},${minLon},${maxLat},${maxLon});`,
    `  relation(${minLat},${minLon},${maxLat},${maxLon});`,
    `);`,
    'out body geom;'
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: new URLSearchParams({ data: query })
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status}`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];

  return elements
    .map(toFeatureFromElement)
    .filter((feature) => feature !== null);
}
