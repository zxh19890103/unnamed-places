# Lancang River Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Milestone 1 app that preprocesses pilot-corridor data, serves vector data from PostGIS by bbox, serves DEM/imagery as raster tiles, and renders all layers in a Three.js client with viewport-driven loading.

**Architecture:** Python ingestion jobs prepare and load OSM/DEM/imagery assets. A Node.js service exposes vector bbox endpoints and raster tile endpoints locally. A Three.js web client computes viewport requests and progressively renders vectors plus raster layers with graceful fallbacks.

**Tech Stack:** Python 3.11, Node.js 22, Express, PostgreSQL/PostGIS, Three.js, Vitest, Pytest

---

## File Structure

### New and Modified Files By Responsibility

- `app/lancangriver/serve/package.json`: service dependencies and scripts
- `app/lancangriver/serve/jsconfig.json`: JS tooling config
- `app/lancangriver/serve/src/config.js`: environment and path config
- `app/lancangriver/serve/src/db.js`: PostGIS connection pool helper
- `app/lancangriver/serve/src/server.js`: Express bootstrap
- `app/lancangriver/serve/src/routes/health.js`: health route
- `app/lancangriver/serve/src/routes/vector.js`: bbox-based vector query route
- `app/lancangriver/serve/src/routes/raster.js`: DEM and imagery raster tile routes
- `app/lancangriver/serve/src/sql/vector_bbox.sql`: parameterized bbox SQL
- `app/lancangriver/serve/test/vector.route.test.js`: vector route tests
- `app/lancangriver/serve/test/raster.route.test.js`: raster route tests
- `app/lancangriver/serve/test/fixtures/`: fixture JSON/tile files

- `app/lancangriver/client/package.json`: client dependencies and scripts
- `app/lancangriver/client/index.html`: app shell
- `app/lancangriver/client/src/main.ts`: bootstrap and render loop
- `app/lancangriver/client/src/view/camera.ts`: camera + viewport state
- `app/lancangriver/client/src/view/request-scheduler.ts`: bbox/tile request scheduler
- `app/lancangriver/client/src/data/api.ts`: HTTP client for vector/raster endpoints
- `app/lancangriver/client/src/layers/vector-layer.ts`: render river/road/building geometries
- `app/lancangriver/client/src/layers/terrain-layer.ts`: DEM mesh loading and rendering
- `app/lancangriver/client/src/layers/imagery-layer.ts`: imagery texture loading
- `app/lancangriver/client/src/ui/diagnostics.ts`: dev diagnostics overlay
- `app/lancangriver/client/test/request-scheduler.test.ts`: scheduler tests

- `app/lancangriver/pipeline/requirements.txt`: Python pipeline dependencies
- `app/lancangriver/pipeline/config/pilot_corridor.json`: corridor bounds and zoom config
- `app/lancangriver/pipeline/src/common/config.py`: config loader
- `app/lancangriver/pipeline/src/common/postgis.py`: DB writer helper
- `app/lancangriver/pipeline/src/ingest/osm_ingest.py`: OSM download and normalize
- `app/lancangriver/pipeline/src/ingest/dem_ingest.py`: DEM download and preprocess
- `app/lancangriver/pipeline/src/ingest/imagery_fetch.py`: imagery cache fetcher
- `app/lancangriver/pipeline/src/manifest/write_manifest.py`: data version manifest writer
- `app/lancangriver/pipeline/tests/test_corridor_config.py`: config tests
- `app/lancangriver/pipeline/tests/test_bbox_query_shape.py`: bbox normalization tests

- `app/lancangriver/docs/runbook.md`: local run instructions
- `app/lancangriver/docs/milestone-1-checklist.md`: milestone acceptance checklist

## Task 1: Service Skeleton And Health Endpoint

**Files:**

- Create: `app/lancangriver/serve/package.json`
- Create: `app/lancangriver/serve/jsconfig.json`
- Create: `app/lancangriver/serve/src/config.js`
- Create: `app/lancangriver/serve/src/server.js`
- Create: `app/lancangriver/serve/src/routes/health.js`
- Test: `app/lancangriver/serve/test/health.route.test.js`

- [ ] **Step 1: Write the failing health route test**

```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- health.route.test.js`
Expected: FAIL with module/file not found.

- [ ] **Step 3: Write minimal service implementation**

