# Lancang River Milestone 1 Design

## 1. Scope And Intent

Milestone 1 delivers a local-first, end-to-end functional viewer for a pilot corridor of the Lancang River.

Chosen constraints from brainstorming:

- First usable goal: end-to-end viewer first, data quality iterative.
- Runtime behavior: viewport-based streaming.
- Deployment for this milestone: local development only.
- Vector source of truth: PostGIS from day one.
- Performance target: functional first, no strict FPS/latency SLA yet.
- Geographic scope: pilot corridor first, then expand to full river.
- Imagery policy: Google imagery allowed only for personal local experiments, no redistribution.

Out of scope for Milestone 1:

- Full-river high-detail coverage.
- Production deployment and distributed scaling.
- Strict performance benchmarking and optimization passes.

## 2. Recommended Architecture

### 2.1 Layers

Use a three-layer architecture:

1. Data pipeline layer (Python): ingest, normalize, tile prep.
2. Serving layer (local API + raster tile endpoints): serve viewport-scoped artifacts.
3. Rendering layer (Three.js client): request and render tiles progressively by viewport/zoom.

### 2.2 Core Components

Data pipeline components:

- OSM ingestor: loads river, roads, buildings into PostGIS.
- DEM ingestor: loads SRTM source data and prepares terrain tile assets.
- Imagery fetch/cache job: fetches imagery tiles and records source metadata.

Preprocessing/index components:

- PostGIS indexing jobs: spatial indexes and query-ready schemas.
- DEM tile pyramid generation: z/x/y aligned terrain tiles.

Runtime serving components:

- Vector query API endpoint(s): return river/roads/buildings features intersecting requested bbox.
- DEM tile endpoint(s): return terrain tiles keyed by z/x/y.
- Imagery endpoint/cache: return imagery tiles with source attribution metadata.

Viewer components:

- View scheduler: computes vector query bbox and raster tile keys from camera state.
- Layer renderers: river, roads, buildings, terrain, imagery.
- Cache manager: client LRU cache for bbox query responses and raster tile reuse.
- Diagnostics overlay (dev mode): pending/failed tile counters and latest errors.

### 2.3 Responsibilities And Boundaries

- PostGIS is canonical vector geodata storage and query backend.
- Viewer does not query raw large geometries directly per frame.
- Runtime consumes vector bbox-query endpoints and raster tile endpoints.
- Python jobs own expensive transforms and refresh workflows.
- Viewer owns frame-time-sensitive orchestration and graceful degradation.

## 3. Data Model And Storage Conventions

### 3.1 Shared Tile Key Convention

Use a single z/x/y tile key convention across raster runtime layers:

- DEM tiles
- Imagery tiles

This guarantees terrain-imagery alignment and simplifies raster request scheduling.

### 3.2 Vector Storage

- Store normalized OSM-derived features in PostGIS tables by thematic layer.
- Maintain geometry indexes suitable for fast bbox intersection queries.
- Add metadata fields for source revision and ingest timestamp.

### 3.3 DEM Storage

- Store source DEM assets and generated tile artifacts in disk-backed structure.
- Keep DEM tile key naming consistent with vector and imagery keys.
- Include nodata handling metadata per tile.

### 3.4 Imagery Storage

- Store cached imagery tiles on disk with source and fetch-time metadata.
- Mark legal status in metadata for local experimental use only.
- Do not include redistribution workflows in this milestone.

## 4. Data Flow And Streaming

### 4.1 Offline/Batch Flow

1. Ingest pilot-corridor data (OSM + DEM + imagery references).
2. Normalize coordinate systems and feature schemas.
3. Build serving indexes and raster artifacts.
4. Publish vector bbox-query and raster tile endpoints over local runtime service.

### 4.2 Runtime Viewport Streaming Flow

On camera move/zoom:

1. Compute current viewport bbox and required raster tile keys for current zoom.
2. Diff against loaded and pending vector query windows and raster tiles.
3. Request missing data with priority:
   - viewport center first,
   - near periphery second.
