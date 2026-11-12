# Lancangriver Service (`serve`)

Express service for health checks, vector and highway vector tile queries, raster (satellite/DEM) tile fetch + cache, reverse geocoding, photo metadata, and vector ingest jobs.

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

Run a highways-only ingest job for the same canonical z12 key:

```bash
npm run osm:ingest:highways:job -- --key 12/3456/1523
```

## Migrations

From `app/lancangriver/serve`:

```bash
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
npm run migrate:db
```

This applies SQL files in `src/sql/migrations/` and creates the service tables and indexes, including `public.vector_features` and `public.z12geoinfo`.

## Environment Variables

- `PORT`: service port (default `4050`)
- `DATABASE_URL`: required for `/vector` (example: `postgres://user:pass@localhost:5432/lancangriver`)
- `OPENTOPOGRAPHY_API_KEY` or `OPEN_TOPOGRAPHY_API_KEY`: required for DEM tile download
- `VECTOR_INGEST_SOURCE` (optional): `osm` (default) or `overture`
- `OSM_OVERPASS_ENDPOINT` (optional): override Overpass API endpoint for OSM ingest jobs
- `CESIUM_ION_ACCESS_TOKEN` or `CESIUM_ACCESS_TOKEN` (optional): used by the Cesium reverse geocode route
- `CESIUM_REVERSE_GEOCODE_ENDPOINT` (optional): override the Cesium reverse geocode endpoint
- `NOMINATIM_REVERSE_ENDPOINT` (optional): override the Nominatim reverse geocoding endpoint
- `NOMINATIM_USER_AGENT` (optional): set a custom user agent for Nominatim requests
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

## Photo folders

- `GET /photos/directories[?path=...&offset=0]` returns canonical `path`, allowed
  `roots`, `parent`, directory-only `directories`, and `nextOffset`. Listings are
  sorted and paginated at 100 directories. Symlinks are omitted, and canonical
  paths outside the allowed locations are rejected.
- `GET /photos/geotagged?root=...&recursive=true` scans nested folders with bounded
  metadata concurrency, skips symlinks, and returns `photos`, up to 50 `warnings`,
  and the full `warningCount`. Omitting `recursive=true` preserves shallow scanning
  and the existing response shape. Client disconnection cancels further scan work.
- Missing or unreadable selected roots return an error. Unreadable nested
  directories and corrupt image metadata generate warnings while valid photos
  continue loading. Source files are never modified.

Browser directory browsing defaults to the current user's home directory. Optional
`PHOTO_BROWSE_ROOTS` is a nonempty JSON array of existing absolute paths, for example
`["/Users/example","/Volumes/Photos"]`. This controls browsing locations, not the
saved photo source selection. Restart the service after changing configuration.

The new browse route accepts loopback clients with a localhost/loopback Host and
trusted Origin only. Default origins are `http://localhost:5173`,
`http://127.0.0.1:5173`, and their port-5174 equivalents. Optional
`PHOTO_BROWSE_ORIGINS` replaces this list with comma-separated exact origins.
Non-browser local clients without an Origin header are also accepted.

This remains a local-only photo workflow. Existing photo image/EXIF endpoints are
not a complete filesystem access sandbox and retain their existing behavior;
do not expose the service to untrusted networks. OS access permissions still
apply, including macOS Files and Folders permissions for Documents and Desktop.

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
