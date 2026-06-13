import { readFileSync } from 'node:fs';

const VECTOR_BBOX_SQL = readFileSync(new URL('./sql/vector_bbox.sql', import.meta.url), 'utf8');
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
