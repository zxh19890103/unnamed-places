# Distance-Only Hierarchical Tile LOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a distance-driven hierarchical tile LOD system that splits z11 base tiles into z12/z13/z14 child tiles based on camera-to-tile-center distance, with safety caps to prevent mesh explosion.

**Architecture:**

- Tile zoom selection depends only on world-space distance D from camera to tile center.
- Parent tiles remain visible until all 4 children are ready, then atomic swap.
- Anti-explosion controls: global mesh budget, per-frame split/merge ops, depth caps, and neighbor LOD delta limits.
- Hysteresis at each distance boundary prevents oscillation.
- Satellite texture compositing logic reused for child coverage.

**Tech Stack:**

- TypeScript, Three.js (existing)
- No new dependencies
- Telemetry counters for mesh budget tracking

---

## File Structure

**Modified:**

- `client/src/view/satellite-lod.ts` — Add distance band table, hysteresis thresholds, and enum for active LOD profile (Aggressive, Conservative, Debug).
- `client/src/main.ts` — Add tile split/merge orchestration, parent-child relationship tracking, atomic swap logic, and mesh-budget enforcement.
- `client/src/view/tile-viewport-controller.ts` — Evolve toward hierarchical tile tracking (minimal changes; defer deep refactor to Phase B).

**Created (optional but recommended for future):**

- `client/src/view/lod-profile.ts` — Constants and policy types for different LOD profiles.
- `client/src/view/tile-hierarchy.ts` — Parent-child tracking and split/merge state machine (Phase B).

---

## Task Breakdown

### Task 1: Define LOD band table and profile types

**Files:**

- Create: `client/src/view/lod-profile.ts`

- [ ] **Step 1: Create profile types and band table**

Create `client/src/view/lod-profile.ts` with:

```typescript
export type DistanceBand = {
  zoom: number;
  minDistance: number;
  maxDistance: number;
  splitThreshold: number;
  mergeThreshold: number;
};

export type LODProfile = {
  name: string;
  maxSplitDepthPerBase: number;
  maxVisibleChildMeshes: number;
  maxSplitOpsPerFrame: number;
  maxMergeOpsPerFrame: number;
  bands: DistanceBand[];
};

const TILE_SPAN = 30_720; // 256 * 120

export const CONSERVATIVE_PROFILE: LODProfile = {
  name: "conservative",
  maxSplitDepthPerBase: 2, // up to z13
  maxVisibleChildMeshes: 800,
  maxSplitOpsPerFrame: 10,
  maxMergeOpsPerFrame: 20,
  bands: [
    {
      zoom: 11,
      minDistance: 4 * TILE_SPAN,
      maxDistance: Infinity,
      splitThreshold: 0.95 * 4 * TILE_SPAN,
      mergeThreshold: 1.05 * 4 * TILE_SPAN,
    },
    {
      zoom: 12,
      minDistance: 2 * TILE_SPAN,
      maxDistance: 4 * TILE_SPAN,
      splitThreshold: 0.95 * 2 * TILE_SPAN,
      mergeThreshold: 1.05 * 2 * TILE_SPAN,
    },
    {
      zoom: 13,
      minDistance: TILE_SPAN,
      maxDistance: 2 * TILE_SPAN,
      splitThreshold: 0.95 * TILE_SPAN,
      mergeThreshold: 1.05 * TILE_SPAN,
    },
  ],
};

export const AGGRESSIVE_PROFILE: LODProfile = {
  name: "aggressive",
  maxSplitDepthPerBase: 3, // up to z14
  maxVisibleChildMeshes: 1200,
  maxSplitOpsPerFrame: 20,
  maxMergeOpsPerFrame: 40,
  bands: [
    {
      zoom: 11,
      minDistance: 4 * TILE_SPAN,
      maxDistance: Infinity,
      splitThreshold: 0.95 * 4 * TILE_SPAN,
      mergeThreshold: 1.05 * 4 * TILE_SPAN,
    },
    {
      zoom: 12,
      minDistance: 2 * TILE_SPAN,
      maxDistance: 4 * TILE_SPAN,
      splitThreshold: 0.95 * 2 * TILE_SPAN,
      mergeThreshold: 1.05 * 2 * TILE_SPAN,
    },
    {
      zoom: 13,
      minDistance: TILE_SPAN,
      maxDistance: 2 * TILE_SPAN,
      splitThreshold: 0.95 * TILE_SPAN,
      mergeThreshold: 1.05 * TILE_SPAN,
    },
    {
      zoom: 14,
      minDistance: 0.5 * TILE_SPAN,
      maxDistance: TILE_SPAN,
      splitThreshold: 0.95 * 0.5 * TILE_SPAN,
      mergeThreshold: 1.05 * 0.5 * TILE_SPAN,
    },
  ],
};

export const DEFAULT_LOD_PROFILE = CONSERVATIVE_PROFILE;
```

