import { useEffect, useState, type RefObject } from 'react';
import * as L from 'leaflet';

export function usePhotoMapTiles(mapRef: RefObject<L.Map | null>, enabled: boolean) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const map = mapRef.current;
    setError(false);
    setLoading(false);
    if (!map || !enabled) return;

    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      detectRetina: true,
    });
    const onLoading = () => {
      setLoading(true);
      setError(false);
    };
    const onLoad = () => setLoading(false);
    const onError = (event: L.TileErrorEvent) => {
      console.warn('Failed to load photo map OpenStreetMap tile:', event.error);
      setError(true);
    };
    tiles.on('loading', onLoading);
    tiles.on('load', onLoad);
    tiles.on('tileerror', onError);
    tiles.addTo(map);
    return () => {
      tiles.off('loading', onLoading);
      tiles.off('load', onLoad);
      tiles.off('tileerror', onError);
      tiles.remove();
    };
  }, [mapRef, enabled]);

  return { loading, error };
}
