# Lancangriver Client (`client`)

Vite + TypeScript client baseline for viewport-driven requests to the Lancangriver service.

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

## Key Files

- `src/view/request-scheduler.ts`: viewport -> bbox + tile keys
- `src/data/api.ts`: network wrappers for vector/DEM/satellite
- `src/ui/diagnostics.ts`: diagnostics text rendering
- `src/main.ts`: bootstrap and request orchestration

## Notes

- This is a milestone baseline focused on request orchestration and diagnostics.
- Three.js is installed and available for subsequent rendering integration.

## Shanshui Wash Terrain Mode

- Terrain mode key: `shanshui-wash`
- Visual direction: wash-first shading with low-opacity satellite blend
- Default preset: `balanced`
- Runtime controls: tone bands, edge strength, wash contrast, haze strength, satellite blend opacity
- Performance guardrail: adaptive quality uses frame-time p95 to degrade/recover wash detail
