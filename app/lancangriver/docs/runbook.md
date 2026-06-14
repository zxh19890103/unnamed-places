# Lancangriver Runbook

## Start PostGIS

```bash
cd app/lancangriver/docker
docker compose up -d --build
```

## Start service

```bash
cd app/lancangriver/serve
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
export OPENTOPOGRAPHY_API_KEY='YOUR_KEY'
npm run migrate:db
npm start
```

## Load vector features

```bash
cd app/lancangriver
pipeline/.venv/bin/python -m pipeline.src.ingest.osm_ingest --config pipeline/config/pilot_corridor.json --output-dir pipeline/output/osm
export DATABASE_URL='postgres://lancangriver:lancangriver_dev_password@localhost:5432/lancangriver'
pipeline/.venv/bin/python -m pipeline.src.ingest.load_vector_features --input-dir pipeline/output/osm --truncate
```

## Start client

```bash
cd app/lancangriver/client
npm install
npm run dev
```

## Run smoke check

```bash
cd app/lancangriver
bash scripts/smoke.sh
```
