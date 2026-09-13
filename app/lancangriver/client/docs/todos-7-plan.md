# Item 7 Plan: Add Animation Support for `setZoomLevel` and `setLatlng`

## Objective

Add optional animation to camera updates so changes in zoom level and target coordinates can move smoothly instead of snapping immediately. This should preserve current synchronous behavior when animation is not requested while making cinematic transitions available for user-facing map interactions.

---

## 1. Review the Current Camera Update APIs

### Tasks

- Locate the current `setZoomLevel` and `setLatlng` implementations.
- Trace where these functions are called from the client.
- Confirm whether the camera update flow already supports interpolation or whether it is currently immediate-only.
- Identify the relevant state fields: current center, zoom, target, camera position, and any animation timer or easing state.

### Output

- A clear understanding of the current API contract.
- A list of existing camera-update assumptions that must remain intact.

### Success criteria

- The animation work is grounded in the current control model rather than a duplicate implementation.
- No existing non-animated behavior is lost.

---

## 2. Design the Animated Update Contract

### Proposed behavior

- `setZoomLevel(value, options?)` should support an animated transition when an option such as `animate: true` is passed.
- `setLatlng(latlng, options?)` should support animated movement to a target location when `animate: true` is used.
- If animation is not specified, the function should preserve the current direct-update semantics.

### Recommended options

- `animate?: boolean`
- `duration?: number`
- `easing?: 'linear' | 'easeInOut' | ...`
- `cancelPrevious?: boolean`

### Success criteria

- The API remains easy for existing call sites to use.
- The default behavior is unchanged unless animation is explicitly requested.

---

## 3. Add a Safe Animation Layer

### Tasks

- Introduce an internal animation path that can interpolate between the current camera state and the target state.
- Use a per-frame update loop or a requestAnimationFrame-based controller.
- Ensure each new call either overrides the previous animation or cancels stale transitions in a predictable way.
- Keep the animation state isolated from render logic so it can be reused by future navigation features like `flyTo`.

### Expected behavior

- Animation starts cleanly from the current view state.
- Repeated calls do not leave conflicting or overlapping camera motion.
- The camera remains stable during updates and does not drift from the requested target.

### Success criteria

- Animated transitions are deterministic and cancel-safe.
- Future camera features can reuse the same update mechanics without major refactoring.

---

## 4. Implement Animated Zoom Updates

### Tasks

- Add support for animating the zoom parameter from the current value to the requested value.
- Decide whether the animation should interpolate smoothly across a numeric zoom range or update camera distance in tandem if necessary.
- Keep the final camera state consistent with the current projection model.

### Expected behavior

- Zoom changes feel smooth rather than abrupt.
- The target point stays visually anchored when the zoom is adjusted.
- The final state matches the requested zoom value exactly.

### Success criteria

- `setZoomLevel` can animate without breaking map framing.
- Zoom updates remain accurate at the end of the animation.

---

## 5. Implement Animated Lat/Lng Updates

### Tasks

- Add support for animating camera center movement from the current lat/lng to the target point.
- Ensure the camera trajectory matches the map projection and world coordinate model.
- Decide whether this should operate from the map center only or also consider elevation and distance constraints.

### Expected behavior

- The map smoothly moves toward the requested coordinate.
- The animation preserves the current camera orientation and relevant framing state.
- The target location is reached cleanly and without overshoot.

### Success criteria

- `setLatlng` can animate without visible jumps or drift.
- The end state matches the requested target location.

---

## 6. Keep Immediate Updates Working

### Tasks

- Ensure the non-animated path remains available and unchanged.
- Verify that existing code paths that depend on instant updates still behave correctly.
- Avoid requiring all call sites to pass animation options.

### Expected behavior

- Old callers still work without modifications.
- Any immediate update path remains fast and predictable.

### Success criteria

- The animation feature is additive, not breaking.
- Existing map interactions remain stable.

---

## 7. Add Basic UX Validation

### Manual test checklist

- Call `setZoomLevel` with animation enabled and verify the zoom transitions smoothly.
- Call `setLatlng` with animation enabled and confirm the view glides toward the selected point.
- Call the same functions without animation and verify the instant update behavior remains intact.
- Re-trigger a new update mid-animation and confirm the newer request wins cleanly.
- Check that the behavior remains stable across terrain and flat-map scenarios.

### Success criteria

- The user perceives smooth motion when animation is enabled.
- No lag, jitter, or stale target state is visible in normal use.

---

## 8. Risks and Notes

### Main risks

- Animation may conflict with existing camera state or target calculations.
- Mid-animation interruption may produce jitter or a mismatched final state.
- Zoom and lat/lng transitions can become visually inconsistent if they are updated independently.

### Mitigations

- Keep animation logic centralized and state-driven.
- Cancel stale transitions when a new update arrives.
- Ensure both zoom and lat/lng updates finalize against the same camera model.

---

## Recommended Implementation Order

1. Inspect and confirm the current camera update model.
2. Add a generic animation controller for camera state changes.
3. Implement animated zoom transitions.
4. Implement animated lat/lng transitions.
5. Preserve the default direct-update path.
6. Validate behavior with manual camera tests and polish timing.

---

## Follow-up Dependency

This work is foundational for several later tasks, especially:

- `flyTo` navigation
- quick drop-down camera actions
- smooth terrain/flat switching
- any future camera-driven UX that relies on transitions rather than instant jumps
