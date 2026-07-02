# Zoom-12 OSM Ingest Jobs And Vector Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe background job pipeline that ingests OSM data by canonical zoom-12 tiles and serves z/x/y vector tile requests as .pbf using data already stored in PostGIS.

**Architecture:** The request path stays non-blocking: tile requests calculate covering zoom-12 cells, enqueue missing ingest jobs atomically, and return an empty tile until coverage is ready. A jobs manager persists states (`queued`, `running`, `done`, `failed`) in PostGIS; a worker fetches OSM bbox data, upserts canonical features, and marks coverage ready. Tile generation reads from vector_features and emits MVT pbf per requested z/x/y.

**Tech Stack:** Node.js 18, Express, PostGIS, pg, Vitest, Supertest, SQL migrations, Mapbox Vector Tile SQL via ST_AsMVT.

---

## File Structure

- Modify: `app/lancangriver/serve/src/server.js`
  - Wire new vector tile router and start/stop job runner.
- Modify: `app/lancangriver/serve/src/db.js`
  - Add DB helpers for coverage state, enqueue transitions, OSM upsert, and MVT tile query.
- Create: `app/lancangriver/serve/src/routes/vectorTiles.js`
  - Add `GET /vector/tiles/:z/:x/:y.pbf` request flow.
- Create: `app/lancangriver/serve/src/jobs/tileCoverage.js`
  - Convert requested z/x/y into covering zoom-12 tile keys and bbox envelopes.
- Create: `app/lancangriver/serve/src/jobs/osmJobsStore.js`
  - DB-backed state transitions and dedupe-safe enqueue behavior.
- Create: `app/lancangriver/serve/src/jobs/osmIngestWorker.js`
  - Background worker loop, OSM fetch, DB upsert, state updates.
- Create: `app/lancangriver/serve/src/jobs/osmFetch.js`
  - Encapsulate OSM provider fetch by bbox (injectable for tests).
- Create: `app/lancangriver/serve/src/sql/migrations/002_create_osm_ingest_jobs.sql`
  - Jobs table and indexes.
- Create: `app/lancangriver/serve/src/sql/migrations/003_add_vector_feature_identity_indexes.sql`
  - Add source identity indexes for dedupe/upsert safety.
- Create: `app/lancangriver/serve/src/sql/vector_tile_mvt.sql`
  - SQL for ST_AsMVT tile payload from vector_features.
- Modify: `app/lancangriver/serve/README.md`
  - Document endpoint behavior, async job states, and env vars.
- Create: `app/lancangriver/serve/test/tile.coverage.test.js`
  - Unit tests for z/x/y -> zoom-12 mapping.
- Create: `app/lancangriver/serve/test/osm.jobs.store.test.js`
  - Unit tests for enqueue/idempotent state updates.
- Create: `app/lancangriver/serve/test/osm.ingest.worker.test.js`
  - Worker behavior tests with mocked fetch/DB adapters.
- Create: `app/lancangriver/serve/test/vector.tiles.route.test.js`
  - Route tests for queueing, pending response, and ready pbf response.

---

### Task 1: Canonical Zoom-12 Coverage Mapping

**Files:**

- Create: `app/lancangriver/serve/src/jobs/tileCoverage.js`
- Test: `app/lancangriver/serve/test/tile.coverage.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { getCoveringZ12Tiles } from "../src/jobs/tileCoverage.js";

describe("getCoveringZ12Tiles", () => {
  it("returns exactly one z12 key for a z12 tile request", () => {
    const result = getCoveringZ12Tiles(12, 3456, 1523);
    expect(result).toEqual([{ z: 12, x: 3456, y: 1523, key: "12/3456/1523" }]);
  });

  it("returns four z12 keys for a z11 tile request", () => {
    const result = getCoveringZ12Tiles(11, 1728, 761);
    expect(result.map((t) => t.key)).toEqual([
      "12/3456/1522",
      "12/3457/1522",
      "12/3456/1523",
      "12/3457/1523",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/tile.coverage.test.js`
Expected: FAIL with module-not-found or missing export `getCoveringZ12Tiles`.

- [ ] **Step 3: Write minimal implementation**

