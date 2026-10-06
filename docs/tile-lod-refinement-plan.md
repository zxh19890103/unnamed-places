# Tile LOD Refinement Implementation Plan

## Goal

Replace the incomplete zoom-delta refinement and fallback behavior in the photo-view 3D tile layer with a stable quadtree LOD reconciliation flow.

## Scope

- Keep the change within the Lancangriver client experiment's `_tile.ts`.
- Preserve the existing distance-to-zoom calculation, root tile coverage, shader rendering, and public `Tile` API.
- Do not add tests under the client workflow's no-unit-tests instruction; verify with its TypeScript check and production build.

## Implementation

1. Model each `TileGridCell` as a quadtree node that owns its mesh and zero or four child cells.
2. Initialize root meshes at creation, and create children at the next zoom using standard XYZ child coordinates `(2*x + dx, 2*y + dy)`.
3. Replace signed zoom-delta handling with idempotent reconciliation against the node's latest camera-distance target:
   - Keep/show the current mesh when its target is its own zoom.
   - Otherwise ensure children exist and reconcile each child against its own camera-distance target.
   - Keep the parent visible until all child branches have a loaded fallback or fully loaded descendant set; then show the children and hide the parent. Rerun reconciliation when DEM textures finish loading.
   - On coarsening, dispose descendant branches and show the current node's retained mesh.
4. Update `Tile.onEyesMove` to reconcile only root cells. Coalesce camera-move work into one delayed latest-camera update, rather than accumulating stale per-cell deltas.
5. Dispose child meshes, geometries, materials, and their owned DEM textures when collapsing branches or removing the tile.
6. Set diagnostic color from the displayed node's zoom level and ensure only supported zooms are indexed.

## Verification

- Run `npm run typecheck` and `npm run build` from `app/lancangriver/client`.
- Review the final diff and run `git diff --check`; leave unrelated pre-existing worktree changes untouched.