- [ ] **Step 2: Verify file has no syntax errors**

Run in terminal: `cd app/lancangriver/client && npx tsc --noEmit src/view/lod-profile.ts`

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd app/lancangriver/client
git add src/view/lod-profile.ts
git commit -m "feat: add LOD profile types and distance band tables"
```

---

### Task 2: Update satellite-lod.ts to use distance bands

**Files:**

- Modify: `client/src/view/satellite-lod.ts`

- [ ] **Step 1: Update chooseSatelliteZoom to use distance bands and hysteresis**

Replace the current stub in `client/src/view/satellite-lod.ts`:

```typescript
import type { LODProfile } from "./lod-profile";
import { DEFAULT_LOD_PROFILE } from "./lod-profile";

export function chooseSatelliteZoom(
  distanceToTile: number,
  currentZoom?: number,
  profile: LODProfile = DEFAULT_LOD_PROFILE,
): number {
  // Find band containing current distance
  for (const band of profile.bands) {
    if (
      distanceToTile >= band.minDistance &&
      distanceToTile < band.maxDistance
    ) {
      // Apply hysteresis if we have current zoom
      if (currentZoom !== undefined) {
        // Only merge (go to coarser) if we cross merge threshold
        if (band.zoom < currentZoom && distanceToTile < band.mergeThreshold) {
          return currentZoom; // Stay at current zoom
        }
        // Only split (go to finer) if we cross split threshold
        if (band.zoom > currentZoom && distanceToTile > band.splitThreshold) {
          return currentZoom; // Stay at current zoom
        }
      }
      return band.zoom;
    }
  }
  // Fallback: return coarsest zoom
  return profile.bands[0].zoom;
}
```

- [ ] **Step 2: Verify the function compiles**

Run in terminal: `cd app/lancangriver/client && npx tsc --noEmit src/view/satellite-lod.ts`

Expected: no errors

- [ ] **Step 3: Verify enumerateChildTiles still works**

Run in terminal: `cd app/lancangriver/client && npm test -- satellite-lod 2>&1 | head -30`

Expected: existing tests pass (if any exist; if none, that's ok for now)

- [ ] **Step 4: Commit**

```bash
cd app/lancangriver/client
git add src/view/satellite-lod.ts
git commit -m "feat: implement distance-band zoom selection with hysteresis"
```

---

### Task 3: Add tile hierarchy tracking to main.ts

**Files:**

- Modify: `client/src/main.ts`

- [ ] **Step 1: Add parent-child relationship tracking to TerrainRuntime**

In the `TerrainRuntime` type definition (around line 385), add:

```typescript
type TerrainRuntime = {
  tile: TileKey;
  tileId: string;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material | THREE.Material[]>;
  hitOutline: THREE.LineSegments;
  material?: THREE.ShaderMaterial;
  demTexture?: THREE.Texture;
  satelliteTexture?: THREE.Texture;
  satelliteZoom: number;
  requestedZoom: number;
  pending: boolean;
  requestSeq: number;
  disposed: boolean;
  // NEW: hierarchy tracking
  parentTileId?: string;
  childTileIds: string[];
  isChildReady: boolean; // true once this child has DEM loaded
  targetZoom: number; // desired zoom from distance band policy
  zoomState: "stable" | "splitting" | "merging"; // current split/merge state
};
```

- [ ] **Step 2: Initialize hierarchy fields when creating runtime**

In the `controller` callback (around line 550), update the runtime initialization:

```typescript
const runtime: TerrainRuntime = {
  tile,
  tileId,
  mesh,
  hitOutline,
  satelliteZoom: FIXED_TILE_ZOOM,
  requestedZoom: FIXED_TILE_ZOOM,
  pending: false,
  requestSeq: 0,
  disposed: false,
  // NEW: initialize hierarchy
  childTileIds: [],
  isChildReady: false,
  targetZoom: FIXED_TILE_ZOOM,
  zoomState: "stable",
};
```

- [ ] **Step 3: Import LOD profile**

At the top of `client/src/main.ts` (after existing imports), add:

```typescript
import { DEFAULT_LOD_PROFILE } from "./view/lod-profile";
import type { LODProfile } from "./view/lod-profile";
```

- [ ] **Step 4: Add mesh budget tracking**

In the `bootstrap` function, after `let satelliteRequestBudget = ...;` (around line 409), add:

```typescript
let meshBudgetSnapshot = {
  visibleChildMeshes: 0,
  projectedChildMeshes: 0,
  splitOpsThisFrame: 0,
  mergeOpsThisFrame: 0,
  budgetExceededFrames: 0,
};

