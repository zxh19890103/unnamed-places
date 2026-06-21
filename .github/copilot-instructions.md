# Unnamed Places Agent Instructions

This repository contains two active stacks with different workflows. Confirm which stack a task targets before editing.

## Project Boundaries

- Root app (desktop prototype): Electron + custom Node server + Three.js stack in app/.
- Lancangriver (modular milestone stack): API + client + Python pipeline in app/lancangriver/.
- Avoid mixing implementation details across these stacks unless explicitly requested.

## Fast Start Commands

Run commands from the package directory they belong to.

### Root app

- Install: npm install
- Launch desktop: npm start
- Run root dev server: npm run dev
- Root test script is a stub and currently fails intentionally.

### Lancangriver service

- Path: app/lancangriver/serve
- Install: npm install
- Start/dev: npm run dev
- DB migration: npm run migrate:db
- Tests: npm test

### Lancangriver client

- Path: app/lancangriver/client
- Install: npm install
- Dev: npm run dev
- Build: npm run build
- Tests: npm test

### Lancangriver pipeline (Python)

- Uses venv at app/lancangriver/pipeline/.venv.
- Install deps: pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt
- Pipeline tests:
  - pipeline/.venv/bin/python -m pytest pipeline/tests/test_corridor_config.py pipeline/tests/test_osm_query_shape.py -q
- OSM ingest:
  - pipeline/.venv/bin/python -m pipeline.src.ingest.osm_ingest --config pipeline/config/pilot_corridor.json --output-dir pipeline/output/osm
- Load vector features:
  - pipeline/.venv/bin/python -m pipeline.src.ingest.load_vector_features --input-dir pipeline/output/osm --truncate

## Required Local Dependencies

- Docker + Docker Compose for local PostGIS (app/lancangriver/docker).
- Python 3.11+ for pipeline.
- GDAL tools for root app terrain routes (gdal_translate, gdaldem).
- OpenTopography API key for DEM workflows.

## Environment and Data Expectations

- Lancangriver service expects DATABASE_URL and OPENTOPOGRAPHY_API_KEY.
- Vector API depends on public.vector_features existing and being populated.
- Run npm run migrate:db before loading or querying vector data.

## Directories to Treat as Generated or Cache

- .cache/, .data/, .temp/, .input/
- app/lancangriver/pipeline/output/
- any .tiles/ directory

Do not hand-edit generated data unless a task explicitly asks for it.

## Known Pitfalls

- app/serve/experiments/ contains legacy CV experiments; do not use as implementation reference.
- Root stack includes prototype paths (for example SamTest) that may not represent production behavior.
- Root app GDAL tooling can be environment-specific; prefer configuration-aware updates over hardcoded path assumptions.

## Documentation Map (Link, Do Not Duplicate)

- Repository overview: [README](../README.md)
- Lancangriver overview: [app/lancangriver/README.md](../app/lancangriver/README.md)
- Lancangriver runbook: [app/lancangriver/docs/runbook.md](../app/lancangriver/docs/runbook.md)
- Service details: [app/lancangriver/serve/README.md](../app/lancangriver/serve/README.md)
- Client rendering details: [app/lancangriver/client/RENDER_LOGIC.md](../app/lancangriver/client/RENDER_LOGIC.md)
- Pipeline setup/details: [app/lancangriver/pipeline/README.md](../app/lancangriver/pipeline/README.md)
- Milestone checklist: [app/lancangriver/docs/milestone-1-checklist.md](../app/lancangriver/docs/milestone-1-checklist.md)

## Working Style for AI Agents

- Start by identifying target stack (root app vs lancangriver).
- Prefer minimal, scoped edits and preserve existing module boundaries.
- When changing behavior, update or add tests in the affected package where available.
- For setup/runtime issues, consult runbook docs first and then patch code.

## Existing Repo Preference

Follow the local skill policy already used in this repo:

- Call skill hi when:
  - user approval is needed,
  - an error occurs,
  - a task is completed.
