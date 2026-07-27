# Overture Service Ingest Design

**Goal:** Add Overture Maps as a second, selectable service-side ingest source for vector coverage jobs, alongside the existing Overpass-backed OSM source, without changing the vector tile endpoint contract or the `public.vector_features` storage model.

**Scope:** This design applies only to the active Lancangriver service ingest path under `app/lancangriver/serve`. It explicitly excludes the legacy corridor pipeline under `app/lancangriver/pipeline`.

## Problem Statement

The current vector coverage worker depends on live Overpass queries for every missing canonical z12 coverage tile. That path is fragile for production-style usage because it is slow, often fails, and couples availability of the vector tile endpoint to the health of a public OSM query service.

The service already has the right high-level mechanics:

- a deterministic z12 coverage model in `src/jobs/tileCoverage.js`
- a job queue in `src/jobs/osmJobsStore.js`
- a worker loop in `src/jobs/osmIngestWorker.js`
- a single normalized storage target in `public.vector_features`
- a vector tile endpoint that returns `204` while coverage is missing and `200` once ingestion is complete

The missing capability is source selection inside the fetch stage. The system needs to support two sources:

- `osm`: current Overpass-backed OSM fetch
- `overture`: new Overture-backed fetch for the same z12 coverage jobs

## Success Criteria

The first version is successful when all of the following are true:

1. The active ingest source is controlled by one global setting, `VECTOR_INGEST_SOURCE=osm|overture`.
2. Existing service behavior is preserved when `VECTOR_INGEST_SOURCE=osm`.
3. The background worker can ingest a z12 key from Overture when `VECTOR_INGEST_SOURCE=overture`.
4. Both sources normalize into the existing `upsertVectorFeatures()` contract and write into the same `public.vector_features` table.
5. The vector tile route continues to use the existing queue-and-wait behavior with no client API changes.
6. The first Overture version matches current feature scope only: buildings and water-equivalent polygons.

## Non-Goals

This design does not include:

- replacing the legacy corridor ingest pipeline
- adding per-job source overrides
- automatic fallback from Overture to OSM on failure
- expanding feature scope to places, transportation, or labels
- redesigning the `public.vector_features` schema into source-specific tables
- changing the tile coverage math or vector tile endpoint contract

## Recommended Approach

Use a narrow source-adapter boundary inside the existing worker path.

The queue, worker, storage, and tile-serving logic remain in place. The only new abstraction is:

"Fetch normalized vector features for one canonical z12 key."

This is the smallest viable change because it isolates source differences to one boundary while preserving everything downstream:

- coverage logic still produces z12 job keys
- queue still tracks ingest state
- worker still claims jobs and marks running/done/failed
- DB layer still upserts normalized features
- vector tile endpoint still waits for `done` coverage

Alternative designs were considered and rejected:

- separate pipelines per source: too much duplication for a two-source problem
- generic ingest framework: premature for current scope

## Architecture

### Current Flow

Today the active service path is wired directly to OSM:

- `src/server.js` creates the default worker and passes `fetchOsmFeaturesForZ12Key`
- `scripts/osm-ingest-job.js` also imports `fetchOsmFeaturesForZ12Key` directly
- `src/jobs/osmIngestWorker.js` assumes a single injected OSM fetch function

That direct wiring is what prevents source selection.

### Target Flow

The target flow keeps the same control plane but inserts a source resolver:

1. Tile request arrives at `GET /vector/tiles/:z/:x/:y.pbf`.
2. Missing z12 coverage tiles are queued exactly as they are today.
3. Worker claims a queued z12 key.
4. Worker resolves the active source from `VECTOR_INGEST_SOURCE`.
5. Worker calls the selected source fetcher for that z12 key.
6. Fetcher returns normalized features using the same local feature shape.
7. DB layer upserts those features into `public.vector_features`.
8. Job is marked `done` or `failed`.

The only new decision point is step 4.

### Source Boundary

The source interface should stay minimal. The worker should depend on a function with the effective shape:

```js
async function fetchFeaturesForZ12Key(z12Key) {
  return [
    {
      source: "osm" | "overture",
      feature_id: "string",
      feature_type: "Point" | "LineString" | "Polygon" | "MultiPolygon",
      tags: {},
      geometry: { type: "Polygon", coordinates: [] },
    },
  ];
}
```

