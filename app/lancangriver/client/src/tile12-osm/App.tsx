import { FormEvent, useRef, useState } from 'react';

import { Button } from '@/_components';
import { BASE_URL } from '@/calc/constants.js';
import { fetchTileVector } from '@/tile12-osm/vector-tiles.js';
import { LeafletVectorViewer } from './leaflet.js';
import { parseTile12Key } from './tile.js';
import { ThreeJsTileViewer } from './ThreeJsTileViewer.js';

const DEFAULT_TILE_KEY = '12/2212/1539';

type RendererMode = 'three' | 'leaflet';

export default function App() {
  const requestGenerationRef = useRef(0);
  const [tileKey, setTileKey] = useState(resolveQueryString);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>('No tile loaded');
  const [mode, setMode] = useState<RendererMode>('leaflet');
  const [tile, setTile] = useState<ReturnType<typeof parseTile12Key>>(null);
  const [features, setFeatures] = useState<GeoJSON.Feature[]>([]);

  const loadTile = async () => {
    const tile = parseTile12Key(tileKey);
    if (!tile) {
      setError('Use a zoom-12 key with x/y between 0 and 4095');
      return;
    }

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    setLoading(true);
    setError(null);

    try {
      const key = `${tile.z}/${tile.x}/${tile.y}`;
      const [defaultTileVector, highwaysTileVector] = await Promise.all([
        fetchTileVector(`${BASE_URL}/vector/tiles-existing/${key}.pbf`, tile),
        fetchTileVector(`${BASE_URL}/vector/highways/tiles-existing/${key}.pbf`, tile),
      ]);
      if (generation !== requestGenerationRef.current) {
        return;
      }

      const defaultFeatures = defaultTileVector.layers.flatMap((layer) => layer.features);
      const highwaysFeatures = highwaysTileVector.layers.flatMap((layer) => layer.features);
      const nextFeatures = [...defaultFeatures, ...highwaysFeatures];
      setTile(tile);
      setFeatures(nextFeatures);

      const defaultFeatureCount = defaultFeatures.length;
      const highwaysFeatureCount = highwaysFeatures.length;

      const layerSummary = [
        `default: ${defaultFeatureCount}`,
        `highways: ${highwaysFeatureCount}`,
      ].join(' · ');
      setSummary(
        `${key} · ${nextFeatures.length} features${layerSummary ? ` · ${layerSummary}` : ''}`,
      );
    } catch (reason: unknown) {
      if (generation === requestGenerationRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (generation === requestGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadTile();
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-jade-foundation text-jade-text">
      <div className="absolute inset-0">
        {mode === 'three' ? (
          <ThreeJsTileViewer features={features} tile={tile} />
        ) : (
          <LeafletVectorViewer features={features} tileKey={tileKey} />
        )}
      </div>

      <section className="absolute left-3 right-3 top-3 z-1009 w-[min(28rem,calc(100%-1.5rem))] rounded-2xl border border-jade-border-soft bg-jade-panel/95 p-4 shadow-2xl shadow-[#182a36]/15 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <a
              href="/portal.html"
              target="_blank"
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-jade-river hover:text-jade-sky"
            >
              Lancangriver Portal
            </a>
            <h1 className="mt-1 text-sm font-semibold tracking-wide text-jade-text">
              Tile 12 OSM Inspector
            </h1>
            <p className="mt-1 text-xs leading-5 text-jade-text-muted">
              Inspect vector tiles and switch between 2D and 3D views.
            </p>
          </div>
          <span className="rounded-lg border border-jade-border-soft bg-jade-control px-2 py-1 text-[10px] tabular-nums text-jade-text-muted">
            {mode === 'three' ? '3D' : '2D'}
          </span>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Zoom-12 tile key</span>
            <input
              value={tileKey}
              onChange={(event) => setTileKey(event.target.value)}
              spellCheck={false}
              className="h-10 w-full rounded-lg border border-jade-border-soft bg-jade-control/70 px-3 font-[SUSEMono] text-sm text-jade-text outline-none transition-colors placeholder:text-jade-text-muted focus:border-jade-river focus:bg-jade-panel"
              aria-label="Zoom-12 tile key"
              placeholder="12/2212/1539"
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="base"
              variant={mode === 'three' ? 'primary' : 'default'}
              onClick={() => setMode('three')}
            >
              3D
            </Button>
            <Button
              type="button"
              size="base"
              variant={mode === 'leaflet' ? 'primary' : 'default'}
              onClick={() => setMode('leaflet')}
            >
              2D
            </Button>
          </div>
          <Button type="submit" size="base" variant="primary" disabled={loading}>
            {loading ? 'Loading...' : 'Load'}
          </Button>
        </form>

        <div className="mt-3 rounded-lg border border-jade-border-soft bg-jade-control/60 px-3 py-2 font-[SUSEMono] text-xs leading-5 text-jade-text-muted">
          {error ? <span className="text-jade-error">{error}</span> : summary}
        </div>
      </section>
    </main>
  );
}

const resolveQueryString = () => {
  const queryString = new URLSearchParams(location.search);
  const tileKey = queryString.get('tilekey');
  if (/^12\/\d+\/\d+$/.test(tileKey)) {
    return tileKey;
  } else {
    return DEFAULT_TILE_KEY;
  }
};
