# Unnamed Places

Unnamed Places is an Electron desktop app for exploring real-world places in a stylized 3D scene. The app combines map interaction, terrain elevation, OSM features, and custom WebGL shaders to render a playful, "cute" earth-view experience.

## Product Goals

- Let users pick any location on earth from a map and inspect it in a 3D world.
- Blend real geospatial data with artistic rendering (terrain colors, vegetation sprites, stylized lighting).
- Make local iteration fast through an in-repo dev server that compiles TypeScript on demand.
- Support future extensions such as richer environment effects, improved OSM layers, and location media overlays.

## Core Tech Stack

- Desktop shell: Electron (main process + preload bridge).
- Frontend UI: React 19 + TypeScript.
- 2D map interaction: Leaflet.
- 3D rendering: Three.js + custom GLSL shaders.
- Styling: Tailwind CSS v4 + SCSS.
- Backend/dev server: Node.js HTTP server (custom routing), TypeScript compiler API.
- Geospatial services and processing:
  - OpenTopography DEM API (terrain elevation source).
  - Overpass API + osmtogeojson (OSM feature extraction and conversion).
  - GDAL tools (gdal_translate, gdaldem) for raster processing.
  - sharp for raster stats and image processing.

## High-Level Architecture

### 1) Desktop Host

- `app/main.js` creates the Electron BrowserWindow.
- `app/preload.js` exposes limited runtime version info to renderer via context bridge.
- `app/index.html` loads runtime scripts, import map, Tailwind output, and React bootstrap.

### 2) Client Rendering Layer

- `app/client/src/bootstrap.tsx` mounts React app.
- `app/client/src/App.tsx` hosts current experience entry (`SamTest`) and alternate map-to-tile flow (`GeoMap` + `TileView`).
- `app/client/src/GeoMap.tsx` handles map picking and tile coordinates.
- `app/client/src/TileView.tsx` is the core 3D tile renderer:
  - pulls elevation and mask textures,
  - builds terrain mesh with shader-based coloring,
  - overlays procedural plants/points,
  - integrates OSM-derived masks and layers.

### 3) Local Data/Build Server

- `app/serve/index.js` is a custom HTTP server that:
  - compiles TS/TSX modules dynamically,
  - rewrites imports for ESM/browser usage,
  - serves routes for terrain, OSM, runtime assets, CSS/SCSS/Tailwind, and shader text,
  - caches modules and generated artifacts.
- Route registration lives in `app/serve/routes/index.js`.

### 4) Geospatial Route Layer

- `app/serve/routes/dem.js`: fetches GeoTIFF DEM data and converts it to PNG height maps.
- `app/serve/routes/elevation.js`: serves cached elevation stats (min/max/span).
- `app/serve/routes/osm.js`: queries Overpass, stores raw OSM JSON, converts to GeoJSON, serves cached results.
- Additional routes provide masks, styled tiles, and derived terrain maps (slope/aspect).

## Data and Rendering Flow

1. User chooses a location (or app uses predefined center).
2. Client computes tile coordinates and bounding box.
3. Client requests DEM, elevation metadata, OSM and mask endpoints.
4. Server fetches/caches upstream geospatial data and serves processed assets.
5. Three.js scene builds terrain geometry and shader materials from those textures.
6. Scene adds environmental details (vegetation, lighting, clouds/plants modules).

## Project Structure (Core Areas)

- `app/`: Electron app host, runtime HTML, preload bridge.
- `app/client/`: React + Three.js + Leaflet frontend and shader assets.
- `app/serve/`: local dev/runtime server, geospatial routes, caching.
- `app/public/`: static assets, local JS libs (Three/Leaflet/SunCalc), temporary outputs.
- `app/steal/`: sprite/vector asset generation and ingestion scripts.

## How to Run (Current Setup)

### Prerequisites

- Node.js (project uses ESM and modern dependencies).
- Electron (installed from root dependencies).
- GDAL tools available at paths configured in `app/serve/_config.js`:
  - gdal_translate
  - gdaldem

### Install

Install dependencies for:

- repository root
- `app/client`
- `app/serve`

Example:

```bash
npm install
cd app/client && npm install
cd ../serve && npm install
```

### Start

- Start desktop app:

```bash
npm start
```

- Run server in dev mode:

```bash
npm run dev
```

## Notes and Caveats

- DEM and OSM endpoints rely on external services and network availability.
- The DEM route currently includes an API key directly in code and should be moved to environment configuration for production use.
- A lot of rendering behavior is experimental/prototyping in nature (for example `SamTest` and optional scene modules).

## License

MIT