The worker should not know anything about:

- Overpass query syntax
- Overture cloud release paths
- bbox export tools
- schema differences between data sources

Those belong inside the source-specific fetch modules.

## File Boundaries

### Existing Files to Modify

- `app/lancangriver/serve/src/server.js`
  - replace direct OSM fetch wiring with source-aware runner construction
- `app/lancangriver/serve/src/jobs/osmIngestWorker.js`
  - rename or generalize the injected fetch dependency so it no longer implies OSM-only behavior
- `app/lancangriver/serve/scripts/osm-ingest-job.js`
  - route one-shot job execution through the same source selector used by the service worker
- `app/lancangriver/serve/README.md`
  - document the new env var and runtime dependency expectations

### Existing Files to Preserve Largely As-Is

- `app/lancangriver/serve/src/jobs/tileCoverage.js`
  - coverage model is already correct for source-independent queueing
- `app/lancangriver/serve/src/jobs/osmJobsStore.js`
  - current queue schema is sufficient for a global source switch
- `app/lancangriver/serve/src/db.js`
  - `upsertVectorFeatures()` already supports a `source` field and can remain the single persistence path

### New Files to Add

- `app/lancangriver/serve/src/jobs/vectorSourceConfig.js`
  - validates `VECTOR_INGEST_SOURCE`
  - exposes the active source and fails fast for unsupported values
- `app/lancangriver/serve/src/jobs/vectorSourceRegistry.js`
  - maps a validated source name to its fetch implementation
- `app/lancangriver/serve/src/jobs/overtureFetch.js`
  - fetches Overture data for one z12 key and normalizes it to the local feature contract
- `app/lancangriver/serve/src/jobs/overtureNormalize.js`
  - converts raw Overture output into `feature_id`, `source`, `feature_type`, `tags`, and GeoJSON geometry

The exact number of new files should stay small. If `overtureNormalize.js` turns out to be tiny, it can be folded into `overtureFetch.js`. The design goal is clear boundaries, not framework ceremony.

## Overture Access Model

### Constraint

Overture is release-based cloud data, not an Overpass-style live feature query API.

The design therefore cannot pretend there is a drop-in HTTP endpoint analogous to Overpass. It needs an explicit service-side query mechanism.

### Chosen Model

The first implementation should use an external command-driven bbox query against Overture release data and treat that command as the Overture fetch backend.

The preferred concrete mechanism is Overture's Python CLI:

- `overturemaps download --bbox=<west,south,east,north> -f geojson --type=building`
- plus a second query for water-equivalent data from the Overture base theme, if needed through a companion query tool such as DuckDB when the CLI type coverage is insufficient

This model is acceptable for v1 because the user explicitly wants Overture to support live on-demand service jobs rather than only predownloaded extracts.

### Why Command-Driven Instead of Embedded SDK First

- it avoids introducing Python application code into the Node service itself
- it keeps the service-side integration thin: spawn command, capture output, normalize features
- it matches Overture's documented bbox-first access path
- it preserves freedom to swap the underlying command later without touching worker orchestration

### Runtime Assumptions

The service will require an Overture-capable local runtime when `VECTOR_INGEST_SOURCE=overture`.

That may mean:

- `overturemaps` CLI is installed and available on `PATH`, or
- an equivalent wrapper command is configured, or
- DuckDB is available for the water query if the CLI alone does not cover the needed feature parity

This dependency must be documented explicitly in the service README. The app should fail fast with a clear error if Overture mode is enabled but the required command is unavailable.

## Feature Mapping

### Required v1 Parity

Current OSM ingest scope is effectively:

- buildings
- `natural=water`

The Overture path should match this as closely as possible.

### Overture Theme Mapping

- buildings: use Overture `buildings` theme
- water-equivalent polygons: use Overture `base` theme `water` type

This is the right mapping because Overture's base guide explicitly states that `water` represents inland and marine water surfaces translated from OSM `natural` and `waterway` semantics.

### Normalized Output Contract

Both sources must emit the same local feature shape:

