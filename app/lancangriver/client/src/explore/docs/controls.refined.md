## Design: Altitude-Based Camera Controls

Two altitude thresholds, **A1** and **A2**, govern which control mode is active.

- **A1 = 50,000 m (50 km)** — above this the globe curvature is prominent; OrbitControls is the right tool.
- **A2 = 1,000 m (1 km)** — below this the terrain becomes immersive; FlyControls becomes available.

### Control zones

| Altitude          | Control       | Tile loading                           |
| ----------------- | ------------- | -------------------------------------- |
| ≥ A1              | OrbitControls | `visibleTiles.ts` (frustum + distance) |
| < A1              | MapControls   | `visibleTiles.ts` (frustum + distance) |
| < A2, user opt-in | FlyControls   | tile-compositing strategy (see below)  |

Switching between OrbitControls and MapControls is **automatic** at A1 (with a small hysteresis band: 48 km descending, 52 km ascending).

Switching to FlyControls is **user-triggered** (e.g. `F` key or a HUD button) and only available when altitude is below A2. Ascending back above A2 while in fly mode automatically reverts to MapControls.

### Tile loading strategy in FlyControls mode

While OrbitControls and MapControls are active, tiles stream lazily via `visibleTiles.ts` — new tiles are added or removed each frame based on frustum and camera distance.

When FlyControls is enabled, the lazy-loading loop is **paused**:

- The current set of visible tiles is frozen.
- Each frame, per-tile camera distance is checked; `enumerateChildTiles()` is called where higher resolution is warranted — but no new root-level tiles are added.
- Tile meshes and DEM textures remain stable, so the camera can fly smoothly without waiting for loads.

This implies backend tile compositing: composed tile meshes do not change as the camera moves within the fly zone.

### Transition smoothness

On every control switch, a short camera tween (≈ 0.6s lerp) preserves the current `camera.position` while recomputing the incoming control's target/lookAt. Input is disabled on the outgoing control until the tween completes.

### Per-mode parameter notes

- **OrbitControls:** low rotate/zoom speed; min distance = EARTH_RADIUS + A1
- **MapControls:** `screenSpacePanning` on; polar angle clamped near top-down; min distance = EARTH_RADIUS + 100 m
- **FlyControls:** `movementSpeed` adapts to altitude (`alt / 100` m/s); `dragToLook` on; constrained yaw/pitch (no roll)
