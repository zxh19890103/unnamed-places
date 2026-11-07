import { useEffect, useRef, useState, type RefObject } from 'react';
import * as L from 'leaflet';
import type { BBox } from '../_tile';
import {
  MAP_CATEGORIES, fetchPhotoMapLayer, getMapBboxKey, photoMapStyle, type MapCategory,
} from '../_photoMap';
import { createPhotoMapLabels } from '../_photoMapLabels';

type LayerResult = { data?: GeoJSON.FeatureCollection; error?: string };

export function usePhotoMapLayers(
  mapRef: RefObject<L.Map | null>,
  bbox: BBox | null,
  enabled: boolean,
) {
  const cacheRef = useRef(new Map<string, GeoJSON.FeatureCollection>());
  const [results, setResults] = useState<Partial<Record<MapCategory, LayerResult>>>({});
  const [retry, setRetry] = useState(0);
  const bboxKey = getMapBboxKey(bbox);

  useEffect(() => {
    const controller = new AbortController();
    setResults({});
    if (!enabled || !bboxKey) return () => controller.abort();
    for (const category of MAP_CATEGORIES) {
      const cacheKey = `${bboxKey}/${category}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setResults((previous) => ({ ...previous, [category]: { data: cached } }));
        continue;
      }
      fetchPhotoMapLayer(category, bboxKey, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          cacheRef.current.set(cacheKey, data);
          setResults((previous) => ({ ...previous, [category]: { data } }));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn(`Failed to load photo map ${category}:`, error);
          const message = error instanceof Error ? error.message : 'Map data request failed';
          setResults((previous) => ({ ...previous, [category]: { error: message } }));
        });
    }
    return () => controller.abort();
  }, [bboxKey, retry, enabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !enabled) return;
    const layers = L.layerGroup().addTo(map);
    const datasets: Array<{ category: MapCategory; data: GeoJSON.FeatureCollection }> = [];
    for (const category of MAP_CATEGORIES) {
      const data = results[category]?.data;
      if (!data) continue;
      datasets.push({ category, data });
      if (category === 'places') continue;
      L.geoJSON(data, {
        pane: `photo-map-${category}`,
        interactive: false,
        style: (feature) => photoMapStyle(category, feature),
        pointToLayer: (feature, position) => L.circleMarker(position, {
          ...photoMapStyle(category, feature),
          radius: 2,
          pane: `photo-map-${category}`,
          interactive: false,
        }),
      }).addTo(layers);
    }
    const disposeLabels = createPhotoMapLabels(map, datasets);
    return () => {
      disposeLabels();
      layers.remove();
    };
  }, [mapRef, results, enabled]);

  return {
    results,
    bboxKey,
    pending: enabled && bboxKey ? MAP_CATEGORIES.filter((category) => !results[category]).length : 0,
    failures: enabled ? MAP_CATEGORIES.filter((category) => results[category]?.error) : [],
    featureCount: MAP_CATEGORIES.reduce(
      (count, category) => count + (results[category]?.data?.features.length ?? 0), 0,
    ),
    retry: () => setRetry((value) => value + 1),
  };
}
