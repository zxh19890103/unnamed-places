# Focus Halo Empty Tiles Design

Date: 2026-07-04
Scope: app/lancangriver/client focus flow in explore setup
Status: Approved in conversation, ready for implementation planning

## 1. Goal

Render an additional halo region around focused tiles with empty-color materials:
- Add halo using symmetric expansion with `halo = [n, m]`.
- `n` controls lat-direction expansion (north + south rows).
- `m` controls lon-direction expansion (west + east columns).
- Halo tiles use a dedicated `TileEmptyMaterial.class` (checker/gradient color only, no texture fetch).
- Core focus tiles remain normal textured terrain tiles.

## 2. Confirmed Decisions

1. Halo expansion rule: symmetric on both sides.
2. Empty rendering scope: only newly added halo tiles.
3. Empty visual style: subtle checker/gradient style.
4. Material class: create dedicated `TileEmptyMaterial.class` for halo tiles.
5. Halo config source: fixed constants in scene setup for now.
6. Structural approach: Approach 2 (role-based), but narrowly scoped to tiles generated from `getFocusNeighborTiles` flow.

## 3. Non-Goals

- No changes to generic viewport-driven tile streaming (`refreshVisibleTiles` path).
- No global tile role system across all tile manager use cases.
- No GUI for changing halo size in this iteration.

## 4. Architecture Boundary

### In-scope boundary

- `getFocusNeighborTiles` becomes halo-aware and role-aware for focus flow only.
- Focus flow returns role-tagged tile information.
- Tile creation assigns `TileEmptyMaterial` only when role is `halo`.

### Out-of-scope boundary

- Non-focus paths continue using existing tile keys and existing material logic.
- Existing DEM/basic mode switching remains unchanged for non-halo tiles.

## 5. Data Model and Role Encoding

Introduce a narrow role model used only by focus-generated tiles:

- `FocusTileRole = "core" | "halo"`
- `FocusTileDescriptor = { key: SphereTileKey; role: FocusTileRole }`

Return shape from focus helper:

- `centerTile: SphereTileKey`
- `coreFocusTiles: SphereTileKey[]`
- `haloTiles: SphereTileKey[]`
- `focusTilesWithRole: FocusTileDescriptor[]`

## 6. Tile Selection Logic

Given current core rectangle (`FOCUS_TILE_EXTENT`) and `halo = [n, m]`:

1. Generate core rectangle keys from current extents.
2. Generate expanded rectangle keys with:
   - `x: x0 - m ... x1 + m`
   - `y: y0 - n ... y1 + n`
3. Preserve existing wrapping/clamping rules:
   - x wraps with modulo tile count at zoom.
   - y clamps to `[0, nTiles-1]`.
4. `haloTiles = expanded - core`.
5. Deduplicate keys while preserving deterministic output order.

## 7. Focus Flow Integration

In `focusGroundOrbitAtLatLng`:

1. Call halo-aware `getFocusNeighborTiles`.
2. Build node inputs from `focusTilesWithRole` so each key can carry role metadata.
3. Continue waiting on merged focused keys as before.
4. Return merged focused keys for existing downstream consumers that expect `focusTiles`.

Compatibility note:
- Existing public return shape can preserve `focusTiles` to avoid breaking callers.
- Role-aware details remain internal to setup + tile creation path.

## 8. Material Behavior

### New class

Create `TileEmptyMaterial.class` under explore materials:

- No network texture loading.
- Uses procedural checker/gradient color styling.
- Lightweight and disposable following existing material lifecycle.

### Assignment rules

1. If focus-generated node role is `halo`, assign `TileEmptyMaterial` at tile creation.
2. Otherwise apply existing material mode behavior.
3. `applyMaterialMode` skips halo tiles so DEM/basic mode toggles do not replace empty halo rendering.

## 9. Error Handling and Safety

1. Missing role metadata defaults to existing path (`core` behavior) to avoid regressions.
2. Wrapping/clamping remains exactly as current logic.
3. Dedup safeguards prevent duplicate node/material churn.
4. Empty material has no texture dependency, so it adds no new network failure path.

## 10. Testing Strategy

### Unit tests (focus helper)

1. `halo=[0,0]` produces zero halo tiles.
2. `halo=[1,1]` produces symmetric ring around current core extent.
3. `halo=[n,m]` preserves wrap/clamp invariants.
4. Core and halo sets are disjoint; union equals expanded set.
5. Output contains no duplicate keys.

### Integration-focused tests

1. Focus flow assigns role metadata only for focus-generated tiles.
2. Tile creation maps `role=halo` -> `TileEmptyMaterial`.
3. `applyMaterialMode` does not override halo material.
4. Non-focus visible tile flow remains unchanged.

## 11. Risks and Mitigations

1. Risk: accidental behavior change in non-focus paths.
   - Mitigation: role handling gated to focus flow only; fallback to existing behavior without role.
2. Risk: material lifecycle leaks for new empty material.
   - Mitigation: ensure disposal via existing tile dispose callbacks and add targeted checks in tests.
3. Risk: output ordering differences affecting tests.
   - Mitigation: deterministic generation order and stable dedup policy.

## 12. Implementation Notes for Next Step

- Keep edits localized to:
  - `src/explore/setup.ts` (focus helper + focus flow role wiring)
  - material files (`TileEmptyMaterial.class` and any shared helpers if needed)
  - tile creation/material switching hooks in setup path
  - focused tests in client test suite
- Preserve existing module boundaries and avoid broad refactor.