```js
export function getCoveringZ12Tiles(z, x, y) {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error("z/x/y must be integers");
  }

  const delta = 12 - z;
  if (delta < 0) {
    const scaleDown = 2 ** -delta;
    const cx = Math.floor(x / scaleDown);
    const cy = Math.floor(y / scaleDown);
    return [{ z: 12, x: cx, y: cy, key: `12/${cx}/${cy}` }];
  }

  const scaleUp = 2 ** delta;
  const baseX = x * scaleUp;
  const baseY = y * scaleUp;
  const out = [];

  for (let dy = 0; dy < scaleUp; dy += 1) {
    for (let dx = 0; dx < scaleUp; dx += 1) {
      const tx = baseX + dx;
      const ty = baseY + dy;
      out.push({ z: 12, x: tx, y: ty, key: `12/${tx}/${ty}` });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/tile.coverage.test.js`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/jobs/tileCoverage.js app/lancangriver/serve/test/tile.coverage.test.js
git commit -m "test+feat(serve): add canonical z12 coverage mapping"
```

---

### Task 2: Add OSM Job State Persistence

**Files:**

- Create: `app/lancangriver/serve/src/sql/migrations/002_create_osm_ingest_jobs.sql`
- Create: `app/lancangriver/serve/src/jobs/osmJobsStore.js`
- Modify: `app/lancangriver/serve/src/db.js`
- Test: `app/lancangriver/serve/test/osm.jobs.store.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from "vitest";
import { createOsmJobsStore } from "../src/jobs/osmJobsStore.js";

