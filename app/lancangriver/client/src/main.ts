import { computeRequestPlan } from "./view/request-scheduler";
import { fetchDem, fetchSatellite, fetchVector } from "./data/api";
import { renderDiagnostics } from "./ui/diagnostics";

const baseUrl = "http://localhost:4050";

function updateApp(text: string) {
  const app = document.getElementById("app");
  if (app) {
    app.textContent = text;
  }
}

async function bootstrap() {
  const plan = computeRequestPlan({
    centerLon: 100.5,
    centerLat: 22.1,
    zoom: 11,
    viewportWidthPx: 1024,
    viewportHeightPx: 768,
  });

  updateApp(
    renderDiagnostics({
      vectorCount: 0,
      demStatus: "na",
      satelliteStatus: "na",
      tileCount: plan.rasterTiles.length,
      pendingCount: 3,
      failedCount: 0,
      lastError: "",
    }),
  );

  try {
    const vector = await fetchVector(baseUrl, plan.vectorBbox);
    const firstTile = plan.rasterTiles[0];

    const [demResult, satelliteResult] = await Promise.allSettled([
      fetchDem(baseUrl, firstTile),
      fetchSatellite(baseUrl, firstTile),
    ]);

    const demOk = demResult.status === "fulfilled" && demResult.value?.ok;
    const satelliteOk =
      satelliteResult.status === "fulfilled" && satelliteResult.value?.ok;
    const failures = [demResult, satelliteResult].filter(
      (result) => result.status === "rejected",
    ).length;
    const lastError =
      demResult.status === "rejected"
        ? String(demResult.reason)
        : satelliteResult.status === "rejected"
          ? String(satelliteResult.reason)
          : "";

    updateApp(
      renderDiagnostics({
        vectorCount: Array.isArray(vector?.features)
          ? vector.features.length
          : 0,
        demStatus: demOk ? "ok" : "na",
        satelliteStatus: satelliteOk ? "ok" : "na",
        tileCount: plan.rasterTiles.length,
        pendingCount: 0,
        failedCount: failures,
        lastError,
      }),
    );
  } catch (error) {
    updateApp(
      renderDiagnostics({
        vectorCount: 0,
        demStatus: "na",
        satelliteStatus: "na",
        tileCount: plan.rasterTiles.length,
        pendingCount: 0,
        failedCount: 1,
        lastError: String(error),
      }),
    );
  }
}

void bootstrap();
