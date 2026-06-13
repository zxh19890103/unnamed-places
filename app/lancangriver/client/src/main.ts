import { computeRequestPlan } from "./view/request-scheduler";
import { fetchDem, fetchSatellite, fetchVector } from "./data/api";

const baseUrl = "http://localhost:4050";

async function bootstrap() {
  const plan = computeRequestPlan({
    centerLon: 100.5,
    centerLat: 22.1,
    zoom: 11,
    viewportWidthPx: 1024,
    viewportHeightPx: 768,
  });

  // Minimal startup flow for Task 5 wiring.
  const vector = await fetchVector(baseUrl, plan.vectorBbox);
  const firstTile = plan.rasterTiles[0];
  const [dem, satellite] = await Promise.all([
    fetchDem(baseUrl, firstTile),
    fetchSatellite(baseUrl, firstTile),
  ]);

  const app = document.getElementById("app");
  if (app) {
    app.textContent = `ready: vector=${Array.isArray(vector?.features) ? vector.features.length : 0} dem=${dem?.ok ? "ok" : "na"} sat=${satellite?.ok ? "ok" : "na"}`;
  }
}

void bootstrap();