- `source`: `'osm'` or `'overture'`
- `feature_id`: stable source-prefixed identifier
- `feature_type`: GeoJSON geometry type used by the DB layer
- `tags`: source properties retained as JSON-compatible metadata
- `geometry`: valid GeoJSON geometry object in EPSG:4326

### Overture Feature Identity

The Overture path should preserve Overture IDs in `feature_id`, prefixed or otherwise namespaced clearly enough to avoid collisions with OSM IDs.

For example, an acceptable local identity shape is:

- `overture/<feature-id>`

The exact formatting can be decided in implementation, but it must be deterministic and collision-safe with existing OSM IDs such as `way/123`.

## Queue and Storage Model

The queue model should remain unchanged for v1.

Reasons:

- the user requested one global source switch, not per-job source selection
- current queue rows are keyed only by z12 tile key, which is sufficient when one source is globally active
- adding source to the job table would increase schema and migration complexity without delivering user value yet

`public.vector_features` should also remain the single storage table.

Reasons:

- the existing schema already includes a `source` column
- the vector tile SQL reads from one canonical table today
- first-pass comparison of OSM vs Overture can be done operationally by switching the active source, not by blending them live

This design intentionally avoids multi-source coexistence in the same coverage run.

## Failure Model

### Config Validation

If `VECTOR_INGEST_SOURCE` is missing, default behavior may stay `osm` for backward compatibility.

If it is present but invalid, startup or worker initialization must fail with an explicit message naming the supported values.

### Provider Failures

Provider failures should reuse the existing job state model:

- mark job `failed`
- record `last_error`
- log source name and z12 key

This applies to:

- command not found
- command exits non-zero
- malformed or empty provider output
- normalization failures

### No Automatic Cross-Source Fallback

If Overture mode fails, the job should fail as Overture mode.

The system should not silently retry with OSM because:

- it hides the true failure mode
- it makes ingest provenance ambiguous
- it breaks the user's expectation that the active source is globally selected

## Logging and Observability

Every job attempt should include source name in logs.

Minimum log messages should include:

- source selected for current process
- job running: source + z12 key
- job success: source + z12 key + feature count
- job failure: source + z12 key + failure reason

This is important because the current logs are OSM-branded and will become misleading after adding a second source.

## Testing Strategy

### Unit Tests

Add unit tests for:

- source config parsing and validation
- source registry resolution
- Overture normalization from raw provider output to local feature contract
- worker behavior with source-agnostic fetch dependency

### Regression Tests

Keep or extend tests proving:

- `VECTOR_INGEST_SOURCE=osm` preserves current OSM path behavior
- queueing logic and tile coverage behavior are unchanged

### Failure Tests

Add focused tests for:

- invalid `VECTOR_INGEST_SOURCE`
- unavailable Overture command runtime
- provider non-zero exit
- invalid GeoJSON or unsupported geometry in Overture output

### Integration Boundaries

Do not require live external Overture integration tests in the first pass.

Instead:

- mock process execution in tests
- feed representative sample output into normalization code
- keep CI deterministic and offline

## Documentation Requirements

The service README must document:

- the new `VECTOR_INGEST_SOURCE` environment variable
- default source behavior
- required runtime dependencies for Overture mode
- any required Overture CLI or DuckDB installation steps
- how to run the one-shot ingest job in each mode

The goal is that a developer can switch from OSM to Overture without reading implementation files.

## Open Implementation Decisions Kept Explicit

These decisions are intentionally left to the implementation plan, but they are bounded so they do not create ambiguity:

1. Whether Overture water extraction is handled entirely by one command path or split between CLI and DuckDB.
2. Whether Overture normalization lives in one file or a tiny fetch-plus-normalize pair.
3. Whether the existing worker file is renamed to a source-neutral name or only generalized internally.

These are implementation details, not product or architecture uncertainties.

## Rollout Sequence

Recommended delivery order:

1. generalize worker dependency from OSM-only naming to source-agnostic naming
2. add config validation and source registry
3. refactor existing OSM path behind the registry without changing behavior
4. add Overture fetch + normalize path for buildings and water
5. wire CLI and server entrypoints through shared source selection
6. add tests and docs

This sequence keeps the OSM path working at every stage and makes regressions easy to isolate.
