import { readFileSync } from 'node:fs';

const VECTOR_BBOX_SQL = readFileSync(new URL('./sql/vector_bbox.sql', import.meta.url), 'utf8');
const VECTOR_TILE_MVT_SQL = readFileSync(new URL('./sql/vector_tile_mvt.sql', import.meta.url), 'utf8');
const VECTOR_TILE_MVT_HIGHWAYS_SQL = readFileSync(new URL('./sql/vector_tile_mvt_highways.sql', import.meta.url), 'utf8');
let pool;
let poolPromise;

async function getPool() {
  if (pool) {
    return pool;
  }

  if (poolPromise) {
    return poolPromise;
  }

  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error('DATABASE_URL is required for vector queries');
  }

  poolPromise = (async () => {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString });
    return pool;
  })();

  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = undefined;
    throw error;
  }
}

function asFeatureCollection(value) {
  if (!value || typeof value !== 'object') {
    return { type: 'FeatureCollection', features: [] };
  }

  return value;
}

export async function queryVectorFeatures(bbox) {
  const activePool = await getPool();
  const result = await activePool.query(VECTOR_BBOX_SQL, bbox);
  const featureCollection = result.rows?.[0]?.feature_collection;

  if (typeof featureCollection === 'string') {
    return asFeatureCollection(JSON.parse(featureCollection));
  }

  return asFeatureCollection(featureCollection);
}

export async function dbQuery(sql, params = []) {
  const activePool = await getPool();
  return activePool.query(sql, params);
}

export async function getVectorTilePbf(z, x, y) {
  const activePool = await getPool();
  const result = await activePool.query(VECTOR_TILE_MVT_SQL, [z, x, y]);
  const pbf = result.rows?.[0]?.tile_pbf;

  if (Buffer.isBuffer(pbf)) {
    return pbf;
  }

  if (typeof pbf === 'string') {
    return Buffer.from(pbf, 'binary');
  }

  return Buffer.alloc(0);
}

export async function getVectorTilePbfHighways(z, x, y) {
  const activePool = await getPool();
  const result = await activePool.query(VECTOR_TILE_MVT_HIGHWAYS_SQL, [z, x, y]);
  const pbf = result.rows?.[0]?.tile_pbf;

  if (Buffer.isBuffer(pbf)) {
    return pbf;
  }

  if (typeof pbf === 'string') {
    return Buffer.from(pbf, 'binary');
  }

  return Buffer.alloc(0);
}

export async function upsertVectorFeatures(features) {
  return upsertVectorFeaturesIntoTable(features, 'public.vector_features');
}

export async function upsertVectorFeaturesHighways(features) {
  return upsertVectorFeaturesIntoTable(features, 'public.vector_features_highways');
}

async function upsertVectorFeaturesIntoTable(features, tableName) {
  if (!Array.isArray(features) || features.length === 0) {
    return;
  }

  if (tableName !== 'public.vector_features' && tableName !== 'public.vector_features_highways') {
    throw new Error(`Unsupported vector features table: ${tableName}`);
  }

  const activePool = await getPool();
  const client = await activePool.connect();

  try {
    await client.query('BEGIN');

    for (const feature of features) {
      const source = feature.source ?? 'osm';
      const featureId = feature.feature_id;
      const featureType = feature.feature_type;
      const tags = feature.tags ?? {};
      const geometry = feature.geometry;

      if (!featureId || !featureType || !geometry) {
        continue;
      }

      await client.query(
        `INSERT INTO ${tableName}
           (feature_id, source, feature_type, tags, geom)
         VALUES
           ($1, $2, $3, $4::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
         ON CONFLICT (feature_id)
         DO UPDATE SET
           source = EXCLUDED.source,
           feature_type = EXCLUDED.feature_type,
           tags = EXCLUDED.tags,
           geom = EXCLUDED.geom,
           updated_at = NOW()`,
        [featureId, source, featureType, JSON.stringify(tags), JSON.stringify(geometry)]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
