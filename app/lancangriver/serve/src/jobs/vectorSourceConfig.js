export const VECTOR_INGEST_SOURCE_ENV = 'VECTOR_INGEST_SOURCE';
export const VECTOR_INGEST_SOURCES = ['osm', 'overture'];

export function getVectorIngestSource(env = process.env) {
  const raw = env[VECTOR_INGEST_SOURCE_ENV];
  if (!raw) {
    return 'osm';
  }

  const source = String(raw).trim().toLowerCase();
  if (VECTOR_INGEST_SOURCES.includes(source)) {
    return source;
  }

  throw new Error(
    `Invalid ${VECTOR_INGEST_SOURCE_ENV}=${raw}. Expected one of: ${VECTOR_INGEST_SOURCES.join(', ')}`,
  );
}
