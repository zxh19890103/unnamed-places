# Lancangriver Pipeline

This folder contains the baseline data pipeline for corridor config validation, OSM ingestion, and loading vector features into PostGIS.

## 1) Prerequisites

- Python 3.11+ (or your local Python that supports `venv`)
- Node.js dependencies already installed for `app/lancangriver/serve` if you want tile prefetch

## 2) Create Python venv and install requirements

From `app/lancangriver`:

```bash
/opt/homebrew/bin/python3 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install --upgrade pip
pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt
```

## 3) Validate pipeline config and query-shape tests

From `app/lancangriver`:

```bash
pipeline/.venv/bin/python -m pytest pipeline/tests/test_corridor_config.py pipeline/tests/test_osm_query_shape.py -q
```

## 4) Run OSM ingest for enabled corridor segments

From `app/lancangriver`:

```bash
pipeline/.venv/bin/python -m pipeline.src.ingest.osm_ingest --config pipeline/config/pilot_corridor.json --output-dir pipeline/output/osm
```

Expected output:

- One JSON file per enabled segment at `pipeline/output/osm/<segment-id>.osm.json`
- Terminal line like:
  - `[pilot-001] fetched <N> elements -> pipeline/output/osm/pilot-001.osm.json`

## 5) Prefetch DEM + satellite tiles (optional, offline-ready rendering)

This uses the Node script in `serve/scripts/prefetch-tiles.js` and writes to `.tiles/{z}/{x}/{y}`.

From `app/lancangriver/serve`:

```bash
export OPENTOPOGRAPHY_API_KEY='YOUR_KEY'
npm run prefetch:tiles -- --bbox 99.0,21.0,101.5,23.0 --zoom 11 --concurrency 6
```

Generated files per tile:

- `.tiles/{z}/{x}/{y}/satellite.jpeg`
- `.tiles/{z}/{x}/{y}/dem.gtiff`
- `.tiles/{z}/{x}/{y}/dem.png`

## 6) Load OSM output into `public.vector_features`

From `app/lancangriver`:

```bash
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
pipeline/.venv/bin/python -m pipeline.src.ingest.load_vector_features --input-dir pipeline/output/osm --truncate
```

Notes:

- Run `npm run migrate:db` in `app/lancangriver/serve` first to create the target table.
- Loader performs upsert by `feature_id` (`<osm_type>/<osm_id>`).
- Use `--truncate` for a full refresh before upsert.

## 7) Common options

OSM ingest:

```bash
pipeline/.venv/bin/python -m pipeline.src.ingest.osm_ingest --help
```

Tile prefetch:

```bash
npm run prefetch:tiles -- --help
```

Vector loader:

```bash
pipeline/.venv/bin/python -m pipeline.src.ingest.load_vector_features --help
```

## 8) Notes

- Corridor segments are configured in `pipeline/config/pilot_corridor.json`.
- Only segments with `"enabled": true` are ingested.
- If you expand to many corridor bboxes, keep IDs stable so outputs are easy to diff.
