# Lancangriver Service (`serve`)

Express service for health, vector bbox queries, and raster (satellite/DEM) tile fetch + cache.

## Prerequisites

- Node.js 18+
- npm
- Optional for `/vector`: Postgres/PostGIS running and populated with `public.vector_features`
- Optional for DEM endpoints: OpenTopography API key

## Install

From `app/lancangriver/serve`:

```bash
npm install
```

## Run

From `app/lancangriver/serve`:

```bash
npm run dev
```

Default listen port is `4050`.

One-shot vector ingest job by canonical zoom-12 key:

```bash
npm run osm:ingest:job -- --key 12/3456/1523
```

Use Overture Maps instead of Overpass for ingest:

```bash
pip install overturemaps
export VECTOR_INGEST_SOURCE=overture
npm run osm:ingest:job -- --key 12/3456/1523
```

Queue only (do not ingest immediately):

```bash
npm run osm:ingest:job -- --key 12/3456/1523 --enqueue-only
```

## Migrations

From `app/lancangriver/serve`:

```bash
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
npm run migrate:db
```

This applies SQL files in `src/sql/migrations/` and creates `public.vector_features` plus indexes.

## Environment Variables

- `PORT`: service port (default `4050`)
- `DATABASE_URL`: required for `/vector` (example: `postgres://user:pass@localhost:5432/lancangriver`)
- `OPENTOPOGRAPHY_API_KEY` or `OPEN_TOPOGRAPHY_API_KEY`: required for DEM tile download
- `VECTOR_INGEST_SOURCE` (optional): `osm` (default) or `overture`
- `OSM_OVERPASS_ENDPOINT` (optional): override Overpass API endpoint for OSM ingest jobs
- `OVERTUREMAPS_CMD` (optional): override overture CLI command (default `overturemaps`)
- `OVERTURE_ALLOW_PARTIAL` (optional): `true` (default) allows building-only ingest if water fetch fails; set `false` to fail job on water fetch errors
- `OVERTURE_WATER_INLAND_ONLY` (optional): `true` to exclude ocean/sea water features
- `OVERTURE_WATER_POLYGONS_ONLY` (optional): `true` to keep only Polygon/MultiPolygon water geometries
- `OVERTURE_USE_STAC` (optional): `true` (default). Set `false` to always use `--no-stac` for direct dataset access.
- `OVERTURE_STAC_FALLBACK_TO_NO_STAC` (optional): `true` (default) retries once with `--no-stac` when STAC index access fails.
- `OVERTURE_RELEASE` (optional): pin a specific release version (for example `2026-07-22.0`).
- `OVERTURE_CONNECT_TIMEOUT` (optional): CLI connect timeout in seconds (default `20`).
- `OVERTURE_REQUEST_TIMEOUT` (optional): CLI request timeout in seconds (default `120`).
- `OVERTURE_DOWNLOAD_RETRIES` (optional): retry count for retryable network/STAC failures (default `1`).
- `OVERTURE_DOWNLOAD_RETRY_DELAY_MS` (optional): delay between retries in milliseconds (default `1500`).
- `SATELLITE_URL_TEMPLATE` (optional): override Google satellite URL template
- `OPENTOPOGRAPHY_URL_TEMPLATE` (optional): override DEM URL template

## Endpoints

- `GET /health`
- `GET /vector?bbox=minLon,minLat,maxLon,maxLat`
- `GET /vector/tiles/:z/:x/:y.pbf`
- `GET /vector/tiles-existing/:z/:x/:y.pbf`
- `GET /photos/geotagged?root=/absolute/folder/path`
- `GET /raster/satellite/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y/png`

## Vector Tile Endpoint (Async Coverage)

- Endpoint: `GET /vector/tiles/:z/:x/:y.pbf`
- Request path computes covering zoom-12 canonical tiles for dedupe-safe ingest jobs.
- If required coverage is missing or still ingesting, the service returns `204 No Content` and queues missing jobs.
- Once coverage is marked `done`, the endpoint returns `200` with `application/x-protobuf` (MVT pbf bytes).
- A background worker fetches source data based on `VECTOR_INGEST_SOURCE`, upserts into `public.vector_features`, and updates job states.
- `VECTOR_INGEST_SOURCE=osm` uses Overpass and preserves existing behavior.
- `VECTOR_INGEST_SOURCE=overture` uses the `overturemaps` CLI (install with `pip install overturemaps`) and ingests buildings + water from Overture.
- `GET /vector/tiles-existing/:z/:x/:y.pbf` reads PBF data directly from `public.vector_features` without checking coverage or creating ingest jobs.

Coverage can be queried before requesting PBF data:

- `GET /vector/coverage/12/:x/:y` returns `{ key, status, loaded }` for one canonical tile. Only `status: "done"` sets `loaded` to `true`; unknown tiles return `status: null`.
- `GET /vector/coverage/loaded?limit=100&offset=0` returns a stable, paginated list of completed canonical tiles and the total loaded count.
- `GET /vector/coverage/jobs?limit=100&offset=0` returns all canonical jobs with `queued`, `running`, `done`, or `failed` status.
- `POST /vector/coverage/12/:x/:y/rerun` changes a failed job back to `queued`. Unknown jobs return `404`; jobs that are not failed return `409`.
- `limit` defaults to `100`, accepts values from `1` through `1000`, and `offset` defaults to `0`.

## Geotagged Photos Mode Matrix

- DEV: client calls `GET /photos/geotagged?root=...` on this local service.
- PROD: packaged Electron uses folder picker + preload bridge instead of this endpoint.
- Shared payload contract (same shape in both modes):
  - `id: string`
  - `filePath: string`
  - `lat: number`
  - `lng: number`
  - `takenAt: string | null`

## Vector table contract

`/vector` reads from `public.vector_features` with these required columns:

- `feature_id` (`TEXT`, primary key)
- `feature_type` (`TEXT`)
- `tags` (`JSONB`)
- `geom` (`geometry(Geometry, 4326)`)

Additional columns are returned automatically as GeoJSON properties.

## Tile Cache Layout

Default cache root is `./.tiles`:

- `.tiles/{z}/{x}/{y}/satellite.jpeg`
- `.tiles/{z}/{x}/{y}/dem.gtiff`
- `.tiles/{z}/{x}/{y}/dem.png`

## Prefetch Tiles

```bash
export OPENTOPOGRAPHY_API_KEY='YOUR_KEY'
npm run prefetch:tiles -- --bbox 99.0,21.0,101.5,23.0 --zoom 11 --concurrency 6
```

Optional flags:

- `--root <dir>`
- `--skip-satellite`
- `--skip-dem`
- `--force`

## Test

```bash
npm test
```
