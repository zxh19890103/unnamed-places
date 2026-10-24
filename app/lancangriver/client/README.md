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

## Photo view print export

On `/photoview-in-3d`, choose **Export A2 PNG** to download a 7016 x 4961 pixel
landscape image (A2 at 300 DPI). The export waits up to 60 seconds for terrain,
imagery, and vector loading, then renders in GPU-sized tiles with progress and
cancellation. Animation, controls, and terrain LOD are frozen during capture.
Failed/missing terrain or satellite imagery prevents export rather than saving placeholders.

The paper aspect ratio preserves the camera's vertical field of view and adjusts
horizontal framing. Scene labels are included; HTML panels and maps are not.
The final image is assembled in browser memory, so close other tabs if allocation
or encoding fails. This is not an unlimited-size/offline stitching workflow.

Print the downloaded PNG on A2 landscape paper (594 x 420 mm). Set that physical
size in your print application rather than relying on browser PNG DPI metadata;
disable automatic fit/cropping when exact dimensions matter.
