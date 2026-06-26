# Lancangriver Close-Range Satellite LOD Design

Date: 2026-06-26  
Status: Draft for review  
Project phase: current Lancangriver client refactor

## 1. Scope and Goals

### 1.1 Product context

The current Lancangriver client is a Three.js-based exploratory globe renderer. It already has:

- a live visible-tile pipeline in `app/lancangriver/client/src/explore/visibleTiles.ts`
- a distance-derived zoom helper in `app/lancangriver/client/src/calc/mercator.ts`
- a fly-mode satellite compositor in `app/lancangriver/client/src/explore/FlySatelliteCompositor.class.ts`
- close-range control modes in `ControlsManager.class.ts`

The current problem is that low-altitude free view does not produce consistently clear imagery near the camera. The existing distance-based LOD path is too coarse and some related values are not wired from real camera state cleanly enough.

### 1.2 Chosen scope

This design covers a client-only close-range satellite LOD policy for near-surface camera modes.

### 1.3 In scope

- A close-range LOD policy that combines camera altitude and screen-center priority
- A smarter auto-LOD path for low-altitude free view
- Reuse of the existing tile visibility and satellite composition pipeline
- Request ordering and fallback rules for close-range texture upgrades
- Unit and integration tests for the policy and scheduler

### 1.4 Out of scope

- Service API changes
- New imagery providers
- Terrain mesh redesign
- Global style or atmosphere changes
- Full free-flight control rewrite

## 2. Architecture

### 2.1 Primary approach

Use a hybrid close-range LOD policy:

- altitude determines how large the high-detail area should be
- screen position determines which visible tiles should be upgraded first

The center of the screen gets the sharpest imagery first. As the camera gets closer to the globe, the high-detail region grows outward in rings.

### 2.2 Why this approach

- Better fit for low-altitude free view than pure distance-based zoom
- Keeps the user’s focus area sharp even when the camera is close to the surface
- Avoids forcing the entire visible globe to maximum detail too early
- Can be layered onto the current client without replacing the tile system

### 2.3 Core components

#### CloseRangeLODPolicy

Inputs:

- camera altitude above globe surface
- camera forward direction and viewport center ray
- visible tile set

Outputs:

- per-tile priority score
- target satellite zoom band
- center-ring radius or falloff band for the current frame

Responsibilities:

- decide what should be upgraded first
- expand the high-detail region as altitude decreases
- degrade safely to distance-only behavior if inputs are unstable

#### TilePriorityQueue

Inputs:

- visible tile list
- priority scores from the policy
- current request state

Outputs:

- ordered tile upgrade queue

Responsibilities:

- prefer center-adjacent tiles first
- avoid duplicate work for tiles already pending
- preserve deterministic ordering across frames

#### SatelliteUpgradeScheduler

Inputs:

- ordered queue
- current request budget
- tile generation / request sequence state

Outputs:

- queued or in-flight satellite composition work

Responsibilities:

- apply the chosen zoom target only if the request is still current
- keep old textures visible until a new composite is ready
- throttle upgrades so rendering stays responsive

#### Mode Gate

Responsibilities:

- enable the close-range policy in low-altitude free view and other near-surface modes where it helps
- keep the existing broad globe streaming behavior for normal orbit navigation

## 3. Data Flow and Runtime Behavior

### 3.1 Frame-level flow

1. Camera updates.
2. Visible tiles are computed by the existing frustum / visible tile path.
3. The close-range policy scores those tiles using altitude and screen-center distance.
4. The scheduler sorts the tiles so center-adjacent tiles get upgraded first.
5. The compositor requests higher satellite detail for the highest-priority tiles.
6. Parent or lower-detail imagery remains visible until the new composite is ready.

### 3.2 Priority model

The policy uses three concepts:

- center band: highest priority, should stay sharp first
- outer falloff band: upgrades gradually as the camera moves or descends
- altitude scaling: the center band grows as altitude decreases

This gives a fixed user-facing behavior:

- when close to the globe, the screen center stays crisp
- as the user approaches the surface, a larger part of the screen becomes crisp
- the edge can lag behind slightly without ruining the scene

### 3.3 Relationship to existing code

- `visibleTiles.ts` remains the source of visibility truth
- the new policy does not replace frustum culling
- the compositor remains the mechanism that applies satellite textures
- the new policy only changes how tiles are ranked and which zoom target is requested first

### 3.4 Current-phase implementation boundary

This change should stay inside the client refactor surface first.

That means:

- fix the close-range policy in the client renderer
- wire it to real camera state instead of placeholder values
- keep server routes unchanged unless a later milestone proves they are a bottleneck

## 4. Error Handling and Resilience

### 4.1 Failure classes

- invalid camera state:
  - fall back to the existing distance-only ordering for that frame
- unstable screen-space calculation:
  - keep the last good policy output or revert to center-neutral ordering
- slow or missing higher-zoom satellite tiles:
  - retain the parent texture until the composite completes
- stale request completion:
  - discard the result if the tile request sequence no longer matches

### 4.2 Degradation rules

1. Prefer the current visible texture over a blank or partially-updated tile.
2. Prefer distance-based fallback over a failed center-priority calculation.
3. Prefer stable, slightly less detailed output over aggressive but flaky upgrades.

### 4.3 Stability guardrails

- request sequencing must prevent old responses from overwriting newer ones
- missing child tiles should not break the parent tile
- the policy must not block rendering while waiting for higher detail
- if all close-range logic fails, the app should still render using the current streaming path

## 5. Testing Strategy and Acceptance Criteria

### 5.1 Test levels

Unit tests:

- altitude-to-radius growth behavior
- center-vs-edge tile priority ordering
- fallback from close-range policy to distance-only behavior
- request de-duplication and stale-sequence rejection

Integration tests:

- visible low-altitude tiles are prioritized from the screen center outward
- close-range free view requests a finer satellite zoom than the old fixed band
- parent imagery remains visible while higher-zoom composites are pending

Behavioral regression tests:

- low-altitude free view should no longer stay stuck on the old coarse LOD band
- center-screen tiles should receive detail upgrades before peripheral tiles at the same altitude

### 5.2 Acceptance criteria

Functional:

- users can move close to the globe and still see crisp imagery in the center of the screen
- the app automatically expands the high-detail area as altitude decreases
- low-altitude free view uses the new policy without manual intervention

Stability:

- rendering continues while higher detail is loading
- stale or failed requests do not corrupt the current scene
- fallback behavior preserves the current experience rather than blocking it

### 5.3 Debug visibility

Useful debug signals for implementation:

- current camera altitude
- current center-band radius
- per-tile priority score
- requested satellite zoom target
- pending / stale request counts

## 6. Planning Notes

Values to finalize during implementation planning:

- exact radius growth curve for the center band
- whether the center priority should be a fixed ring, a falloff curve, or a hybrid
- whether low-altitude policy should apply only to free view or also to fly / groundOrbit modes
- the precise fallback order between center-priority scoring and existing distance-based zoom

Known current-phase issue to address first:

- the current compositor path should use real camera distance / altitude rather than placeholder values
- the current distance-to-low-altitude helper is too coarse for the desired close-range behavior
