import https from 'node:https';
import { getZ12EnvelopeFromKey } from './tileCoverage.js';

function isClosedRing(coords) {
  if (!Array.isArray(coords) || coords.length < 4) {
    return false;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function toRingCoords(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 4) {
    return null;
  }

  const coords = geometry.map((point) => [point.lon, point.lat]);
  if (!isClosedRing(coords)) {
    return null;
  }

  return coords;
}

function toPolygonFeature({ id, tags, ring }) {
  return {
    source: 'osm',
    feature_id: id,
    feature_type: 'Polygon',
    tags,
    geometry: { type: 'Polygon', coordinates: [ring] }
  };
}

function toRelationFeature(element, id, tags) {
  const relationType = tags.type;
  const members = Array.isArray(element.members) ? element.members : [];

  const outers = [];
  const inners = [];

  for (const member of members) {
    if (member.type !== 'way') {
      continue;
    }

    const ring = toRingCoords(member.geometry);
    if (!ring) {
      continue;
    }

    if (member.role === 'inner') {
      inners.push(ring);
    } else {
      outers.push(ring);
    }
  }

  if (outers.length === 0 && Array.isArray(element.geometry)) {
    const ring = toRingCoords(element.geometry);
    if (ring) {
      return toPolygonFeature({ id, tags, ring });
    }
  }

  if (outers.length === 0) {
    return null;
  }

  if (outers.length === 1 || relationType === 'boundary') {
    return {
      source: 'osm',
      feature_id: id,
      feature_type: 'Polygon',
      tags,
      geometry: {
        type: 'Polygon',
        coordinates: [outers[0], ...inners]
      }
    };
  }

  const polygons = outers.map((outer) => [outer]);
  if (inners.length > 0) {
    polygons[0].push(...inners);
  }

  return {
    source: 'osm',
    feature_id: id,
    feature_type: 'MultiPolygon',
    tags,
    geometry: {
      type: 'MultiPolygon',
      coordinates: polygons
    }
  };
}

export function toFeatureFromElement(element) {
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

  if (element.type === 'relation') {
    return toRelationFeature(element, id, tags);
  }

  return null;
}

export async function fetchOsmFeaturesForZ12Key(z12Key, options = {}) {
  const endpoint = options.endpoint ?? process.env.OSM_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
  const { minLon, minLat, maxLon, maxLat } = getZ12EnvelopeFromKey(z12Key);

  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  console.info('Overpass query bbox:', bbox);

  const query = [
    '[out:json][timeout:360];',
    `(`,
    `  way["building"](${bbox});`,
    `  way["natural"="water"](${bbox});`,
    `  relation["building"](${bbox});`,
    `  relation["natural"="water"](${bbox});`,
    `);`,
    'out body geom;'
  ].join('\n');

  const payload = await postFormJson(endpoint, { data: query });
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];

  return elements
    .map(toFeatureFromElement)
    .filter((feature) => feature !== null);
}

function postFormJson(endpoint, formValues) {
  return new Promise((resolve, reject) => {
    const target = new URL(endpoint);
    const body = new URLSearchParams(formValues).toString();

    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          origin: "https://overpass-api.de",
          referer: "https://overpass-api.de/query_form.html",
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'content-length': Buffer.byteLength(body)
        }
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Overpass request failed: ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(rawBody));
          } catch (error) {
            reject(new Error(`Overpass response parse failed: ${error.message}`));
          }
        });
      }
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
