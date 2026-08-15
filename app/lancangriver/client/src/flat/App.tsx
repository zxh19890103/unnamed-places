import { LeafletMap } from "./map.js";
import { MapIntroCard } from "./MapIntroCard.js";
import {
  readInitialCenterFromSearch,
  FLAT_CENTER_CONFIRMED,
} from "./protocol.js";
import { fetchTileVector } from "../osm/tiles.js";
import { tileBounds4326 } from "../calc/mercator.js";
import { useMemo, useState } from "react";
import type { LatLng } from "../calc/types.js";

export default function LeafletApp() {
  const initialCenter = useMemo(
    () =>
      readInitialCenterFromSearch(window.location.search) ?? {
        lat: 22.6273,
        lng: 120.3014,
      },
    [],
  );
  const [selectedCenter, setSelectedCenter] = useState<LatLng>(initialCenter);
  const [tilePbfStatus, setTilePbfStatus] = useState<string | null>(null);
  const [tileFeatures, setTileFeatures] = useState<GeoJSON.Feature[]>([]);
  const [mapFocusCenter, setMapFocusCenter] = useState<LatLng | null>(null);

  const confirmCenter = () => {
    window.parent.postMessage(
      {
        type: FLAT_CENTER_CONFIRMED,
        payload: selectedCenter,
      },
      window.location.origin,
    );
  };

  const testTilePbfFetch = async () => {
    const tile = { z: 12, x: 3456, y: 1523 };
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    const url = `http://localhost:4050/vector/tiles/${key}.pbf`;

    setTilePbfStatus(`requesting ${key} ...`);

    try {
      const tileVector = await fetchTileVector(url, tile);
      const features = tileVector.layers.flatMap((layer) => layer.features);
      const layerSummary = tileVector.layers
        .map((layer) => `${layer.name}:${layer.features.length}`)
        .join(", ");

      const [west, south, east, north] = tileBounds4326(tile.z, tile.x, tile.y);
      const tileCenter = {
        lat: (south + north) / 2,
        lng: (west + east) / 2,
      };

      setTileFeatures(features);
      setMapFocusCenter(tileCenter);
      setSelectedCenter(tileCenter);

      setTilePbfStatus(
        `${key}: ${features.length} features rendered, ${tileVector.layers.length} layers decoded${layerSummary ? ` (${layerSummary})` : ""}`,
      );

      console.info("[tile-pbf-test]", {
        key,
        coords: tileVector.coords,
        layers: tileVector.layers.map((layer) => ({
          name: layer.name,
          featureCount: layer.features.length,
          firstFeatureType: layer.features[0]?.geometry?.type ?? null,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTilePbfStatus(`${key}: request failed - ${message}`);
      console.error("[tile-pbf-test]", key, error);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <LeafletMap
        initialCenter={initialCenter}
        onCenterChange={setSelectedCenter}
        focusCenter={mapFocusCenter}
        focusZoom={12}
        features={tileFeatures}
      />
      <MapIntroCard />
      <div className="absolute bottom-4 right-4 z-500 rounded-xl bg-slate-950/80 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
        <div className="font-semibold tracking-wide text-slate-100">
          Confirm center
        </div>
        <div className="mt-1 text-slate-300">
          {selectedCenter.lat.toFixed(5)}, {selectedCenter.lng.toFixed(5)}
        </div>
        <div className=" flex-col flex gap-2">
          <button
            type="button"
            onClick={confirmCenter}
            className="mt-3 rounded-lg bg-sky-500 px-3 py-2 font-medium text-slate-950 transition-colors hover:bg-sky-400"
          >
            Use this center
          </button>
          <button
            type="button"
            onClick={testTilePbfFetch}
            className="mt-3 rounded-lg bg-sky-500 px-3 py-2 font-medium text-slate-950 transition-colors hover:bg-sky-400"
          >
            test tile pbf
          </button>
          {tilePbfStatus ? (
            <div className="mt-3 max-w-xs rounded-lg bg-slate-900/80 p-3 text-xs leading-5 text-slate-200">
              {tilePbfStatus}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
