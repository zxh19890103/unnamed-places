# Lancangriver Client (`client`)

Browser client for exploring Lancangriver map, terrain, imagery, and vector data.

## Tech Stack

- Vite for development, bundling, and multiple HTML entry points.
- TypeScript with ES modules.
- React 19 for application and interface UI.
- Three.js for the 3D globe, terrain tiles, materials, and scene controls.
- Leaflet for the flat map view and map interactions.
- Vitest for unit tests.
- Tailwind CSS and the Tailwind Vite plugin for utility styling.
- Radix UI primitives for tabs, tooltips, and icons.
- `@mapbox/vector-tile` and `pbf` for decoding vector tile data.
- `lil-gui` for development controls and diagnostics.
- `suncalc` and `tz-lookup` for sun and timezone calculations.
- `clsx` for composing UI class names.

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
