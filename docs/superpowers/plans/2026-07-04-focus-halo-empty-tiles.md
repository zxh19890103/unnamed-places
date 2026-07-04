# Focus Halo Empty Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add symmetric focus halo tiles with role metadata so only halo tiles render with a dedicated empty checker/gradient material while core tiles keep normal textures.

**Architecture:** Keep focus-halo logic scoped to the focus path in setup. Extend tile node data with a narrow optional role used only when set by getFocusNeighborTiles flow. Add a dedicated TileEmptyMaterial and map halo role to that material during tile creation, while preserving all non-focus and non-role paths.

**Tech Stack:** TypeScript, Three.js ShaderMaterial/MeshBasicMaterial, Vitest, Vite client build

---

## File Structure Map

- Modify: `app/lancangriver/client/src/calc/types.ts`
  - Add focus role type and optional role field on tile nodes.
- Modify: `app/lancangriver/client/src/explore/TilesManager.class.ts`
  - Allow `setNodes` to accept role-tagged inputs and persist role onto `TileNode`.
- Create: `app/lancangriver/client/src/explore/materials/TileEmptyMaterial.class.ts`
  - Dedicated empty visual material with checker/gradient look, no texture loading.
- Modify: `app/lancangriver/client/src/explore/SphereTile.class.ts`
  - Include empty material in supported surface materials and helper APIs.
- Modify: `app/lancangriver/client/src/explore/setup.ts`
  - Make `getFocusNeighborTiles` halo-aware with symmetric `[n, m]`, assign roles for focus path only, and apply empty material for halo role.
- Create: `app/lancangriver/client/src/explore/focus-halo.test.ts`
  - Unit tests for halo tile selection, role split, dedup, wrap/clamp invariants.
- Modify: `app/lancangriver/client/src/explore/TilesManager.class.test.ts`
  - Verify role metadata survives node reconciliation.

### Task 1: Add Role Types And Role-Aware Tile Nodes

**Files:**
- Modify: `app/lancangriver/client/src/calc/types.ts`
- Modify: `app/lancangriver/client/src/explore/TilesManager.class.ts`
- Test: `app/lancangriver/client/src/explore/TilesManager.class.test.ts`

- [ ] **Step 1: Write the failing role propagation test**

```ts
import { describe, expect, it, vi } from "vitest";
import { TilesManager } from "./TilesManager.class";

describe("TilesManager role metadata", () => {
  it("preserves focusRole on created nodes", () => {
    vi.useFakeTimers();
    const manager = new TilesManager();
    const createdRoles: Array<"core" | "halo" | undefined> = [];

    manager.onTileCreate = (node) => {
      createdRoles.push(node.focusRole);
    };

    manager.setNodes([
      { z: 11, x: 1200, y: 900, focusRole: "core" },
      { z: 11, x: 1201, y: 900, focusRole: "halo" },
    ]);

    vi.runAllTimers();

    expect(createdRoles).toEqual(["core", "halo"]);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/TilesManager.class.test.ts
```

Expected: FAIL with type errors or `focusRole` undefined.

- [ ] **Step 3: Implement minimal role support in types and manager**

```ts
// src/calc/types.ts
export type FocusTileRole = "core" | "halo";

export interface ITileNode {
  state: TileNodeState;
  focusRole?: FocusTileRole;
}
```

```ts
// src/explore/TilesManager.class.ts
export type TileNodeInput = SphereTileKey & { focusRole?: FocusTileRole };

constructor(readonly key: SphereTileKey, readonly focusRole?: FocusTileRole) {
  this.x = key.x;
  this.y = key.y;
  this.z = key.z;
}

setNodes(nextKeys: TileNodeInput[]) {
  const currentByKey = new Map<string, TileNode>();
  for (const node of this.nodes) {
    currentByKey.set(this.keyOf(node.key), node);
  }

  const nextByKey = new Map<string, TileNodeInput>();
  for (const key of nextKeys) {
    nextByKey.set(this.keyOf(key), key);
  }

  const reconciled: TileNode[] = [];

  for (const [id, nextKey] of nextByKey) {
    if (currentByKey.has(id)) {
      reconciled.push(currentByKey.get(id)!);
      continue;
    }

    const created = new TileNode(nextKey, nextKey.focusRole);
    created.state = TileNodeState.toCreate;
    reconciled.push(created);
  }

  this.nodes = reconciled;
  this.scheduleNodeStateTransitionProcessing();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/TilesManager.class.test.ts
```

