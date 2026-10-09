---
name: add-osm-category
description: "Add a new OpenStreetMap (OSM) vector data category to the Lancangriver stack end-to-end. Covers Overpass query fetching, PostgreSQL/PostGIS migrations, background ingest job stores and workers, MVT/GeoJSON vector API routes, and client job creation and management UI. Always starts by asking the user to clarify the category name and exact OSM tags."
argument-hint: "Specify the category name (e.g. 'names', 'pois', 'railways') and the exact OSM tags to query."
---

# Add OSM Category

## Outcome

Add a complete end-to-end vertical pipeline for a new OpenStreetMap (OSM) data category in the Lancangriver stack, enabling:
- Background asynchronous downloading and ingestion per zoom-12 tile from OSM Overpass API.
- Storage in dedicated PostGIS vector and job-tracking tables.
- Querying through GeoJSON BBox API (`/vector/<category>?bbox=...`) and Mapbox Vector Tile (MVT) PBF endpoints (`/vector/<category>/tiles/:z/:x/:y.pbf`).
- Job creation and tile status inspection in the client tile coverage UI (`jobs-create`).
- Job monitoring, paging, and retrying in the client jobs management dashboard (`jobs`).

---

## When To Use

Use this skill when:
- The user asks to add a new OSM feature layer or category (e.g., `names`, `places`, `pois`, `railways`, `landuse`, `boundaries`).
- The user wants to support downloading, ingesting, serving, and managing jobs for a new OSM category in `app/lancangriver`.

Do not use this skill when:
- The user is working on the root desktop app (`app/` Electron prototype).
- The user only wants to tweak existing rendering/styling for `buildings`, `highways`, or `waterways` without adding a new category pipeline.

---

## Required Flow

### Step 1: Mandatory User Clarification (First Action)
Every time this skill starts, **do not assume the OSM tags or category identifiers**. Always clarify:
1. **Category Name**: The singular and plural identifiers (e.g., singular `name`, plural `names`, or `railway` / `railways`). Used for table names, route prefixes, and UI labels.
2. **Exact OSM Tags and Element Types**:
   - What element types to query: `node`, `way`, `relation`, or all three (`nwr`)?
   - What exact tag filters: e.g. `["name"]`, `["place"~"city|town|village"]`, `["railway"]`, `["amenity"]`?
   - Warn the user if a broad tag like `["name"]` without element restrictions will duplicate geometries already captured by `highways`, `buildings`, or `waterways`.

### Step 2: Database Schema & Migration
1. Inspect `app/lancangriver/serve/src/sql/migrations/` to find the next sequential migration number (e.g. `007_add_<category>_ingest_tables.sql`).
2. Create the migration file defining:
   - `public.vector_features_<category>`:
     - `feature_id TEXT PRIMARY KEY`
     - `source TEXT NOT NULL DEFAULT 'osm'`
     - `feature_type TEXT NOT NULL`
     - `tags JSONB NOT NULL DEFAULT '{}'::jsonb`
     - `geom geometry(Geometry, 4326) NOT NULL`
     - `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
     - GIST index on `geom`
     - Unique index on `(source, feature_id)`
   - `public.osm_ingest_jobs_<category>`:
     - `z12_key TEXT PRIMARY KEY`
     - `status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed'))`
     - `attempt_count INTEGER NOT NULL DEFAULT 0`
     - `last_error TEXT`, `queued_at`, `started_at`, `finished_at`, `updated_at`
     - Index on `status`
3. Run the migration with `npm run migrate:db` in `app/lancangriver/serve`.

### Step 3: Backend OSM Fetcher
In `app/lancangriver/serve/src/jobs/osmFetch.js`:
1. Implement `fetchOsm<Category>FeaturesForZ12Key(z12Key, options)`:
   - Construct the Overpass query using the agreed bbox and tag filters.
   - Use `[out:json][timeout:360]; ( ... ); out body geom;`.
   - Map elements using `elements.map(toFeatureFromElement).filter(Boolean)`.
2. Add unit test coverage in `app/lancangriver/serve/test/osm.fetch.test.js`.

### Step 4: Backend Jobs Store
Create `app/lancangriver/serve/src/jobs/osm<Category>JobsStore.js` (mirroring `osmHighwayJobsStore.js`):
- `enqueueIfMissing(z12Key)`
- `getStatuses(keys)`
- `getStatus(z12Key)`
- `listLoaded({ limit, offset })`
- `listJobs({ limit, offset })` (joining `public.z12geoinfo` on `z12_key` for `display_name`)
- `rerunFailed(z12Key)`
- `claimNextQueued()`
- `markRunning(z12Key)`, `markDone(z12Key)`, `markFailed(z12Key, error)`
- Add unit tests in `app/lancangriver/serve/test/osm.<category>.jobs.store.test.js`.

