# Tile-12 OSM Three.js Viewer Design

## Goal

Add a standalone experiment that accepts a canonical `12/x/y` key, fetches existing vector data without creating ingest jobs, decodes the PBF, and renders all included geometry in a local Three.js scene.

## Service API

`GET /vector/tiles-existing/:z/:x/:y.pbf` validates non-negative integer coordinates and calls `getVectorTilePbf(z, x, y)` directly. It does not query coverage status and never calls `queueMissingCoverage`. The response uses `application/x-protobuf`, the existing short cache policy, and an empty PBF buffer when no database features intersect the tile.

The existing `GET /vector/tiles/:z/:x/:y.pbf` queue-aware behavior remains unchanged.

## Experiment Entry

`experiments-tile12-osm.html` boots `src/experiments/tile12-osm/main.tsx`, which renders `App.tsx` and imports the shared Tailwind stylesheet. Vite includes the HTML file as an MPA build input and the portal links to it.

The control panel contains a tile-key input defaulting to `12/1024/1024`, a Load button, loading/error state, and layer/feature counts. Input accepts exactly `12/x/y` with valid zoom-12 coordinate ranges (`0` through `4095`).

## Three.js Rendering

The scene is a local planar inspection view using a perspective camera, WebGL renderer, ambient and directional lighting, and `OrbitControls`. Longitude/latitude coordinates are projected into local meters relative to the tile center.

Geometry rendering rules:

- building polygons and multipolygons become extruded meshes using `height`, then `building:levels * 3.2`, then a 12-meter fallback
- water polygons and multipolygons become flat blue meshes
- other polygons and multipolygons become flat neutral meshes
- line strings and multilines become `THREE.Line` objects
- points and multipoints become small marker meshes

Every loaded object belongs to one disposable `THREE.Group`. Loading another tile removes and disposes the prior group. The camera and controls target automatically frame the tile dimensions after each successful load.

## Data Flow

1. Parse and validate the tile key.
2. Request `/vector/tiles-existing/12/x/y.pbf` through `fetchTileVector`.
3. Flatten decoded layers into GeoJSON features.
4. Convert features to local Three.js objects.
5. Replace the scene group and frame the camera.
6. Report per-layer and total feature counts.

## Testing

Service route tests prove the new endpoint calls `getVectorTilePbf` without calling `queueMissingCoverage`. Client unit tests cover tile-key parsing and coordinate projection/geometry classification. Full service/client tests and client production build remain required. Browser validation checks nonblank WebGL rendering, controls, desktop/mobile layout, and the portal link.
