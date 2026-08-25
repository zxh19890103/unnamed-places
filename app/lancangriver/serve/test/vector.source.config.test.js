import { describe, expect, it } from 'vitest';

import {
  getVectorIngestSource,
  VECTOR_INGEST_SOURCE_ENV,
  VECTOR_INGEST_SOURCES,
} from '../src/jobs/vectorSourceConfig.js';

describe('vector source config', () => {
  it('defaults to osm when env var is missing', () => {
    const source = getVectorIngestSource({});
    expect(source).toBe('osm');
  });

  it('accepts overture as active source', () => {
    const source = getVectorIngestSource({ [VECTOR_INGEST_SOURCE_ENV]: 'overture' });
    expect(source).toBe('overture');
  });

  it('throws for unsupported source values', () => {
    expect(() => getVectorIngestSource({ [VECTOR_INGEST_SOURCE_ENV]: 'foo' })).toThrow(
      `Invalid ${VECTOR_INGEST_SOURCE_ENV}=foo. Expected one of: ${VECTOR_INGEST_SOURCES.join(', ')}`,
    );
  });
});