```js
// src/routes/health.js
export function healthRoute(_req, res) {
  res.status(200).json({ status: "ok" });
}

// src/server.js
import express from "express";
import { healthRoute } from "./routes/health.js";

export function createApp() {
  const app = express();
  app.get("/health", healthRoute);
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = createApp();
  const port = Number(process.env.PORT || 4050);
  app.listen(port, () => {
    console.log(`lancangriver service listening on ${port}`);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- health.route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve
# include test file
git commit -m "feat(lancangriver): bootstrap local service and health endpoint"
```

## Task 2: PostGIS Bbox Vector Query Endpoint

**Files:**

- Create: `app/lancangriver/serve/src/db.js`
- Create: `app/lancangriver/serve/src/routes/vector.js`
- Create: `app/lancangriver/serve/src/sql/vector_bbox.sql`
- Modify: `app/lancangriver/serve/src/server.js`
- Test: `app/lancangriver/serve/test/vector.route.test.js`

- [ ] **Step 1: Write failing vector route tests**

```js
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

vi.mock("../src/db.js", () => ({
  queryVectorFeatures: vi.fn(async () => [
    {
      id: 1,
      layer: "river",
      geometry: {
        type: "LineString",
        coordinates: [
          [100, 20],
          [101, 21],
        ],
      },
      properties: {},
    },
  ]),
}));

describe("GET /vector", () => {
  it("returns feature collection for valid bbox", async () => {
    const app = createApp();
    const res = await request(app).get("/vector?bbox=100,20,101,21");
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("FeatureCollection");
    expect(res.body.features.length).toBe(1);
  });

  it("returns 400 for invalid bbox", async () => {
    const app = createApp();
    const res = await request(app).get("/vector?bbox=bad");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- vector.route.test.js`
Expected: FAIL with missing route/handler.

- [ ] **Step 3: Implement minimal bbox route and DB adapter**

```js
// src/db.js
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.LR_POSTGIS_URL });

export async function queryVectorFeatures({ minLon, minLat, maxLon, maxLat }) {
  const sql = `
    SELECT id, layer,
      ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry,
      properties
    FROM osm_features
    WHERE geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3857)
    LIMIT 5000
  `;
  const { rows } = await pool.query(sql, [minLon, minLat, maxLon, maxLat]);
  return rows;
}

// src/routes/vector.js
import { queryVectorFeatures } from "../db.js";

function parseBbox(raw) {
  const parts = (raw || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return { minLon, minLat, maxLon, maxLat };
}

export async function vectorRoute(req, res) {
  const bbox = parseBbox(req.query.bbox);
  if (!bbox) return res.status(400).json({ error: "invalid bbox" });

  const rows = await queryVectorFeatures(bbox);
  const features = rows.map((row) => ({
    type: "Feature",
    id: row.id,
    geometry: row.geometry,
    properties: { ...row.properties, layer: row.layer },
  }));

  return res.status(200).json({ type: "FeatureCollection", features });
}
```

- [ ] **Step 4: Wire route and pass tests**

```js
// src/server.js
import { vectorRoute } from "./routes/vector.js";

app.get("/vector", vectorRoute);
```

Run: `cd app/lancangriver/serve && npm test -- vector.route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src app/lancangriver/serve/test
git commit -m "feat(lancangriver): add PostGIS bbox vector query endpoint"
```

## Task 3: Raster DEM/Imagery Endpoints

**Files:**

- Create: `app/lancangriver/serve/src/routes/raster.js`
- Modify: `app/lancangriver/serve/src/server.js`
- Test: `app/lancangriver/serve/test/raster.route.test.js`
- Create: `app/lancangriver/serve/test/fixtures/tiles/dem/10/850/420.bin`
- Create: `app/lancangriver/serve/test/fixtures/tiles/img/10/850/420.jpg`

- [ ] **Step 1: Write failing raster route tests**

```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

describe("raster routes", () => {
  it("returns DEM tile or 204 nodata", async () => {
    const app = createApp();
    const res = await request(app).get("/raster/dem/10/850/420");
    expect([200, 204]).toContain(res.status);
  });

  it("returns imagery tile or 404", async () => {
    const app = createApp();
    const res = await request(app).get("/raster/img/10/850/420");
    expect([200, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd app/lancangriver/serve && npm test -- raster.route.test.js`
Expected: FAIL with missing routes.

- [ ] **Step 3: Implement raster handlers**

