# Dynamic Satellite LOD for z11 DEM Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep DEM geometry fixed at z11 while making satellite JPEG resolution adapt to camera distance, up to z16, with hysteresis and request budgeting so texture loading stays smooth during navigation.

**Architecture:** The renderer will keep one canonical DEM tile per mesh at z11 and layer satellite imagery on top as a separate runtime LOD problem. A small view-layer helper will decide the satellite zoom from camera distance, a texture compositor will build higher-zoom satellite textures from the relevant Google tiles when the target zoom is above z11, and the main scene will schedule a limited number of updates per frame so texture churn cannot overwhelm the app. Existing manifest gating, camera controls, and diagnostics stay in place.

**Tech Stack:** TypeScript, Three.js, lil-gui, Vitest, existing client tile/view helpers, browser canvas compositing.

---

## Scope Check

This is one feature slice: dynamic satellite LOD only. It does not change the DEM source, DEM zoom, or manifest semantics. It does touch the renderer, view helpers, and diagnostics because those pieces must cooperate to keep the runtime stable.

## File Structure (Planned Changes)

### Satellite LOD Helpers

- Create: `app/lancangriver/client/src/view/satellite-lod.ts`
  - Distance-to-zoom policy with hysteresis for z11 through z16.
  - Helper that returns the satellite tile coverage needed for a DEM tile at a chosen zoom.
- Create: `app/lancangriver/client/src/view/satellite-texture-compositor.ts`
  - Fetch and composite satellite JPEG tiles into one canvas texture for a DEM tile.
  - Dispose stale textures when a newer zoom request wins.
- Create: `app/lancangriver/client/src/view/satellite-request-budget.ts`
  - Limits per-frame and global concurrent satellite LOD updates.
  - Prioritizes tiles closest to the camera.

### Renderer Integration

- Modify: `app/lancangriver/client/src/main.ts`
  - Keep DEM texture loading fixed at z11.
  - Add satellite LOD state to each visible terrain mesh.
  - Schedule satellite texture upgrades/downgrades based on camera distance.
  - Ignore stale in-flight requests when the camera moves again.

### Diagnostics and Debugging

- Modify: `app/lancangriver/client/src/ui/diagnostics.ts`
  - Show current satellite zoom distribution and pending request count.
- Optional Modify: `app/lancangriver/client/src/ui/camera-gui.ts`
  - Add a toggle to freeze dynamic satellite LOD for debugging.

### Tests

- Modify: `app/lancangriver/client/test/satellite-lod.test.ts`
  - Expand coverage from z11/z12 to z11 through z16.
  - Add hysteresis tests around every transition band.
- Create: `app/lancangriver/client/test/satellite-texture-compositor.test.ts`
  - Verify the compositor requests the correct child tiles for z13, z14, z15, and z16.
- Create: `app/lancangriver/client/test/satellite-request-budget.test.ts`
  - Verify request caps, prioritization, and stale-request suppression.

---

## Task 1: Define Satellite Zoom Bands and Hysteresis

**Files:**

- Modify: `app/lancangriver/client/test/satellite-lod.test.ts`
- Modify: `app/lancangriver/client/src/view/satellite-lod.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { chooseSatelliteZoom } from "../src/view/satellite-lod";

describe("chooseSatelliteZoom", () => {
  test("maps far camera distances to z11", () => {
    expect(chooseSatelliteZoom(150_000)).toBe(11);
  });

  test("maps mid camera distances to z13 and z14", () => {
    expect(chooseSatelliteZoom(65_000)).toBe(13);
    expect(chooseSatelliteZoom(30_000)).toBe(14);
  });

  test("maps near camera distances to z15 and z16", () => {
    expect(chooseSatelliteZoom(18_000)).toBe(15);
    expect(chooseSatelliteZoom(8_000)).toBe(16);
  });

  test("uses hysteresis when moving away from a higher zoom", () => {
    expect(chooseSatelliteZoom(24_000, 15)).toBe(15);
    expect(chooseSatelliteZoom(28_000, 15)).toBe(14);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd app/lancangriver/client && npm test -- test/satellite-lod.test.ts`
Expected: FAIL because `chooseSatelliteZoom` does not yet support z13 through z16.

- [ ] **Step 3: Implement the zoom selector**

```ts
export function chooseSatelliteZoom(
  distanceToTile: number,
  currentZoom?: number,
): number {
  // Map distance bands to z11..z16, with hysteresis around each band edge.
}
```

Use a stable band table such as:

- z11: `>= 120_000`
- z12: `70_000 .. 120_000`
- z13: `40_000 .. 70_000`
- z14: `22_000 .. 40_000`
- z15: `12_000 .. 22_000`
- z16: `< 12_000`

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd app/lancangriver/client && npm test -- test/satellite-lod.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/view/satellite-lod.ts app/lancangriver/client/test/satellite-lod.test.ts
git commit -m "feat: add satellite zoom bands through z16"
```

## Task 2: Add Satellite Tile Coverage and Texture Compositing

**Files:**

- Create: `app/lancangriver/client/src/view/satellite-texture-compositor.ts`
- Create: `app/lancangriver/client/test/satellite-texture-compositor.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { enumerateSatelliteCoverage } from "../src/view/satellite-texture-compositor";

