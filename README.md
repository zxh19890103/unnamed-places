# Unnamed Places

Unnamed Places is an Electron desktop app for exploring real-world places in a stylized 3D scene. The app combines map interaction, terrain elevation, OSM features, and custom WebGL shaders to render a playful earth-view experience.

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