### Step 5: Backend Ingest Worker
In `app/lancangriver/serve/src/jobs/osmIngestWorker.js`:
1. Export `createOsm<Category>IngestWorker({ jobs, fetchOsm<Category>Features, upsertVectorFeatures<Category>, logger })` wrapping `createVectorIngestWorker`.
2. Update tests in `app/lancangriver/serve/test/osm.ingest.worker.test.js`.

### Step 6: Database Layer & SQL Files
1. Create `app/lancangriver/serve/src/sql/vector_<category>_bbox.sql`:
   - Returns a GeoJSON `FeatureCollection` from `public.vector_features_<category>` intersecting `$1, $2, $3, $4`.
2. Create `app/lancangriver/serve/src/sql/vector_tile_mvt_<category>.sql`:
   - Returns MVT protobuf bytes using `ST_AsMVT(..., 'osm_<category>', 4096, 'geom')`.
3. In `app/lancangriver/serve/src/db.js`:
   - Load the two SQL files.
   - Export `queryVectorFeatures<Category>(bbox)`.
   - Export `getVectorTilePbf<Category>(z, x, y)`.
   - Export `upsertVectorFeatures<Category>(features)`.
   - Add `'public.vector_features_<category>'` to the table whitelist in `upsertVectorFeaturesIntoTable()`.

### Step 7: Express Routes & Server Mounting
1. In `app/lancangriver/serve/src/routes/vector.js`:
   - Add `router.get('/vector/<category>', ...)` with strict numeric bbox validation.
2. In `app/lancangriver/serve/src/server.js`:
   - Instantiate `<category>JobsStore`.
   - Mount `createVectorTilesRouter` at `routePrefix: '/vector/<category>'`.
   - In production startup (non-test), create and start `<category>Runner` with graceful shutdown on `SIGINT`/`SIGTERM`.
3. Update tests:
   - `app/lancangriver/serve/test/vector.route.test.js`
   - `app/lancangriver/serve/test/vector.tiles.route.test.js`

### Step 8: Client API Client
In `app/lancangriver/client/src/jobs/api.ts`:
1. Export `<category>CoverageApi = createCoverageApi('/vector/<category>');`.
2. Export convenience functions:
   - `enqueueCoverageJob<Category>(x, y)`
   - `fetchCoverageJobs<Category>({ limit, offset })`
   - `fetchCoverageStatus<Category>(x, y)`
   - `rerunFailedCoverageJob<Category>(x, y)`
   - `requestCoverageForTile<Category>(x, y)`
3. Update tests in `app/lancangriver/client/src/jobs/api.test.ts`.

### Step 9: Client UI Integration
1. **Jobs Dashboard (`app/lancangriver/client/src/jobs/App.tsx`)**:
   - Add `<category>` to `TabKey`.
   - Add item to `tabs` array (`{ key: '<category>', label: '<Display Label>' }`).
   - Wire `api` selector: `activeTab === '<category>' ? <category>CoverageApi : ...`.
2. **Job Creation View (`app/lancangriver/client/src/jobs-create/App.tsx`)**:
   - Add download state (e.g. `<category>DownloadStatus`).
   - Add button `"down load <category> osm"` calling `enqueueCoverageJob<Category>(tile.x, tile.y)`.
   - Add button `"<category>?"` calling `handleCheckStatus('<category>')`.

### Step 10: Validation & Testing
1. In `app/lancangriver/serve`:
   - Run tests: `npm test`
2. In `app/lancangriver/client`:
   - Run tests: `npm test`
   - Run build: `npm run build`

---

## Decision Points & Pitfalls

### 1) OSM Tag Sparsity & Geometry Types
- Nodes vs Ways vs Relations:
  - Linear features (roads, railways, streams): mostly `way` (`LineString`).
  - Area features (parks, lakes, buildings): closed `way` or `relation` (`Polygon` / `MultiPolygon`).
  - Point features (names, places, amenities): `node` (`Point`).
- Ensure downstream viewers handle the expected geometry type (e.g. Points need text billboards/labels, not ribbon extrusions).

### 2) Overpass Timeout & Complexity
- Always use standard timeouts (`[timeout:360];`) and standard coordinate ordering for Overpass (`(south,west,north,east)`). Note that `getZ12EnvelopeFromKey` produces `minLat,minLon,maxLat,maxLon`.

### 3) Whitelist Table Names
- `db.js` enforces a strict whitelist in `upsertVectorFeaturesIntoTable()`. Forgetting to add the new table name will cause ingest jobs to fail at runtime.

---

## Completion Verification

Before completing the task, verify:
- [ ] Migration executed without errors on PostGIS.
- [ ] Backend route `/vector/<category>?bbox=...` returns valid GeoJSON FeatureCollection.
- [ ] Backend route `/vector/<category>/coverage/jobs` lists coverage jobs.
- [ ] Backend route `/vector/<category>/tiles/:z/:x/:y.pbf` returns valid MVT pbf bytes or 204.
- [ ] Client `jobs` dashboard tab successfully loads and switches to the new category.
- [ ] Client `jobs-create` successfully enqueues a new tile job for the category.
- [ ] All automated tests pass: `npm test` in `serve` and `client`.
