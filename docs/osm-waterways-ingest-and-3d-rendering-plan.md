# OSM Waterways Ingestion, Job Management, and 3D Rendering Plan

This plan details the end-to-end architecture and implementation steps to add full support for OpenStreetMap waterways—from database schema and background worker ingestion to job management UI and 3D scene rendering in the Lancangriver stack.

---

## 1. Database Schema & Migrations

### 1.1 Migration Script: `005_add_waters_ingest_tables.sql`
**Path**: `app/lancangriver/serve/src/sql/migrations/005_add_waters_ingest_tables.sql`

Create two dedicated tables following the existing pattern of `vector_features_highways` and `osm_ingest_jobs_highways`:

```sql
-- 1. Storage for waterway vector features
CREATE TABLE IF NOT EXISTS public.vector_features_waters (
  feature_id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'osm',
  feature_type TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vector_features_waters_geom_gix
  ON public.vector_features_waters
  USING GIST (geom);

CREATE UNIQUE INDEX IF NOT EXISTS vector_features_waters_source_feature_id_uidx
  ON public.vector_features_waters(source, feature_id);

-- 2. Tile coverage ingest jobs for water layers
CREATE TABLE IF NOT EXISTS public.osm_ingest_jobs_waters (
  z12_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS osm_ingest_jobs_waters_status_idx
  ON public.osm_ingest_jobs_waters(status);
```

---

## 2. OSM Jobs: Store, Ingest Worker & Data Access

### 2.1 Job Store: `osmWatersJobsStore.js`
**Path**: `app/lancangriver/serve/src/jobs/osmWatersJobsStore.js`
- Implements:
  - `enqueueIfMissing(z12Key)`
  - `getStatuses(keys)`
  - `getStatus(z12Key)`
  - `listLoaded({ limit, offset })`
  - `listJobs({ limit, offset })` (joining `public.z12geoinfo` for `display_name`)
  - `rerunFailed(z12Key)`
  - `claimNextJob()`
  - `markDone(z12Key)`
  - `markFailed(z12Key, error)`

### 2.2 Overpass Query for Waterways: `osmFetch.js`
**Path**: `app/lancangriver/serve/src/jobs/osmFetch.js`
- Add `fetchOsmWaterFeaturesForZ12Key(z12Key, options)`:
  ```text
  [out:json][timeout:360];
  (
    way["waterway"](bbox);
    relation["waterway"](bbox);
  );
  out body geom;
  ```
- Normalizes elements into GeoJSON `Point`, `LineString`, `Polygon`, or `MultiPolygon`.

### 2.3 Worker & Runner: `osmIngestWorker.js` & `server.js`
**Path**: `app/lancangriver/serve/src/jobs/osmIngestWorker.js`
- Implement `createOsmWaterIngestWorker({ jobs, fetchOsmWaterFeatures, upsertVectorFeaturesWaters })`.
- In `server.js`, instantiate `createWaterRunner(waterJobsStore)` to poll every 2000ms.

### 2.4 DB Layer & MVT Tile Generation: `db.js`
**Path**: `app/lancangriver/serve/src/db.js`
- `upsertVectorFeaturesWaters(features)`: Batched insert into `public.vector_features_waters`.
- `getVectorTilePbfWaters(z, x, y)`: Loads MVT tile from `src/sql/vector_tile_mvt_waters.sql`.
- `queryVectorFeaturesWaters(bbox)`: Executes `src/sql/vector_waters_bbox.sql`.

---

## 3. Jobs Management (API & UI)

### 3.1 Vector Tiles Coverage Router: `server.js`
**Path**: `app/lancangriver/serve/src/server.js`
Mount `createVectorTilesRouter` with `routePrefix: '/vector/waters'`:
- `GET /vector/waters/coverage/loaded`
- `GET /vector/waters/coverage/jobs`
- `POST /vector/waters/coverage/:z/:x/:y/enqueue`
- `POST /vector/waters/coverage/rerun`
- `GET /vector/waters/coverage/status`
- `GET /vector/waters/tiles/:z/:x/:y.pbf`
- `GET /vector/waters/tiles-existing/:z/:x/:y.pbf`

