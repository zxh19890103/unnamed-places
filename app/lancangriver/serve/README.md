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
- `SATELLITE_URL_TEMPLATE` (optional): override Google satellite URL template
- `OPENTOPOGRAPHY_URL_TEMPLATE` (optional): override DEM URL template

## Endpoints

- `GET /health`
- `GET /vector?bbox=minLon,minLat,maxLon,maxLat`
- `GET /raster/satellite/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y/png`

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