describe("enumerateSatelliteCoverage", () => {
  test("returns a 2x2 coverage grid for z11 to z12", () => {
    const tiles = enumerateSatelliteCoverage({ z: 11, x: 100, y: 200 }, 12);
    expect(tiles).toHaveLength(4);
  });

  test("returns a 16x16 coverage grid for z11 to z15", () => {
    const tiles = enumerateSatelliteCoverage({ z: 11, x: 100, y: 200 }, 15);
    expect(tiles).toHaveLength(256);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd app/lancangriver/client && npm test -- test/satellite-texture-compositor.test.ts`
Expected: FAIL because the compositor helper does not exist yet.

- [ ] **Step 3: Implement the compositor helper**

```ts
import type { TileKey } from "./request-scheduler";

export type SatelliteCoverageTile = TileKey & {
  offsetX: number;
  offsetY: number;
};

export function enumerateSatelliteCoverage(
  demTile: TileKey,
  targetZoom: number,
): SatelliteCoverageTile[] {
  // Return every child tile needed to cover the DEM tile at targetZoom.
}
```

Also add a canvas compositor entry point that:

- fetches all required JPEGs
- draws them into a single `CanvasTexture`
- marks the texture as sRGB
- disposes the source textures after drawing

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd app/lancangriver/client && npm test -- test/satellite-texture-compositor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/view/satellite-texture-compositor.ts app/lancangriver/client/test/satellite-texture-compositor.test.ts
git commit -m "feat: composite high zoom satellite textures"
```

## Task 3: Add Request Budgeting for Satellite Texture Updates

**Files:**

- Create: `app/lancangriver/client/src/view/satellite-request-budget.ts`
- Create: `app/lancangriver/client/test/satellite-request-budget.test.ts`
- Modify: `app/lancangriver/client/src/main.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { createSatelliteRequestBudget } from "../src/view/satellite-request-budget";

describe("satellite request budget", () => {
  test("limits concurrent updates", () => {
    const budget = createSatelliteRequestBudget(4, 8);
    expect(budget.canStartNewRequest()).toBe(true);
  });

  test("prioritizes closer tiles first", () => {
    const budget = createSatelliteRequestBudget(1, 8);
    budget.enqueue({ tileId: "11/1/1", distance: 80_000 });
    budget.enqueue({ tileId: "11/2/2", distance: 20_000 });
    expect(budget.dequeue()?.tileId).toBe("11/2/2");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd app/lancangriver/client && npm test -- test/satellite-request-budget.test.ts`
Expected: FAIL because the budget module does not exist yet.

- [ ] **Step 3: Implement the budget queue**

```ts
export function createSatelliteRequestBudget(
  maxPerFrame: number,
  maxConcurrent: number,
) {
  // Track pending, running, and completed satellite texture requests.
}
```

The budget must:

- cap in-flight requests
- cap per-frame starts
- drop stale queued requests for tiles that have already moved to a newer zoom
- sort by smaller camera distance first

- [ ] **Step 4: Integrate budget into `main.ts`**

Update the tile runtime so that:

- z11 DEM loads once per visible tile
- satellite zoom is recomputed on camera changes
- only budget-approved upgrades start fetching
- completed requests are ignored if they are stale

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd app/lancangriver/client && npm test -- test/satellite-request-budget.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lancangriver/client/src/view/satellite-request-budget.ts app/lancangriver/client/src/main.ts app/lancangriver/client/test/satellite-request-budget.test.ts
git commit -m "feat: budget satellite texture requests"
```

## Task 4: Wire Runtime Diagnostics and Final Validation

**Files:**

- Modify: `app/lancangriver/client/src/ui/diagnostics.ts`
- Modify: `app/lancangriver/client/src/ui/camera-gui.ts`
- Modify: `app/lancangriver/client/src/main.ts`

- [ ] **Step 1: Update diagnostics**

Add fields for:

- active satellite zoom counts
- pending satellite requests
- stale request drops

- [ ] **Step 2: Add a debug freeze toggle**

In the camera GUI, add one toggle that freezes satellite LOD at the current zoom for inspection.

- [ ] **Step 3: Run the full client test suite**

Run: `cd app/lancangriver/client && npm test`
Expected: PASS.

- [ ] **Step 4: Run the client build**

Run: `cd app/lancangriver/client && npm run build`
Expected: PASS with only the existing chunk-size warning, if any.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/ui/diagnostics.ts app/lancangriver/client/src/ui/camera-gui.ts app/lancangriver/client/src/main.ts
git commit -m "feat: wire dynamic satellite LOD diagnostics"
```

## Acceptance Criteria

1. DEM geometry stays fixed at z11 for every mesh.
2. Satellite JPEG LOD scales from z11 through z16 based on camera distance.
3. Higher zoom textures are assembled from the correct child tiles and cached long enough to prevent flicker.
4. Request budgeting prevents excessive concurrent fetches during fast camera movement.
5. The app remains stable under pan/zoom and the build still passes.

## Execution Notes

- Keep all tile math in the view helpers, not in `main.ts`.
- Do not change the raster server contract for DEM; only the satellite JPEG path changes.
- Prefer small commits after each task so regressions are easy to isolate.
