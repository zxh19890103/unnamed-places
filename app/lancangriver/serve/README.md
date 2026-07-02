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

One-shot OSM ingest job by canonical zoom-12 key:

```bash
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
- `OSM_OVERPASS_ENDPOINT` (optional): override Overpass API endpoint for OSM ingest jobs
- `SATELLITE_URL_TEMPLATE` (optional): override Google satellite URL template
- `OPENTOPOGRAPHY_URL_TEMPLATE` (optional): override DEM URL template

## Endpoints

- `GET /health`
- `GET /vector?bbox=minLon,minLat,maxLon,maxLat`
- `GET /vector/tiles/:z/:x/:y.pbf`
- `GET /photos/geotagged?root=/absolute/folder/path`
- `GET /raster/satellite/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y/png`

## Vector Tile Endpoint (Async Coverage)

- Endpoint: `GET /vector/tiles/:z/:x/:y.pbf`
- Request path computes covering zoom-12 canonical tiles for dedupe-safe ingest jobs.
- If required coverage is missing or still ingesting, the service returns `204 No Content` and queues missing jobs.
- Once coverage is marked `done`, the endpoint returns `200` with `application/x-protobuf` (MVT pbf bytes).
- A background worker fetches OSM data from Overpass, upserts into `public.vector_features`, and updates job states.

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