```js
import fs from "node:fs/promises";
import path from "node:path";

const root = process.env.LR_RASTER_ROOT || path.resolve("data/tiles");

async function sendFileIfExists(res, filePath, contentType, emptyStatus = 404) {
  try {
    const data = await fs.readFile(filePath);
    res.setHeader("Content-Type", contentType);
    return res.status(200).send(data);
  } catch {
    return res.sendStatus(emptyStatus);
  }
}

export async function demRoute(req, res) {
  const { z, x, y } = req.params;
  const filePath = path.join(root, "dem", z, x, `${y}.bin`);
  return sendFileIfExists(res, filePath, "application/octet-stream", 204);
}

export async function imageryRoute(req, res) {
  const { z, x, y } = req.params;
  const filePath = path.join(root, "img", z, x, `${y}.jpg`);
  return sendFileIfExists(res, filePath, "image/jpeg", 404);
}
```

- [ ] **Step 4: Wire endpoints and verify tests pass**

```js
// src/server.js
import { demRoute, imageryRoute } from "./routes/raster.js";

app.get("/raster/dem/:z/:x/:y", demRoute);
app.get("/raster/img/:z/:x/:y", imageryRoute);
```

Run: `cd app/lancangriver/serve && npm test -- raster.route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src app/lancangriver/serve/test
git commit -m "feat(lancangriver): add local raster tile endpoints for dem and imagery"
```

## Task 4: Pipeline Config And OSM Ingest Baseline

**Files:**

- Create: `app/lancangriver/pipeline/requirements.txt`
- Create: `app/lancangriver/pipeline/config/pilot_corridor.json`
- Create: `app/lancangriver/pipeline/src/common/config.py`
- Create: `app/lancangriver/pipeline/src/ingest/osm_ingest.py`
- Test: `app/lancangriver/pipeline/tests/test_corridor_config.py`

- [ ] **Step 1: Write failing config test**

```python
from pipeline.src.common.config import load_corridor


def test_load_corridor_has_bbox():
    cfg = load_corridor('pipeline/config/pilot_corridor.json')
    assert cfg['bbox'] == [99.0, 21.0, 101.5, 23.0]
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd app/lancangriver && pytest pipeline/tests/test_corridor_config.py -q`
Expected: FAIL with missing module/file.

- [ ] **Step 3: Implement minimal config + ingest script**

```python
# pipeline/src/common/config.py
import json
from pathlib import Path


def load_corridor(path: str) -> dict:
    p = Path(path)
    with p.open('r', encoding='utf-8') as f:
        data = json.load(f)
    bbox = data.get('bbox')
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError('bbox must contain 4 numbers')
    return data

# pipeline/src/ingest/osm_ingest.py
import argparse
import requests
from pipeline.src.common.config import load_corridor


def build_overpass_query(bbox):
    s, w, n, e = bbox[1], bbox[0], bbox[3], bbox[2]
    return f"""
    [out:json][timeout:120];
    (
      way["waterway"="river"]({s},{w},{n},{e});
      way["highway"]({s},{w},{n},{e});
      way["building"]({s},{w},{n},{e});
    );
    out geom;
    """


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()

    cfg = load_corridor(args.config)
    query = build_overpass_query(cfg['bbox'])
    res = requests.post('https://overpass-api.de/api/interpreter', data={'data': query}, timeout=180)
    res.raise_for_status()
    print(f"fetched {len(res.json().get('elements', []))} elements")


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run tests and script smoke test**

Run: `cd app/lancangriver && pytest pipeline/tests/test_corridor_config.py -q`
Expected: PASS.

Run: `cd app/lancangriver && python -m pipeline.src.ingest.osm_ingest --config pipeline/config/pilot_corridor.json`
Expected: prints fetched element count.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/pipeline
git commit -m "feat(lancangriver): add pilot corridor config and osm ingest baseline"
```

## Task 5: Three.js View-Driven Client Request Scheduler

**Files:**

- Create: `app/lancangriver/client/package.json`
- Create: `app/lancangriver/client/index.html`
- Create: `app/lancangriver/client/src/main.ts`
- Create: `app/lancangriver/client/src/view/request-scheduler.ts`
- Create: `app/lancangriver/client/src/data/api.ts`
- Create: `app/lancangriver/client/test/request-scheduler.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

```ts
import { describe, it, expect } from "vitest";
import { computeRequestPlan } from "../src/view/request-scheduler";

