# Lancangriver Client (`client`)

Browser client for exploring Lancangriver map, terrain, imagery, and vector data.

## Tech Stack

- Vite for development, bundling, and multiple HTML entry points.
- TypeScript with ES modules.
- React for application and experiment UI.
- Three.js for the 3D globe, terrain tiles, materials, and controls.
- Leaflet for the flat map view.
- Vitest for unit tests.
- Tailwind CSS and the Tailwind Vite plugin for utility styling.
- `@mapbox/vector-tile` and `pbf` for decoding vector tile data.
- `lil-gui` for development controls and diagnostics.
- `suncalc` and `tz-lookup` for sun and timezone calculations.

## Prerequisites

- Node.js 18+
- npm
- Service running (default expected base URL: `http://localhost:4050`)

## Install

From `app/lancangriver/client`:

```bash
npm install
```

## Run (Dev)

From `app/lancangriver/client`:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## What This Baseline Does

- Computes viewport request plan:
  - vector bbox window
  - raster tile list (`z/x/y`)
- Calls service APIs:
  - `/vector?bbox=...`
  - `/raster/satellite/:z/:x/:y`
  - `/raster/dem/:z/:x/:y`
- Shows diagnostics summary for request progress/failures.

## HTML Entries

Each HTML file is a separate Vite entry page:

- `index.html`: Main 3D tile-rendering client. Starts `src/main-tile-render.tsx`.
- `flat.html`: Flat Leaflet map view. Starts `src/main-flat.tsx`.
- `jobs.html`: Loaded vector-tile view for inspecting job-loaded data. Starts `src/jobs/main.tsx`.
- `portal.html`: Portal that links to the available experiments. Starts `src/portal/main.tsx`.
- `experiments-global-zoom.html`: Global zoom experiment for testing globe zoom behavior. Starts `src/experiments/global-zoom/main.tsx`.
- `experiments-shanshui-shader.html`: Shader experiment for Shanshui-style terrain rendering. Starts `src/experiments/shanshui-shader/main.tsx`.
- `experiments-sphere-zoom.html`: Sphere zoom experiment for testing camera and tile behavior on the globe. Starts `src/experiments/sphere-zoom/main.tsx`.
- `experiments-tile12-osm.html`: Inspector for OSM data and rendering at tile zoom 12. Starts `src/experiments/tile12-osm/main.tsx`.

## Source Folders

These are the first-level folders under `src`:

- `calc/`: Geographic and mathematical calculations.
- `experiments/`: Isolated prototypes for testing rendering ideas.
- `explore/`: Reusable 3D globe, tile, control, geometry, material, and setup code. See below.
- `flat/`: Components for the flat Leaflet map.
- `jobs/`: UI and loading flow for vector-tile jobs.
- `osm/`: OpenStreetMap-specific data and rendering helpers.
- `photos/`: Photo data, markers, and photo-layer rendering.
- `portal/`: Experiment portal UI.

The top-level `main-*.tsx` files are entry bootstraps, `styles.css` contains shared styles, and the `*.d.ts` files provide TypeScript declarations. `public/` contains static assets. `dist/` is generated build output and `node_modules/` contains installed dependencies.

## `src/explore/`

The `explore` folder contains the shared 3D exploration layer:

- `controls/`: Pointer and camera interaction controls.
- `dom/`: React DOM overlays for scene monitoring and tile statistics.
- `geometries/`: Three.js geometry builders for terrain tiles, buildings, clouds, and photos.
- `legacy/`: Older exploration implementations kept for reference.
- `materials/`: Three.js materials and shaders for tiles, terrain, buildings, clouds, and photos.
- `setup/`: Scene setup, camera modes, sky, photos, vendors, GUI, and visibility helpers.
- `ControlsManager.class.ts`: Switches between available control modes.
- `OsmBuildingTilesController.class.ts`: Coordinates OSM building tile loading and display.
- `Sphere.class.ts`: Globe sphere representation.
- `SphereTile.class.ts`: Individual globe tile representation.
- `TilesManager.class.ts`: Coordinates visible tile selection and tile lifecycle.