Expected: PASS for role propagation assertions.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/calc/types.ts app/lancangriver/client/src/explore/TilesManager.class.ts app/lancangriver/client/src/explore/TilesManager.class.test.ts
git commit -m "feat(client): add focus role support on tile nodes"
```

### Task 2: Add Dedicated TileEmptyMaterial

**Files:**
- Create: `app/lancangriver/client/src/explore/materials/TileEmptyMaterial.class.ts`
- Modify: `app/lancangriver/client/src/explore/SphereTile.class.ts`
- Test: `app/lancangriver/client/src/explore/focus-halo.test.ts`

- [ ] **Step 1: Write failing material selection test scaffold**

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SphereTile } from "./SphereTile.class";
import { TileEmptyMaterial } from "./materials/TileEmptyMaterial.class";

describe("SphereTile empty material", () => {
  it("switches to empty material for halo role", () => {
    const tile = new SphereTile({} as any, {} as any, { z: 11, x: 1, y: 1 }, {});
    tile.setEmptyMaterial();
    expect(tile.material).toBeInstanceOf(TileEmptyMaterial);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts
```

Expected: FAIL because `TileEmptyMaterial`/`setEmptyMaterial` does not exist.

- [ ] **Step 3: Implement empty material and SphereTile hook**

```ts
// src/explore/materials/TileEmptyMaterial.class.ts
import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
varying vec2 vUv;
void main() {
  vec2 cell = floor(vUv * 12.0);
  float checker = mod(cell.x + cell.y, 2.0);
  vec3 a = vec3(0.84, 0.88, 0.92);
  vec3 b = vec3(0.76, 0.81, 0.87);
  float grad = smoothstep(0.0, 1.0, vUv.y);
  vec3 base = mix(a, b, checker);
  vec3 color = mix(base, base * 0.92, grad);
  gl_FragColor = vec4(color, 1.0);
}`;

export class TileEmptyMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      side: THREE.BackSide,
      vertexShader,
      fragmentShader,
    });
  }
}
```

```ts
// src/explore/SphereTile.class.ts
import { TileEmptyMaterial } from "./materials/TileEmptyMaterial.class";

type TileSurfaceMaterial =
  | TileBasicMaterial
  | TileDemMaterial
  | TileDemAdvanceMaterial
  | TileEmptyMaterial;

setEmptyMaterial(): void {
  if (this.material instanceof TileEmptyMaterial) {
    return;
  }
  const prev = this.material;
  this.material = new TileEmptyMaterial();
  prev.dispose();
}

