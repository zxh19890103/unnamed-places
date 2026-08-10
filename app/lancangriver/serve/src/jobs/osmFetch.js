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
  const startedAt = Date.now();
  const logger = options.logger ?? console;
  const postJson = options.postFormJson ?? postFormJson;
  const endpoint = options.endpoint ?? process.env.OSM_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
  const { minLon, minLat, maxLon, maxLat } = getZ12EnvelopeFromKey(z12Key);

  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  if (typeof logger?.info === 'function') {
    logger.info(`[overpass] start ${z12Key} endpoint=${endpoint} bbox=${bbox}`);
  }

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

  const payload = await postJson(endpoint, { data: query }, { logger, label: z12Key });
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const features = elements
    .map(toFeatureFromElement)
    .filter((feature) => feature !== null);

  if (typeof logger?.info === 'function') {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    logger.info(
      `[overpass] done ${z12Key} elements=${elements.length} features=${features.length} elapsed=${elapsedSeconds}s`
    );
  }

  return features;
}

export async function fetchOsmHighwayFeaturesForZ12Key(z12Key, options = {}) {
  const startedAt = Date.now();
  const logger = options.logger ?? console;
  const postJson = options.postFormJson ?? postFormJson;
  const endpoint = options.endpoint ?? process.env.OSM_OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter';
  const { minLon, minLat, maxLon, maxLat } = getZ12EnvelopeFromKey(z12Key);

  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  if (typeof logger?.info === 'function') {
    logger.info(`[overpass-highways] start ${z12Key} endpoint=${endpoint} bbox=${bbox}`);
  }

  const query = [
    '[out:json][timeout:360];',
    `(`,
    `  way["highway"](${bbox});`,
    `  relation["highway"](${bbox});`,
    `);`,
    'out body geom;'
  ].join('\n');

  const payload = await postJson(endpoint, { data: query }, { logger, label: `highways:${z12Key}` });
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const features = elements
    .map(toFeatureFromElement)
    .filter((feature) => feature !== null);

  if (typeof logger?.info === 'function') {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    logger.info(
      `[overpass-highways] done ${z12Key} elements=${elements.length} features=${features.length} elapsed=${elapsedSeconds}s`
    );
  }

  return features;
}

function postFormJson(endpoint, formValues, options = {}) {
  const logger = options.logger ?? console;
  const label = options.label ?? 'request';
  const requestTimeoutMs = options.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const target = new URL(endpoint);
    const body = new URLSearchParams(formValues).toString();
    let settled = false;
    let progressTimer = null;

    const settleReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      reject(error);
    };

    const settleResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      resolve(value);
    };

    if (typeof logger?.info === 'function') {
      logger.info(`[overpass] request ${label} post ${target.origin}${target.pathname}`);
    }

    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        timeout: requestTimeoutMs,
        headers: {
          origin: "https://overpass-api.de",
          referer: "https://overpass-api.de/query_form.html",
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'content-length': Buffer.byteLength(body)
        }
      },
      (response) => {
        let dataSize = 0;

        const chunks = [];

        progressTimer = setInterval(() => {
          const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

          if (dataSize === 0 && elapsedSeconds > 120) {
            response.destroy(new Error(`Overpass response timed out: no data received after ${elapsedSeconds}s (label=${label}, endpoint=${target.origin}${target.pathname})`));
            return;
          }

          if (typeof logger?.info === 'function') {
            logger.info(`[overpass] waiting ${label} status=${response.statusCode ?? 'pending'} elapsed=${elapsedSeconds}s data=${dataSize} bytes`);
          }
        }, 15000);

        response.on('data', (chunk) => {
          chunks.push(chunk);
          dataSize += chunk.length;
        });

        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

          if (typeof logger?.info === 'function') {
            logger.info(
              `[overpass] response ${label} status=${response.statusCode} bytes=${rawBody.length} elapsed=${elapsedSeconds}s`
            );
          }

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            settleReject(new Error(`Overpass request failed: ${response.statusCode}`));
            return;
          }

          try {
            settleResolve(JSON.parse(rawBody));
          } catch (error) {
            settleReject(new Error(`Overpass response parse failed: ${error.message}`));
          }
        });

        response.on('error', (err) => {
          settleReject(new Error(`Overpass response error: ${err.message}`));
        });
      }
    );

    request.on('error', (error) => {
      if (typeof logger?.warn === 'function') {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        logger.warn(`[overpass] request error ${label} elapsed=${elapsedSeconds}s reason=${String(error?.message ?? error)}`);
      }

      settleReject(error);
    });

    request.on('timeout', () => {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      const timeoutError = new Error(
        `Overpass request timed out after ${elapsedSeconds}s (label=${label}, endpoint=${target.origin}${target.pathname}, timeoutMs=${requestTimeoutMs})`
      );

      if (typeof logger?.warn === 'function') {
        logger.warn(
          `[overpass] request timeout ${label} elapsed=${elapsedSeconds}s timeoutMs=${requestTimeoutMs}`
        );
      }

      request.destroy(timeoutError);
      settleReject(timeoutError);
    });

    request.write(body);
    request.end();
  });
}
