# Vector Coverage Query Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-tile and paginated loaded-tile coverage endpoints backed by `public.osm_ingest_jobs`.

**Architecture:** Extend the existing OSM jobs store with status and paginated done-job queries. Inject the store into the vector tiles router through `createApp`, leaving SQL in the data-access layer and preserving the existing PBF route.

**Tech Stack:** Node.js ESM, Express, PostgreSQL, Vitest, Supertest

---

### Task 1: Coverage Queries In The Jobs Store

**Files:**

- Modify: `app/lancangriver/serve/test/osm.jobs.store.test.js`
- Modify: `app/lancangriver/serve/src/jobs/osmJobsStore.js`

- [ ] **Step 1: Write failing store tests**

Add tests that call `getStatus('12/3456/1523')` and expect the matching status or `null`, then call `listLoaded({ limit: 100, offset: 0 })` and expect `{ keys, total }`. Assert that list SQL filters `status = 'done'`, orders by `z12_key`, and uses parameterized limit/offset values.

- [ ] **Step 2: Run store tests and verify failure**

Run: `cd app/lancangriver/serve && npm test -- test/osm.jobs.store.test.js`

Expected: FAIL because `getStatus` and `listLoaded` do not exist.

- [ ] **Step 3: Implement minimal store methods**

Add `getStatus(z12Key)` using:

```sql
SELECT status
FROM public.osm_ingest_jobs
WHERE z12_key = $1
```

Add `listLoaded({ limit, offset })` using one query with `COUNT(*) OVER()`:

```sql
SELECT z12_key, COUNT(*) OVER()::integer AS total
FROM public.osm_ingest_jobs
WHERE status = 'done'
ORDER BY z12_key ASC
LIMIT $1 OFFSET $2
```

Return `{ keys: result.rows.map((row) => row.z12_key), total: result.rows[0]?.total ?? 0 }`.

- [ ] **Step 4: Run store tests and verify pass**

Run: `cd app/lancangriver/serve && npm test -- test/osm.jobs.store.test.js`

Expected: PASS.

### Task 2: Coverage HTTP Routes

**Files:**

- Modify: `app/lancangriver/serve/test/vector.tiles.route.test.js`
- Modify: `app/lancangriver/serve/src/routes/vectorTiles.js`
- Modify: `app/lancangriver/serve/src/server.js`

- [ ] **Step 1: Write failing route tests**

Add tests for:

```text
GET /vector/coverage/12/3456/1523
GET /vector/coverage/loaded?limit=25&offset=50
```

Assert single lookup returns `{ key, status, loaded }`, missing lookup returns `{ key, status: null, loaded: false }`, malformed coordinates return `400 INVALID_TILE_COORDS`, loaded listing returns parsed `{ key, z, x, y }` entries and pagination metadata, and malformed pagination returns `400 INVALID_PAGINATION`.

- [ ] **Step 2: Run route tests and verify failure**

Run: `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`

Expected: FAIL with 404 responses for the new routes.

- [ ] **Step 3: Inject jobs-store query methods**

In `createApp`, pass these functions to `createVectorTilesRouter`:

```js
getCoverageStatus: (key) => jobsStore.getStatus(key),
listLoadedCoverage: (pagination) => jobsStore.listLoaded(pagination)
```

Require both functions in `createVectorTilesRouter` alongside the existing dependencies.

- [ ] **Step 4: Implement route validation and responses**

Register `/vector/coverage/loaded` before `/vector/coverage/12/:x/:y`. Parse decimal integer query parameters without accepting partial numeric strings. Default `limit` to 100 and `offset` to 0; enforce `1 <= limit <= 1000` and `offset >= 0`.

For one tile, build `12/${x}/${y}`, query status, and return `loaded: status === 'done'`. For the list, parse every canonical key into numeric `z`, `x`, and `y` fields and return `{ tiles, limit, offset, total }`.

- [ ] **Step 5: Run route tests and verify pass**

Run: `cd app/lancangriver/serve && npm test -- test/vector.tiles.route.test.js`

Expected: PASS, including the existing `.pbf` tests.

### Task 3: Documentation And Service Verification

**Files:**

- Modify: `app/lancangriver/serve/README.md`

- [ ] **Step 1: Document both endpoints**

Add the single-tile and paginated-list contracts to the Vector Tile Endpoint section, including defaults, maximum limit, and the meaning of `loaded`.

- [ ] **Step 2: Run the complete service test suite**

Run: `cd app/lancangriver/serve && npm test`

Expected: all service tests PASS.

- [ ] **Step 3: Start the service for manual route validation**

Run: `cd app/lancangriver/serve && npm run dev`

Expected: service starts successfully when required local database configuration is available. Request both coverage endpoints and confirm JSON response shapes. If Postgres is unavailable, report manual validation as blocked while retaining automated test evidence.