describe("computeRequestPlan", () => {
  it("returns bbox and raster keys for viewport", () => {
    const plan = computeRequestPlan({
      centerLon: 100.5,
      centerLat: 22.1,
      zoom: 10,
    });
    expect(plan.vectorBbox.length).toBe(4);
    expect(plan.rasterTiles.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/client && npm test -- request-scheduler.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement minimal scheduler and API client**

```ts
// src/view/request-scheduler.ts
export type ViewState = { centerLon: number; centerLat: number; zoom: number };

export function computeRequestPlan(view: ViewState) {
  const half = 0.25;
  const vectorBbox: [number, number, number, number] = [
    view.centerLon - half,
    view.centerLat - half,
    view.centerLon + half,
    view.centerLat + half,
  ];

  const z = Math.max(0, Math.floor(view.zoom));
  const x = Math.floor(((view.centerLon + 180) / 360) * (1 << z));
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((view.centerLat * Math.PI) / 180) +
          1 / Math.cos((view.centerLat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      (1 << z),
  );

  return {
    vectorBbox,
    rasterTiles: [{ z, x, y }],
  };
}

// src/data/api.ts
export async function fetchVector(
  baseUrl: string,
  bbox: [number, number, number, number],
) {
  const q = bbox.join(",");
  const res = await fetch(`${baseUrl}/vector?bbox=${q}`);
  if (!res.ok) throw new Error("vector request failed");
  return res.json();
}

export async function fetchDem(
  baseUrl: string,
  z: number,
  x: number,
  y: number,
) {
  return fetch(`${baseUrl}/raster/dem/${z}/${x}/${y}`);
}

export async function fetchImagery(
  baseUrl: string,
  z: number,
  x: number,
  y: number,
) {
  return fetch(`${baseUrl}/raster/img/${z}/${x}/${y}`);
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd app/lancangriver/client && npm test -- request-scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client
git commit -m "feat(lancangriver): add view-driven request scheduler baseline"
```

## Task 6: End-to-End Wiring And Milestone Checks

**Files:**

- Modify: `app/lancangriver/client/src/main.ts`
- Create: `app/lancangriver/client/src/ui/diagnostics.ts`
- Create: `app/lancangriver/docs/runbook.md`
- Create: `app/lancangriver/docs/milestone-1-checklist.md`

- [ ] **Step 1: Write failing smoke checklist test script**

```bash
# app/lancangriver/scripts/smoke.sh
#!/usr/bin/env bash
set -euo pipefail
curl -fsS http://localhost:4050/health >/dev/null
curl -fsS "http://localhost:4050/vector?bbox=100,22,101,23" >/dev/null
echo "smoke-ok"
```

- [ ] **Step 2: Run smoke script to confirm initial failure**

Run: `cd app/lancangriver && bash scripts/smoke.sh`
Expected: FAIL until services are running.

- [ ] **Step 3: Wire client render loop and diagnostics**

```ts
// src/main.ts (key flow)
import { computeRequestPlan } from "./view/request-scheduler";
import { fetchVector, fetchDem, fetchImagery } from "./data/api";

const baseUrl = "http://localhost:4050";

async function tick(viewState) {
  const plan = computeRequestPlan(viewState);
  const vector = await fetchVector(baseUrl, plan.vectorBbox);
  const tile = plan.rasterTiles[0];
  await Promise.all([
    fetchDem(baseUrl, tile.z, tile.x, tile.y),
    fetchImagery(baseUrl, tile.z, tile.x, tile.y),
  ]);
  // render vector/terrain/imagery with threejs scene objects
  // update diagnostics counters
}
```

- [ ] **Step 4: Run milestone verification commands**

Run: `cd app/lancangriver/serve && npm test`
Expected: PASS.

Run: `cd app/lancangriver/client && npm test`
Expected: PASS.

Run: `cd app/lancangriver && bash scripts/smoke.sh`
Expected: outputs `smoke-ok` with service running.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client app/lancangriver/docs app/lancangriver/scripts
git commit -m "feat(lancangriver): wire end-to-end local milestone 1 flow"
```

## Spec Coverage Check

- Scope and intent: covered by Tasks 4, 5, 6.
- Local API + raster endpoints + PostGIS bbox vector route: covered by Tasks 1, 2, 3.
- View-driven client behavior and progressive loading: covered by Tasks 5 and 6.
- Error handling and graceful fallbacks: covered by Tasks 2, 3, 6.
- Testing strategy (pipeline, API, viewer, smoke): covered by Tasks 1 through 6.

## Placeholder Scan

- No TODO/TBD placeholders.
- All code steps include concrete snippets.
- All test/run steps include exact commands and expected outcomes.

## Type Consistency Check

- Vector endpoint path is consistently `/vector?bbox=...`.
- Raster endpoint paths are consistently `/raster/dem/:z/:x/:y` and `/raster/img/:z/:x/:y`.
- Scheduler output uses `vectorBbox` and `rasterTiles` consistently in client tasks.