### 3.2 Client API Client: `jobs/api.ts`
**Path**: `app/lancangriver/client/src/jobs/api.ts`
- Add `layer: 'buildings' | 'highways' | 'waters'` parameter to coverage fetchers:
  - `fetchLoadedCoverage({ layer, limit, offset })`
  - `fetchCoverageJobs({ layer, limit, offset })`
  - `enqueueCoverageJob(layer, z12Key)`
  - `rerunCoverageJob(layer, z12Key)`

### 3.3 Jobs Management UI: `jobs/App.tsx` & `jobs-create/App.tsx`
**Paths**: 
- `app/lancangriver/client/src/jobs/App.tsx`
- `app/lancangriver/client/src/jobs-create/App.tsx`
- Add a Layer Switcher Segment (`Buildings`, `Roads / Highways`, `Waterways`).
- Display live job status indicators (`queued`, `running`, `done`, `failed`) with retry actions.
- Allow single-click creation and enqueueing of waterway coverage jobs for selected bounding boxes.

---

## 4. Backend GeoJSON BBox Route

### 4.1 SQL Query: `vector_waters_bbox.sql`
**Path**: `app/lancangriver/serve/src/sql/vector_waters_bbox.sql`
```sql
WITH bbox AS (
  SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS geom
),
features AS (
  SELECT
    jsonb_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(v.geom)::jsonb,
      'properties', COALESCE(to_jsonb(v) - 'geom', '{}'::jsonb)
    ) AS feature
  FROM vector_features_waters v
  JOIN bbox b ON ST_Intersects(v.geom, b.geom)
)
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
) AS feature_collection
FROM features;
```

### 4.2 Route Endpoint: `vector.js`
**Path**: `app/lancangriver/serve/src/routes/vector.js`
- Mount `GET /vector/waters?bbox=minLon,minLat,maxLon,maxLat`.
- Enforce strict numeric bbox validation, range checking (-180..180, -90..90), and standardized error payloads.

---

## 5. 3D Scene Mesh Transformation & UI Integration

### 5.1 Single-File Mesh Generator: `_waters.ts`
**Path**: `app/lancangriver/client/src/(experiments)/photoview-in-3d/_waters.ts`

1. **Tag & Width Classification**:
   - `waterway=river`: 24m width
   - `waterway=canal`: 12m width
   - `waterway=stream`: 6m width
   - `waterway=drain` / `ditch`: 4m width
   - `waterway=riverbank`: Polygon / ribbon fill
2. **Coordinate Transform**:
   - Project `[lng, lat]` coordinates relative to `worldCenterLatlng` via `latLngToMetersOffset`.
   - Place water surfaces at $y = 0.3\text{m}$ (above terrain, under roads at $y=1.0\text{m}$).
3. **Geometry Processing**:
   - **Linear waterways** (`LineString` / `MultiLineString`): Extrude continuous ribbon geometry with smooth tangents and UV flow coordinates.
   - **Area waterways** (`Polygon` / `MultiPolygon`): Triangulate 2D coordinate loops using `THREE.ShapeUtils.triangulateShape`.
4. **Materials & Draw-Call Optimization**:
   - Use water material (stylized blue `#2C6F8C` with slight transparency).
   - Merge ribbon and polygon geometries via `mergeGeometries` into single batched meshes.
5. **Lifecycle Functions**:
   - `buildWatersGroup(featureCollection, worldCenterLatlng)`
   - `disposeWatersGroup(group)`

### 5.2 3D Viewport Integration: `App.tsx`
**Path**: `app/lancangriver/client/src/(experiments)/photoview-in-3d/App.tsx`
- Maintain `watersGroupRef = useRef<THREE.Group | null>(null)`.
- Fetch `/vector/waters?bbox=...` in parallel with `/vector/highways?bbox=...`.
- Reconstruct and mount the waterway mesh group to `sceneRef.current`.
- Automatically dispose meshes when the bounding box or active tile changes.

---

## Implementation Checklist & Validation

- [ ] Run migration: `npm run migrate:db` in `app/lancangriver/serve`
- [ ] Verify backend tests: `npm test` in `app/lancangriver/serve`
- [ ] Verify client tests & build: `npm test && npm run build` in `app/lancangriver/client`
- [ ] Manual test: Check 3D photoview viewport renders both highways and waterways smoothly with no z-fighting.