isEmptyMaterial(): boolean {
  return this.material instanceof TileEmptyMaterial;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts
```

Expected: PASS for empty-material assignment.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/explore/materials/TileEmptyMaterial.class.ts app/lancangriver/client/src/explore/SphereTile.class.ts app/lancangriver/client/src/explore/focus-halo.test.ts
git commit -m "feat(client): add dedicated empty tile material"
```

### Task 3: Implement Halo Expansion In getFocusNeighborTiles

**Files:**
- Modify: `app/lancangriver/client/src/explore/setup.ts`
- Test: `app/lancangriver/client/src/explore/focus-halo.test.ts`

- [ ] **Step 1: Write failing halo-selection tests**

```ts
import { describe, expect, it } from "vitest";
import { buildFocusNeighbors } from "./setup";

describe("focus halo selection", () => {
  it("returns zero halo tiles for [0,0]", () => {
    const out = buildFocusNeighbors({ lat: 40.7, lng: 14.4 }, [0, 0]);
    expect(out.haloTiles).toHaveLength(0);
  });

  it("creates symmetric halo for [1,1]", () => {
    const out = buildFocusNeighbors({ lat: 40.7, lng: 14.4 }, [1, 1]);
    expect(out.haloTiles.length).toBeGreaterThan(0);
    expect(out.focusTilesWithRole.some((t) => t.role === "halo")).toBe(true);
  });

  it("has no duplicate keys", () => {
    const out = buildFocusNeighbors({ lat: 40.7, lng: 14.4 }, [2, 3]);
    const ids = out.focusTilesWithRole.map((t) => `${t.key.z}/${t.key.x}/${t.key.y}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts
```

Expected: FAIL because `buildFocusNeighbors` and halo output do not exist.

- [ ] **Step 3: Implement halo-aware focus helper in setup**

```ts
// src/explore/setup.ts
const FOCUS_HALO: readonly [number, number] = [1, 1];

export function buildFocusNeighbors(centerLatlng: LatLng, halo: readonly [number, number]) {
  // produce coreFocusTiles, haloTiles, focusTilesWithRole
}

const getFocusNeighborTiles = (centerLatlng: LatLng) => {
  return buildFocusNeighbors(centerLatlng, FOCUS_HALO);
};
```

Implementation rules:
- Keep x wrapping and y clamping identical to existing behavior.
- Core rectangle remains from `FOCUS_TILE_EXTENT`.
- Expanded rectangle uses symmetric halo `[n,m]`.
- `haloTiles = expanded - core`.
- Return stable deterministic order and deduped keys.

- [ ] **Step 4: Run halo tests to verify pass**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts
```

Expected: PASS for halo split, symmetry and dedup checks.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/explore/setup.ts app/lancangriver/client/src/explore/focus-halo.test.ts
git commit -m "feat(client): add symmetric focus halo tile selection"
```

### Task 4: Wire Role-Based Material Assignment In Focus Flow

**Files:**
- Modify: `app/lancangriver/client/src/explore/setup.ts`
- Test: `app/lancangriver/client/src/explore/focus-halo.test.ts`

- [ ] **Step 1: Write failing setup-level tests for role mapping and material protection**

```ts
import { describe, expect, it } from "vitest";
import { buildFocusNeighbors } from "./setup";

describe("focus halo role wiring", () => {
  it("marks only expanded-minus-core tiles as halo", () => {
    const out = buildFocusNeighbors({ lat: 40.746, lng: 14.498 }, [1, 2]);
    const roles = out.focusTilesWithRole.map((t) => t.role);

    expect(roles.includes("halo")).toBe(true);
    expect(roles.includes("core")).toBe(true);
    expect(out.coreFocusTiles.length + out.haloTiles.length).toBe(
      out.focusTilesWithRole.length,
    );
  });
});

describe("applyMaterialMode guard list", () => {
  it("collects halo ids for skip logic", () => {
    const out = buildFocusNeighbors({ lat: 40.746, lng: 14.498 }, [1, 1]);
    const haloIdSet = new Set(
      out.haloTiles.map((k) => `${k.z}/${k.x}/${k.y}`),
    );

    expect(haloIdSet.size).toBe(out.haloTiles.length);
    expect(haloIdSet.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts
```

Expected: FAIL because role-aware outputs / skip-guard wiring are not implemented.

- [ ] **Step 3: Implement role-aware wiring in setup**

```ts
// src/explore/setup.ts
const { focusTilesWithRole, focusTiles, centerTile } = getFocusNeighborTiles(centerLatlng);
tileManager.setNodes(focusTilesWithRole.map(({ key, role }) => ({ ...key, focusRole: role })));

tileManager.onTileCreate = (node) => {
  const tile = sphereGlobal.createTileByKey(node.key);
  tile.$tNode = node;
  if (node.focusRole === "halo") {
    tile.setEmptyMaterial();
  } else {
    tile.setMaterialMode(terrainState.materialMode);
  }
  node.tile = tile;
};

const applyMaterialModeToAttachedTiles = (mode: TileMaterialMode) => {
  for (const node of tileManager.getAttachedNodes()) {
    if (node.focusRole === "halo") continue;
    node.tile?.setMaterialMode(mode);
  }
};
```

- [ ] **Step 4: Run targeted tests and client checks**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts src/explore/TilesManager.class.test.ts
cd app/lancangriver/client && npm test
cd app/lancangriver/client && npm run build
```

Expected:
- Targeted tests PASS
- Full test run: no new failures introduced by this change
- Build PASS

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/explore/setup.ts app/lancangriver/client/src/explore/focus-halo.test.ts
git commit -m "feat(client): render focus halo tiles with empty material"
```

### Task 5: Final Verification And Documentation Delta

**Files:**
- None required

- [ ] **Step 1: Verify changed files are only expected scope**

Run:
```bash
git status --short
```

Expected: only files from Tasks 1-4 (and optional README note) are changed.

- [ ] **Step 2: Run final focused regression checks**

Run:
```bash
cd app/lancangriver/client && npx vitest run src/explore/focus-halo.test.ts src/explore/TilesManager.class.test.ts src/explore/visibleTiles.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build one more time**

Run:
```bash
cd app/lancangriver/client && npm run build
```

Expected: PASS with no type/build errors.

- [ ] **Step 4: Commit final verification checkpoint**

```bash
git add app/lancangriver/client/src/explore/setup.ts app/lancangriver/client/src/explore/focus-halo.test.ts app/lancangriver/client/src/explore/TilesManager.class.ts app/lancangriver/client/src/explore/SphereTile.class.ts app/lancangriver/client/src/explore/materials/TileEmptyMaterial.class.ts app/lancangriver/client/src/calc/types.ts
git commit -m "chore(client): finalize focus halo empty tile verification"
```
