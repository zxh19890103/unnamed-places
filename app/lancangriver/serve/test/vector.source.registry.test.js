import { describe, expect, it, vi } from 'vitest';

import { createVectorSourceRegistry } from '../src/jobs/vectorSourceRegistry.js';

describe('vector source registry', () => {
  it('returns osm fetcher for osm source', () => {
    const osmFetcher = vi.fn();
    const overtureFetcher = vi.fn();
    const registry = createVectorSourceRegistry({
      fetchOsmFeaturesForZ12Key: osmFetcher,
      fetchOvertureFeaturesForZ12Key: overtureFetcher,
    });

    expect(registry.getFetcherForSource('osm')).toBe(osmFetcher);
  });

  it('returns overture fetcher for overture source', () => {
    const osmFetcher = vi.fn();
    const overtureFetcher = vi.fn();
    const registry = createVectorSourceRegistry({
      fetchOsmFeaturesForZ12Key: osmFetcher,
      fetchOvertureFeaturesForZ12Key: overtureFetcher,
    });

    expect(registry.getFetcherForSource('overture')).toBe(overtureFetcher);
  });

  it('throws for unknown source names', () => {
    const registry = createVectorSourceRegistry({
      fetchOsmFeaturesForZ12Key: vi.fn(),
      fetchOvertureFeaturesForZ12Key: vi.fn(),
    });

    expect(() => registry.getFetcherForSource('unknown')).toThrow(
      'Unsupported vector ingest source: unknown',
    );
  });
});
