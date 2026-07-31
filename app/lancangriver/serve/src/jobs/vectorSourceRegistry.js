import { fetchOsmFeaturesForZ12Key } from './osmFetch.js';
import { fetchOvertureFeaturesForZ12Key } from './overtureFetch.js';

export function createVectorSourceRegistry(options = {}) {
  const osmFetcher = options.fetchOsmFeaturesForZ12Key ?? fetchOsmFeaturesForZ12Key;
  const overtureFetcher = options.fetchOvertureFeaturesForZ12Key ?? fetchOvertureFeaturesForZ12Key;

  return {
    getFetcherForSource(source) {
      if (source === 'osm') {
        return osmFetcher;
      }

      if (source === 'overture') {
        return overtureFetcher;
      }

      throw new Error(`Unsupported vector ingest source: ${source}`);
    }
  };
}

export function createVectorFeatureFetcher(source, options = {}) {
  const registry = createVectorSourceRegistry(options);
  return registry.getFetcherForSource(source);
}