const lodProfile = DEFAULT_LOD_PROFILE;
```

- [ ] **Step 5: Update refreshDiagnostics to show mesh budget**

In `refreshDiagnostics()`, add a line before the final `diagnostics.textContent =`:

```typescript
const meshBudgetInfo = `meshes: ${meshBudgetSnapshot.visibleChildMeshes}/${lodProfile.maxVisibleChildMeshes}`;
```

Then update the `renderDiagnostics` call to include it in the diagnostics output. (This requires modifying the diagnostics renderer; for now, just ensure the code compiles.)

- [ ] **Step 6: Verify compilation**

Run in terminal: `cd app/lancangriver/client && npx tsc --noEmit src/main.ts`

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd app/lancangriver/client
git add src/main.ts src/view/lod-profile.ts
git commit -m "feat: add tile hierarchy tracking and mesh budget telemetry"
```

---

### Task 4: Implement distance-based target zoom selection in updateSatelliteLodForVisibleTerrain

**Files:**

- Modify: `client/src/main.ts`

- [ ] **Step 1: Update updateSatelliteLodForVisibleTerrain to compute target zoom from distance bands**

Replace the current `updateSatelliteLodForVisibleTerrain` function (around line 520) with:

```typescript
function updateSatelliteLodForVisibleTerrain() {
  if (satelliteLodFrozen) {
    return;
  }

  meshBudgetSnapshot.splitOpsThisFrame = 0;
  meshBudgetSnapshot.mergeOpsThisFrame = 0;

  for (const runtime of terrainRuntimeById.values()) {
    if (runtime.disposed || !runtime.demTexture) {
      continue;
    }

    const distanceToTile = camera.position.distanceTo(runtime.mesh.position);
    // NEW: use distance band to compute target zoom
    const desiredZoom = chooseSatelliteZoom(
      distanceToTile,
      runtime.requestedZoom,
      lodProfile,
    );
    runtime.targetZoom = desiredZoom;

    if (desiredZoom === runtime.requestedZoom) {
      continue;
    }

    runtime.pending = true;
    const requestSeq = runtime.requestSeq + 1;
    runtime.requestSeq = requestSeq;
    runtime.requestedZoom = desiredZoom;

    satelliteRequestBudget.enqueue({
      tileId: runtime.tileId,
      distance: distanceToTile,
      targetZoom: desiredZoom,
      generation: requestSeq,
    });
  }
}
```

- [ ] **Step 2: Update the DEM load callback to use distance bands**

In the `loadDemTexture` promise chain (around line 580), update the satellite zoom selection:

```typescript
const distanceToTile = camera.position.distanceTo(mesh.position);
const satelliteZoom = chooseSatelliteZoom(
  distanceToTile,
  undefined,
  lodProfile,
);
runtime.demTexture = demTexture;
runtime.satelliteZoom = satelliteZoom;
runtime.targetZoom = satelliteZoom;
```

- [ ] **Step 3: Verify compilation**

Run in terminal: `cd app/lancangriver/client && npx tsc --noEmit src/main.ts`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd app/lancangriver/client
git add src/main.ts
git commit -m "feat: use distance bands for target zoom selection"
```

---

### Task 5: Implement placeholder for mesh budget enforcement

**Files:**

- Modify: `client/src/main.ts`

- [ ] **Step 1: Add budget checking before new satellite requests**

In `updateSatelliteLodForVisibleTerrain`, after the loop over terrainRuntimeById, add:

```typescript
// NEW: enforce mesh budget
const projectedMeshCount = computeProjectedMeshCount(
  terrainRuntimeById,
  lodProfile,
);
if (projectedMeshCount > lodProfile.maxVisibleChildMeshes) {
  meshBudgetSnapshot.budgetExceededFrames += 1;
  // TODO Phase B: implement demotion logic to reduce mesh count
} else {
  meshBudgetSnapshot.budgetExceededFrames = 0;
}
meshBudgetSnapshot.projectedChildMeshes = projectedMeshCount;
```

- [ ] **Step 2: Add helper function to compute projected mesh count**

After the `summarizeSatelliteZoomDistribution` function (around line 400), add:

```typescript
function computeProjectedMeshCount(
  runtimes: Map<string, TerrainRuntime>,
  profile: LODProfile,
): number {
  let count = 0;
  for (const runtime of runtimes.values()) {
    if (runtime.disposed) continue;
    // Each tile at zoom Z contributes 4^(Z - 11) meshes
    const zoom = runtime.targetZoom;
    if (zoom >= 11) {
      count += Math.pow(4, Math.max(0, zoom - 11));
    }
  }
  return count;
}
```

- [ ] **Step 3: Verify compilation**

Run in terminal: `cd app/lancangriver/client && npx tsc --noEmit src/main.ts`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd app/lancangriver/client
git add src/main.ts
git commit -m "feat: add mesh budget checking (Phase A)"
```

