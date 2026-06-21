---
applyTo: "app/lancangriver/serve/**"
description: "Use when editing the Lancangriver service (Express + PostGIS + raster/vector routes), including env setup, migrations, and tests."
---

# Lancangriver Service Instructions

Scope: app/lancangriver/serve only.

## Commands

- Install: npm install (run in app/lancangriver/serve)
- Start/dev: npm run dev
- DB migration: npm run migrate:db
- Tile prefetch helper: npm run prefetch:tiles -- --help
- Tests: npm test

## Environment Expectations

- DATABASE_URL is required for vector queries and migrations.
- OPENTOPOGRAPHY_API_KEY is required for DEM retrieval paths.
- For full local flow, start PostGIS from app/lancangriver/docker.

## Working Conventions

- Keep route logic and data-access boundaries clear; avoid hidden cross-module coupling.
- Preserve ESM module style and existing endpoint contracts unless explicitly asked to change API behavior.
- If endpoint behavior changes, update or add tests in app/lancangriver/serve/test.

## Data and Migration Rules

- Run npm run migrate:db before relying on public.vector_features.
- Do not commit generated cache data or tile outputs.
- Treat .tiles outputs as generated artifacts.

## Verify Before Done

- Run npm test for service changes.
- For route changes, run npm run dev and validate target endpoint(s) manually.

## Reference Docs

- Runbook: ../../app/lancangriver/docs/runbook.md
- Service README: ../../app/lancangriver/serve/README.md
- Pipeline README: ../../app/lancangriver/pipeline/README.md
- Lancangriver overview: ../../app/lancangriver/README.md
