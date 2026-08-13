import type { PathOptions } from "leaflet";
import { classifyPolygonFeature } from "./_polygon";

export function getLeafletFeatureStyle(feature: GeoJSON.Feature): PathOptions {
  const kind = classifyPolygonFeature(feature);

  if (kind === "building") {
    return {
      color: "#f59e0b",
      weight: 2,
      fillColor: "#f59e0b",
      fillOpacity: 0.32,
    };
  }

  if (kind === "water") {
    return {
      color: "#38bdf8",
      weight: 2,
      fillColor: "#38bdf8",
      fillOpacity: 0.3,
    };
  }

  return {
    color: "#84cc16",
    weight: 1.5,
    fillColor: "#84cc16",
    fillOpacity: 0.16,
  };
}