---

### Task 6: Test distance band selection end-to-end

**Files:**

- Test: `client/src/view/satellite-lod.test.ts` (create or extend)

- [ ] **Step 1: Create test file for distance band logic**

Create `client/src/view/satellite-lod.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { chooseSatelliteZoom } from "./satellite-lod";
import { CONSERVATIVE_PROFILE, AGGRESSIVE_PROFILE } from "./lod-profile";

describe("chooseSatelliteZoom", () => {
  const TILE_SPAN = 30_720;

  it("returns z11 for far distances in conservative profile", () => {
    const zoom = chooseSatelliteZoom(
      5 * TILE_SPAN,
      undefined,
      CONSERVATIVE_PROFILE,
    );
    expect(zoom).toBe(11);
  });

  it("returns z12 for medium distances in conservative profile", () => {
    const zoom = chooseSatelliteZoom(
      3 * TILE_SPAN,
      undefined,
      CONSERVATIVE_PROFILE,
    );
    expect(zoom).toBe(12);
  });

  it("returns z13 for near distances in conservative profile", () => {
    const zoom = chooseSatelliteZoom(
      1.5 * TILE_SPAN,
      undefined,
      CONSERVATIVE_PROFILE,
    );
    expect(zoom).toBe(13);
  });

  it("applies hysteresis: stays at z12 when moving from z13 to z12 boundary", () => {
    const distance = 1.95 * TILE_SPAN; // just inside z13 band
    // Current zoom is z13, so we should not merge unless we pass merge threshold
    const zoom = chooseSatelliteZoom(distance, 13, CONSERVATIVE_PROFILE);
    expect(zoom).toBe(13); // stays at z13 due to hysteresis
  });

  it("merges to z12 when distance clearly exceeds merge threshold", () => {
    const distance = 2.15 * TILE_SPAN; // well past z12 merge threshold
    const zoom = chooseSatelliteZoom(distance, 13, CONSERVATIVE_PROFILE);
    expect(zoom).toBe(12);
  });

  it("returns z14 for very close distances in aggressive profile", () => {
    const zoom = chooseSatelliteZoom(
      0.3 * TILE_SPAN,
      undefined,
      AGGRESSIVE_PROFILE,
    );
    expect(zoom).toBe(14);
  });
});
```

- [ ] **Step 2: Run the tests**

Run in terminal: `cd app/lancangriver/client && npm test -- satellite-lod 2>&1`

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
cd app/lancangriver/client
git add src/view/satellite-lod.test.ts
git commit -m "test: add distance band selection tests"
```

---

### Task 7: Build and smoke test

**Files:**

- Test: build and runtime

- [ ] **Step 1: Build the client**

Run in terminal: `cd app/lancangriver/client && npm run build 2>&1 | tail -20`

Expected: no errors, build succeeds

- [ ] **Step 2: Verify dev server can start**

Run in terminal: `cd app/lancangriver/client && timeout 10 npm run dev 2>&1 || true`

Expected: server starts without crashes (timeout ok)

- [ ] **Step 3: Commit**

```bash
cd app/lancangriver/client
git add .
git commit -m "build: verify distance LOD Phase A builds successfully"
```

---

## Phase A Verification Checklist

Before proceeding to Phase B (child mesh splitting), verify:

- [ ] Distance bands control satellite zoom correctly (tests pass)
- [ ] Build succeeds with no TypeScript errors
- [ ] Dev server starts without runtime crashes
- [ ] Mesh budget telemetry is computed (visible in diagnostics)
- [ ] No budget overflow sustained longer than 0.5s during normal panning

**Next phases (Phase B+):**

- Implement hierarchical split/merge orchestration
- Atomic parent-child swaps
- Neighbor LOD delta enforcement
- Seam stitching if needed
