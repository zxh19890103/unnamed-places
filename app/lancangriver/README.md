# Lancangriver Project

Milestone baseline for a viewport-driven river visualization stack:

- Service: health, vector bbox query, raster tile fetch/cache
- Client: viewport scheduler + API calls + diagnostics
- Pipeline: corridor config validation + OSM ingest baseline
- Docker: local PostGIS environment

## Folder Layout

- `client/`: Vite + TypeScript frontend baseline
- `serve/`: Express backend for health/vector/raster endpoints
- `pipeline/`: Python ingestion and config validation scripts/tests
- `docker/`: PostGIS Docker setup for local development
- `scripts/`: utility scripts (including smoke checks)
- `docs/`: planning docs, runbook, and milestone notes

## Quick Start (Local)

1. Start PostGIS

```bash
cd app/lancangriver/docker
docker compose up -d --build
```

2. Start service

```bash
cd app/lancangriver/serve
npm install
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
export OPENTOPOGRAPHY_API_KEY='YOUR_KEY'
npm run migrate:db
npm run dev
```

3. Load vector features (required for `/vector`)

```bash
cd app/lancangriver
pipeline/.venv/bin/python -m pipeline.src.ingest.osm_ingest --config pipeline/config/pilot_corridor.json --output-dir pipeline/output/osm
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
pipeline/.venv/bin/python -m pipeline.src.ingest.load_vector_features --input-dir pipeline/output/osm --truncate
```

4. Start client

```bash
cd app/lancangriver/client
npm install
npm run dev
```

5. Run smoke check

```bash
cd app/lancangriver
bash scripts/smoke.sh
```

## Service API (Current)

- `GET /health`
- `GET /vector?bbox=minLon,minLat,maxLon,maxLat`
- `GET /raster/satellite/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y`
- `GET /raster/dem/:z/:x/:y/png`

## Raster Cache

Default tile cache root is `.tiles/` (git-ignored):

- `.tiles/{z}/{x}/{y}/satellite.jpeg`
- `.tiles/{z}/{x}/{y}/dem.gtiff`
- `.tiles/{z}/{x}/{y}/dem.png`

## Test Commands

Service tests:

```bash
cd app/lancangriver/serve
npm test
```

Client tests:

```bash
cd app/lancangriver/client
npm test
```

Pipeline tests:

```bash
cd app/lancangriver
pipeline/.venv/bin/python -m pytest pipeline/tests/test_corridor_config.py pipeline/tests/test_osm_query_shape.py -q
```

## Known Development Note

The `/vector` endpoint reads from `public.vector_features`. Create it with `npm run migrate:db` in `app/lancangriver/serve`, then load data via `pipeline.src.ingest.load_vector_features`.

## Documentation Map

- Service guide: `app/lancangriver/serve/README.md`
- Client guide: `app/lancangriver/client/README.md`
- Pipeline guide: `app/lancangriver/pipeline/README.md`
- Docker guide: `app/lancangriver/docker/README.md`
- Runbook: `app/lancangriver/docs/runbook.md`
- Milestone checklist: `app/lancangriver/docs/milestone-1-checklist.md`