4. Render progressively:

- current bbox vector set first,
- then refine raster detail as higher zoom tiles arrive.

### 4.3 Client And Server Caching

Client cache:

- Layer-scoped bounded LRU in memory.
- Cache bbox-query responses by normalized bbox key for short-term reuse during panning.
- Keep parent raster tile visible while child raster tile loads.

Server cache:

- Cache headers for reusable tile responses.
- Optional disk cache for expensive dynamic generation.

### 4.4 Staleness And Consistency Handling

- Attach request epoch/version metadata to tile responses.
- Viewer drops stale responses when camera state has advanced.
- Include bbox or tile bounds and source revision in response metadata for debugging.

### 4.5 Streaming River Data Strategy

River geometry is served through viewport-dependent bbox queries to PostGIS, not as a monolithic geometry payload. This provides:

- bounded memory usage,
- predictable network payloads,
- natural streaming behavior during navigation.

## 5. Error Handling And Reliability

### 5.1 Pipeline Errors

- Structured logs with tile keys and source references.
- Retry transient fetch failures with capped exponential backoff.
- Persist failed tile manifests for targeted reruns.
- Continue partial progress when non-critical tiles fail.

### 5.2 Serving Errors

- Return structured error payloads with bbox or z/x/y and reason.
- Fallback behavior:
  - vector query returns no features: return empty feature collection,
  - DEM missing: return nodata terrain tile.

### 5.3 Viewer Errors

Per-layer graceful degradation:

- imagery failure: keep terrain and vectors.
- DEM failure: use flat surface plus vectors.
- vector sublayer failure: continue rendering other available layers.

Dev diagnostics:

- failed request count,
- pending request count,
- latest error summary.

## 6. Testing Strategy

### 6.1 Pipeline Tests

- Unit tests for tile key math and coordinate transforms.
- Integration test on a small fixture area validating expected artifacts/counts.

### 6.2 API Tests

- Contract tests for vector bbox-query and DEM/imagery endpoints.
- Spatial correctness checks for bbox filtering and raster key mapping.

### 6.3 Viewer Tests

- Unit tests for viewport-to-tile selection and eviction logic.
- Smoke rendering test validating incremental tile loading behavior.

### 6.4 End-To-End Milestone Check

Run a scripted camera path over pilot corridor and verify:

- no fatal client crash,
- progressive tile loading is visible,
- each enabled layer can appear when data is available.

## 7. Milestone 1 Acceptance Criteria

Milestone 1 is complete when all conditions below are met:

1. Local viewer starts and supports interactive navigation of pilot corridor.
2. Viewport-driven streaming works for vector, terrain, and imagery layers.
3. River, roads, and buildings can be rendered from PostGIS-backed bbox querying.
4. DEM-backed terrain can be rendered from aligned DEM tiles.
5. Imagery layer can load for local experimental use and is tagged with source metadata.
6. Data gaps/failures are observable and traceable by tile key, without hard crashes.

No strict FPS/latency SLA is required in this milestone.

## 8. Implementation Notes And Sequence (High Level)

1. Define pilot corridor bounds and zoom range.
2. Implement minimal ingest and normalized storage path.
3. Stand up vector bbox-query endpoint and DEM/imagery tile endpoints.
4. Implement viewer tile scheduler and per-layer renderers.
5. Add caching, fallback rendering, and diagnostics overlay.
6. Validate with fixture tests and end-to-end pilot traversal.
7. Expand corridor coverage after milestone validation.

## 9. Risks And Mitigations

- Risk: PostGIS query hotspots during rapid navigation.
  Mitigation: strict spatial indexing, query simplification, and short-term bbox response caching.

- Risk: DEM and imagery misalignment.
  Mitigation: strict shared z/x/y convention and alignment tests.

- Risk: Incomplete source tiles causing visual artifacts.
  Mitigation: deterministic fallback behavior and failed-tile manifests.

- Risk: Future legal confusion around imagery usage.
  Mitigation: explicit metadata and milestone-level policy restriction to personal local experiments.
