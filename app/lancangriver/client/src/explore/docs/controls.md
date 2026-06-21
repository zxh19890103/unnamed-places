## Design: Altitude-Based Camera Controls (Implemented)

Two altitude thresholds govern camera control switching and tile loading behavior.

- **A1 = 50,000 m (50 km)** — threshold between Orbit and Map controls. Above: globe view. Below: regional map view.
- **A2 = 1,000 m (1 km)** — threshold for optional fly mode. Below: immersive terrain flight available.

### Control Zones

| Altitude           | Control           | Tile Stream                  |
| ------------------ | ----------------- | ---------------------------- |
| ≥ A1               | **OrbitControls** | Lazy (visibleTiles.ts)       |
| < A1               | **MapControls**   | Lazy (visibleTiles.ts)       |
| < A2, user-enabled | **FlyControls**   | Compositor (resolution mode) |

**Orbit ↔ Map transitions** are automatic at A1 with hysteresis (48 km descend → map, 52 km ascend → orbit).

**Fly mode entry/exit** is user-controlled via F-key or GUI toggle, only when altitude < A2. Rising above A2 while flying auto-reverts to MapControls.

### Tile Behavior by Mode

**Orbit & Map modes (lazy streaming):**

- `visibleTiles.ts` computes visible tiles each frame from frustum + camera distance.
- `TilesManager.setNodes()` adds/removes parent tile meshes dynamically.
- Standard, uninterrupted streaming.

**Fly mode (resolution mode):**

- `visibleTiles.ts` loop is paused; no new root-level tiles are added/removed.
- Parent tile set remains frozen at the moment fly mode is enabled.
- `FlySatelliteCompositor` runs throttled (~100ms cadence) per attached parent tile:
  - Calculates satellite target zoom from camera distance.
  - Enumerates child satellite tiles at target zoom.
  - Composes children onto a canvas texture.
  - Applies composed texture to parent tile material.
- **Parent meshes are never created or destroyed** — only satellite textures are updated.
- Camera can fly smoothly without tile load/unload churn.

### Control Parameters

**OrbitControls (altitude ≥ A1):**

- `rotateSpeed` = 0.1, `zoomSpeed` = 0.1
- `minDistance` = EARTH_RADIUS + 50,000 m
- `maxDistance` = EARTH_RADIUS × 3

**MapControls (altitude < A1):**

- `screenSpacePanning` = true (keyboard pan in screen space)
- `minDistance` = EARTH_RADIUS + 100 m
- `maxDistance` = EARTH_RADIUS + 50,000 m
- Polar angle locked to [0, π/6] for near-top-down view

**FlyControls (user-enabled when altitude < A2):**

- `movementSpeed` = `altitude / 100` m/s (adaptive; updated per-frame)
- `dragToLook` = true (mouse drag to turn)
- `rollSpeed` = 0.01
- Constrained to yaw/pitch only (no roll) for terrain flight comfort

### Architecture

**ControlsManager** (`explore/ControlsManager.class.ts`):

- Constructs Orbit, Map, Fly controls upfront; only one enabled at a time.
- `checkAltitude(alt)` performs auto-transitions at A1 with hysteresis.
- `enableFly()` / `disableFly()` user-triggered; checks altitude gating (A2).
- `update(delta)` calls active control's update each frame.
- Emits `onModeChange` callback.

**FlySatelliteCompositor** (`explore/FlySatelliteCompositor.class.ts`):

- Tracks satellite state per tile: `currentZoom`, `targetZoom`, `pending`, `requestSeq`.
- `updateForTiles(tiles)` iterates attached parents, composes textures where needed.
- Enumerates and loads child satellite tiles (e.g., z11 parent → z13 children).
- Canvases and applies textures to parent tile material.
- No mesh creation; material updates only.

**Mode-Driven Tile Updates** (`explore/setup.ts`):

- `tileModeLazy` flag toggled on `ControlsManager.onModeChange`.
- Lazy mode: call `getVisibleTiles()` → `tileManager.setNodes()` (unchanged).
- Resolution mode: skip `setNodes()`; tiles frozen. Compositor updates textures instead.

**Render Loop** (`App.tsx`):

- Each frame: `controlsManager.update(delta)` (delegates to active control).
- In fly mode, throttled compositor: `compositor.updateForTiles(tiles)` (~100ms).
- Tile updates decoupled from controls; compositor runs independently.

### State Management in TileNode

Fly-mode metadata added to `TileNode`:

- `satelliteCurrentZoom?: number` — current composed satellite detail level.
- `satelliteTargetZoom?: number` — desired zoom based on camera distance.
- `satellitePending?: boolean` — composition in progress.
- `satelliteRequestSeq?: number` — generation counter for request dedup.

No child mesh nodes stored; compositing is texture-only.

### Cleanup & Disposal

On fly mode exit:

- Compositor disposes old composed textures.
- `setNodes()` resumes, visible tile set reconciles.

On app cleanup:

- Compositor disposes all canvas textures.
- ControlsManager disposes all three controls.
