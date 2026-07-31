# Tile-12 OSM Three.js Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Three.js experiment that loads an existing z12 vector PBF without queueing ingest work and renders its GeoJSON contents.

**Architecture:** The service adds a direct PBF route beside the queue-aware route. Client parsing and Three.js geometry conversion live in focused experiment modules; the React root owns renderer lifecycle, tile loading, controls, and status UI.

**Tech Stack:** Express, PostGIS MVT, React 19, Three.js, OrbitControls, TypeScript, Vite MPA, Tailwind CSS, Vitest/Supertest

---

### Task 1: Direct Existing-Vector Route

**Files:**

- Modify: `app/lancangriver/serve/test/vector.tiles.route.test.js`
- Modify: `app/lancangriver/serve/src/routes/vectorTiles.js`
- Modify: `app/lancangriver/serve/README.md`

- [ ] Add a failing route test for `GET /vector/tiles-existing/12/1024/1024.pbf` asserting PBF bytes, `getVectorTilePbf(12, 1024, 1024)`, and no `queueMissingCoverage` call.
- [ ] Run the focused route test and verify a 404 failure.
- [ ] Implement the direct route with existing coordinate validation, PBF headers, and no coverage call.
- [ ] Document the no-queue endpoint and rerun the focused route test.

### Task 2: Tile-Key And Geometry Utilities

**Files:**

- Create: `app/lancangriver/client/src/experiments/tile12-osm/tile.test.ts`
- Create: `app/lancangriver/client/src/experiments/tile12-osm/tile.ts`
- Create: `app/lancangriver/client/src/experiments/tile12-osm/render.ts`

- [ ] Add failing tests for exact `12/x/y` parsing, coordinate bounds, local-meter projection at tile center, and building/water classification.
- [ ] Run the focused test and verify missing exports.
- [ ] Implement `parseTile12Key`, projection context, and classification helpers.
- [ ] Implement a disposable Three.js group builder for building polygons, water/other polygons, lines, points, and tile outline.
- [ ] Rerun focused tests.

### Task 3: Three.js Experiment Page

**Files:**

- Modify: `app/lancangriver/client/src/experiments/tile12-osm/App.tsx`
- Modify: `app/lancangriver/client/src/experiments/tile12-osm/main.tsx`
- Create: `app/lancangriver/client/experiments-tile12-osm.html`
- Modify: `app/lancangriver/client/vite.config.ts`
- Modify: `app/lancangriver/client/src/portal/App.tsx`

- [ ] Build the full-viewport Three.js scene with camera, lights, OrbitControls, animation, resize, and disposal.
- [ ] Add tile-key form defaulting to `12/1024/1024`; load from `/vector/tiles-existing` using `fetchTileVector`, replace the disposable group, frame the camera, and show counts/errors.
- [ ] Bootstrap React, add the MPA HTML/Vite input and route alias, and add the portal card.
- [ ] Run client tests and build.
- [ ] Start service/client on available ports and verify the experiment in browser at desktop/mobile sizes, nonblank canvas pixels, controls, status output, and no queue creation.