describe("osm jobs store", () => {
  it("enqueues once and ignores duplicate key", async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValue({ rowCount: 1, rows: [{ status: "queued" }] }),
    };
    const store = createOsmJobsStore({ db });

    const first = await store.enqueueIfMissing("12/3456/1523");
    const second = await store.enqueueIfMissing("12/3456/1523");

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/osm.jobs.store.test.js`
Expected: FAIL due to missing `createOsmJobsStore`.

- [ ] **Step 3: Write minimal implementation + migration**

```sql
-- app/lancangriver/serve/src/sql/migrations/002_create_osm_ingest_jobs.sql
CREATE TABLE IF NOT EXISTS public.osm_ingest_jobs (
  z12_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS osm_ingest_jobs_status_idx
  ON public.osm_ingest_jobs(status);
```

```js
// app/lancangriver/serve/src/jobs/osmJobsStore.js
export function createOsmJobsStore({ db }) {
  return {
    async enqueueIfMissing(z12Key) {
      const result = await db.query(
        `INSERT INTO public.osm_ingest_jobs (z12_key, status)
         VALUES ($1, 'queued')
         ON CONFLICT (z12_key) DO NOTHING`,
        [z12Key],
      );

      return { enqueued: result.rowCount > 0 };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/osm.jobs.store.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/sql/migrations/002_create_osm_ingest_jobs.sql app/lancangriver/serve/src/jobs/osmJobsStore.js app/lancangriver/serve/test/osm.jobs.store.test.js
git commit -m "test+feat(serve): persist z12 osm ingest jobs"
```

---

### Task 3: Build Background OSM Ingest Worker

**Files:**

- Create: `app/lancangriver/serve/src/jobs/osmFetch.js`
- Create: `app/lancangriver/serve/src/jobs/osmIngestWorker.js`
- Modify: `app/lancangriver/serve/src/db.js`
- Create: `app/lancangriver/serve/src/sql/migrations/003_add_vector_feature_identity_indexes.sql`
- Test: `app/lancangriver/serve/test/osm.ingest.worker.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from "vitest";
import { createOsmIngestWorker } from "../src/jobs/osmIngestWorker.js";

describe("osm ingest worker", () => {
  it("transitions queued -> running -> done and upserts features", async () => {
    const jobs = {
      claimNextQueued: vi.fn().mockResolvedValue({ z12Key: "12/3456/1523" }),
      markRunning: vi.fn().mockResolvedValue(undefined),
      markDone: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const fetchOsmFeatures = vi
      .fn()
      .mockResolvedValue([
        {
          source: "osm",
          feature_id: "way/1",
          feature_type: "way",
          tags: {},
          geometryWkt: "POINT(100 20)",
        },
      ]);
    const upsertVectorFeatures = vi.fn().mockResolvedValue(undefined);

    const worker = createOsmIngestWorker({
      jobs,
      fetchOsmFeatures,
      upsertVectorFeatures,
    });
    await worker.tickOnce();

    expect(jobs.markRunning).toHaveBeenCalledWith("12/3456/1523");
    expect(upsertVectorFeatures).toHaveBeenCalledTimes(1);
    expect(jobs.markDone).toHaveBeenCalledWith("12/3456/1523");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/osm.ingest.worker.test.js`
Expected: FAIL because worker module does not exist.

- [ ] **Step 3: Write minimal implementation + index migration**

```sql
-- app/lancangriver/serve/src/sql/migrations/003_add_vector_feature_identity_indexes.sql
CREATE UNIQUE INDEX IF NOT EXISTS vector_features_source_feature_id_uidx
  ON public.vector_features(source, feature_id);
```

```js
// app/lancangriver/serve/src/jobs/osmIngestWorker.js
export function createOsmIngestWorker({
  jobs,
  fetchOsmFeatures,
  upsertVectorFeatures,
}) {
  return {
    async tickOnce() {
      const job = await jobs.claimNextQueued();
      if (!job) return false;

      await jobs.markRunning(job.z12Key);

      try {
        const features = await fetchOsmFeatures(job.z12Key);
        await upsertVectorFeatures(features);
        await jobs.markDone(job.z12Key);
      } catch (error) {
        await jobs.markFailed(job.z12Key, String(error?.message ?? error));
      }

      return true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/osm.ingest.worker.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/jobs/osmIngestWorker.js app/lancangriver/serve/test/osm.ingest.worker.test.js app/lancangriver/serve/src/sql/migrations/003_add_vector_feature_identity_indexes.sql
git commit -m "test+feat(serve): add background osm ingest worker"
```

---

### Task 4: Add MVT Query And Tile Route

**Files:**

- Create: `app/lancangriver/serve/src/sql/vector_tile_mvt.sql`
- Modify: `app/lancangriver/serve/src/db.js`
- Create: `app/lancangriver/serve/src/routes/vectorTiles.js`
- Modify: `app/lancangriver/serve/src/server.js`
- Test: `app/lancangriver/serve/test/vector.tiles.route.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

describe("GET /vector/tiles/:z/:x/:y.pbf", () => {
  it("queues missing z12 jobs and returns 204 when coverage is not ready", async () => {
    const queueMissingCoverage = vi.fn().mockResolvedValue({ allReady: false });
    const getVectorTilePbf = vi.fn();
    const app = createApp({ queueMissingCoverage, getVectorTilePbf });

    const response = await request(app).get("/vector/tiles/11/1728/761.pbf");

    expect(response.status).toBe(204);
    expect(queueMissingCoverage).toHaveBeenCalledWith(11, 1728, 761);
    expect(getVectorTilePbf).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`
Expected: FAIL because route is missing.

- [ ] **Step 3: Write minimal route + db query plumbing**

```sql
-- app/lancangriver/serve/src/sql/vector_tile_mvt.sql
WITH tile AS (
  SELECT ST_TileEnvelope($1, $2, $3) AS geom
),
features AS (
  SELECT
    feature_id,
    feature_type,
    tags,
    ST_AsMVTGeom(v.geom, tile.geom, 4096, 64, true) AS geom
  FROM public.vector_features v, tile
  WHERE v.geom && tile.geom
    AND ST_Intersects(v.geom, tile.geom)
)
SELECT ST_AsMVT(features, 'osm', 4096, 'geom') AS tile_pbf
FROM features;
```

```js
// app/lancangriver/serve/src/routes/vectorTiles.js
import { Router } from "express";

export function createVectorTilesRouter(options = {}) {
  const queueMissingCoverage = options.queueMissingCoverage;
  const getVectorTilePbf = options.getVectorTilePbf;
  const router = Router();

  router.get("/vector/tiles/:z/:x/:y.pbf", async (req, res) => {
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);

    const state = await queueMissingCoverage(z, x, y);
    if (!state.allReady) {
      res.status(204).end();
      return;
    }

    const pbf = await getVectorTilePbf(z, x, y);
    res.setHeader("Content-Type", "application/x-protobuf");
    res.status(200).send(pbf);
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/sql/vector_tile_mvt.sql app/lancangriver/serve/src/routes/vectorTiles.js app/lancangriver/serve/test/vector.tiles.route.test.js app/lancangriver/serve/src/server.js app/lancangriver/serve/src/db.js
git commit -m "test+feat(serve): add vector tile pbf endpoint"
```

---

### Task 5: Wire Coverage Queue Manager In Request Path

**Files:**

- Modify: `app/lancangriver/serve/src/server.js`
- Modify: `app/lancangriver/serve/src/db.js`
- Modify: `app/lancangriver/serve/src/jobs/osmJobsStore.js`
- Test: `app/lancangriver/serve/test/vector.tiles.route.test.js`

- [ ] **Step 1: Write failing test for partial coverage behavior**

```js
it("returns 200 tile when all covering z12 jobs are done", async () => {
  const queueMissingCoverage = vi.fn().mockResolvedValue({ allReady: true });
  const tileBuffer = Buffer.from([0x1a, 0x02, 0x08, 0x01]);
  const getVectorTilePbf = vi.fn().mockResolvedValue(tileBuffer);
  const app = createApp({ queueMissingCoverage, getVectorTilePbf });

  const response = await request(app).get("/vector/tiles/11/1728/761.pbf");

  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toMatch(/application\/x-protobuf/);
  expect(Buffer.isBuffer(response.body)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`
Expected: FAIL on response status/content.

- [ ] **Step 3: Implement queue manager function and inject into app**

```js
// app/lancangriver/serve/src/server.js (shape)
import { getCoveringZ12Tiles } from "./jobs/tileCoverage.js";

async function queueMissingCoverage(z, x, y, jobsStore) {
  const covering = getCoveringZ12Tiles(z, x, y);
  const statuses = await jobsStore.getStatuses(covering.map((t) => t.key));

  for (const tile of covering) {
    if (!statuses[tile.key]) {
      await jobsStore.enqueueIfMissing(tile.key);
    }
  }

  return { allReady: covering.every((tile) => statuses[tile.key] === "done") };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/server.js app/lancangriver/serve/src/jobs/osmJobsStore.js app/lancangriver/serve/test/vector.tiles.route.test.js
git commit -m "test+feat(serve): queue missing z12 coverage in tile request path"
```

---

### Task 6: Integration Verification, Migration Path, And Docs

**Files:**

- Modify: `app/lancangriver/serve/README.md`
- Modify: `app/lancangriver/serve/src/routes/health.js` (optional health detail if needed)
- Test: `app/lancangriver/serve/test/health.route.test.js` (if health detail added)

- [ ] **Step 1: Write failing documentation assertion test (if you enforce docs check in CI), otherwise skip to step 2**

```js
// Optional: only if repository has docs-check tests.
expect(true).toBe(true);
```

- [ ] **Step 2: Update README with exact endpoint and behavior contract**

```md
### Vector Tile Endpoint (async coverage)

- `GET /vector/tiles/:z/:x/:y.pbf`
- If required zoom-12 coverage is missing or still ingesting: `204 No Content`
- If coverage is ready: `200 application/x-protobuf` (MVT pbf)
- Missing coverage triggers background enqueue for each required `12/x/y` key
```

- [ ] **Step 3: Run service test suite and migration command**

Run: `cd app/lancangriver/serve && npm run migrate:db`
Expected: migration log includes `002_create_osm_ingest_jobs.sql` and `003_add_vector_feature_identity_indexes.sql` applied.

Run: `cd app/lancangriver/serve && npm test`
Expected: PASS for all tests including new route/job tests.

- [ ] **Step 4: Manual endpoint verification**

Run: `cd app/lancangriver/serve && npm run dev`
Expected: service starts on configured port.

Run: `curl -i http://localhost:4050/vector/tiles/11/1728/761.pbf`
Expected first call: `204 No Content` if coverage not ready.
Expected later call: `200` with `content-type: application/x-protobuf`.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/README.md app/lancangriver/serve/src/sql/migrations/002_create_osm_ingest_jobs.sql app/lancangriver/serve/src/sql/migrations/003_add_vector_feature_identity_indexes.sql app/lancangriver/serve/src/sql/vector_tile_mvt.sql app/lancangriver/serve/src/routes/vectorTiles.js app/lancangriver/serve/src/jobs app/lancangriver/serve/src/server.js app/lancangriver/serve/src/db.js app/lancangriver/serve/test
git commit -m "docs+chore(serve): finalize zoom-12 osm jobs and vector tile pipeline"
```

---

## Self-Review Checklist (Completed)

- Spec coverage: includes request-path queueing, zoom-12 canonical dedupe key, background ingest worker, PostGIS storage/upsert, and `.pbf` tile response flow.
- Placeholder scan: no `TODO`/`TBD`; each task includes explicit files, commands, expected outcomes.
- Type consistency: route and worker names are consistent (`queueMissingCoverage`, `getVectorTilePbf`, `createOsmIngestWorker`, `createOsmJobsStore`).
