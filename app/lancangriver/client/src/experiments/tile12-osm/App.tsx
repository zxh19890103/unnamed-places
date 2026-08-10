import { FormEvent, useEffect, useRef, useState } from "react";

import { BASE_URL } from "../../calc/constants";
import { fetchTileVector } from "../../osm/tiles";
import { LeafletVectorViewer } from "./leaflet";
import { parseTile12Key } from "./tile";
import { ThreeJsTileViewer } from "./ThreeJsTileViewer";

const DEFAULT_TILE_KEY = "12/2212/1539";

type RendererMode = "three" | "leaflet";

export default function App() {
  const requestGenerationRef = useRef(0);
  const [tileKey, setTileKey] = useState(resolveQueryString);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>("No tile loaded");
  const [mode, setMode] = useState<RendererMode>("leaflet");
  const [tile, setTile] = useState<ReturnType<typeof parseTile12Key>>(null);
  const [features, setFeatures] = useState<GeoJSON.Feature[]>([]);

  const loadTile = async () => {
    const tile = parseTile12Key(tileKey);
    if (!tile) {
      setError("Use a zoom-12 key with x/y between 0 and 4095");
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
        fetchTileVector(
          `${BASE_URL}/vector/highways/tiles-existing/${key}.pbf`,
          tile,
        ),
      ]);
      if (generation !== requestGenerationRef.current) {
        return;
      }

      const defaultFeatures = defaultTileVector.layers.flatMap(
        (layer) => layer.features,
      );
      const highwaysFeatures = highwaysTileVector.layers.flatMap(
        (layer) => layer.features,
      );
      const nextFeatures = [...defaultFeatures, ...highwaysFeatures];
      setTile(tile);
      setFeatures(nextFeatures);

      const defaultFeatureCount = defaultFeatures.length;
      const highwaysFeatureCount = highwaysFeatures.length;

      const layerSummary = [
        `default: ${defaultFeatureCount}`,
        `highways: ${highwaysFeatureCount}`,
      ].join(" · ");
      setSummary(
        `${key} · ${nextFeatures.length} features${layerSummary ? ` · ${layerSummary}` : ""}`,
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
    <main className="relative h-screen w-screen overflow-hidden bg-[#09110f] text-slate-100">
      <div className="absolute inset-0">
        {mode === "three" ? (
          <ThreeJsTileViewer features={features} tile={tile} />
        ) : (
          <LeafletVectorViewer features={features} tileKey={tileKey} />
        )}
      </div>

      <section className="absolute left-3 right-3 top-3 z-1009 border border-emerald-200/20 bg-slate-950/88 p-4 shadow-2xl backdrop-blur-md sm:right-auto sm:w-110">
        <a
          href="/portal.html"
          target="_blank"
          className="text-xs font-semibold uppercase text-emerald-300 hover:text-emerald-200"
        >
          Lancangriver Portal
        </a>
        <h1 className="mt-1 text-xl font-semibold">Tile 12 OSM Inspector</h1>

        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Zoom-12 tile key</span>
            <input
              value={tileKey}
              onChange={(event) => setTileKey(event.target.value)}
              spellCheck={false}
              className="h-10 w-full border border-slate-600 bg-slate-900 px-3 font-mono text-sm text-slate-100 outline-none focus:border-emerald-400"
              aria-label="Zoom-12 tile key"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("three")}
              className={`h-10 border px-3 text-sm font-semibold ${mode === "three" ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-100 hover:border-emerald-400"}`}
            >
              3D
            </button>
            <button
              type="button"
              onClick={() => setMode("leaflet")}
              className={`h-10 border px-3 text-sm font-semibold ${mode === "leaflet" ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-100 hover:border-emerald-400"}`}
            >
              2D
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-10 border border-emerald-400 bg-emerald-400 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? "Loading" : "Load"}
          </button>
        </form>

        <div className="mt-3 wrap-break-word font-mono text-xs leading-5 text-slate-300">
          {error ? <span className="text-rose-300">{error}</span> : summary}
        </div>
      </section>
    </main>
  );
}

const resolveQueryString = () => {
  const queryString = new URLSearchParams(location.search);
  const tileKey = queryString.get("tilekey");
  if (/^12\/\d+\/\d+$/.test(tileKey)) {
    return tileKey;
  } else {
    return DEFAULT_TILE_KEY;
  }
};
