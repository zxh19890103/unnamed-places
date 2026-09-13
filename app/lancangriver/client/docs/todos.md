# Lancangriver Client Tasks

## Overview

This task list turns the current rough client notes into actionable implementation work for the Lancangriver project. Each item includes the goal, expected behavior, and acceptance criteria.

---

## 1. Load Photos and Show Photo Locations on the Map

### Goal

Allow the client to load photo data and display each photo at its geographic location so users can preview and inspect images directly from the map.

### Scope

- Load photo metadata from the available data source or API.
- Extract latitude/longitude for each photo.
- Show markers or points on the 3D map and, if relevant, on the flat map.
- Provide a clear interaction for selecting a photo marker.
- Show a preview panel or modal with the photo thumbnail and basic metadata.

### Expected behavior

- Photo locations appear clearly on the map without cluttering the viewport.
- Clicking or selecting a photo updates the current selection state.
- The preview can show photo content, label, timestamp, and location context.
- The map remains readable even when many photo markers are visible.

### Acceptance criteria

- Users can see photo locations on the map.
- Selecting a photo reveals a preview.
- Marker state and preview state stay synchronized.
- Empty or missing metadata is handled gracefully.

---

## 2. Elevation-Aware Near/Far Adjustment

### Goal

Fix the camera distance logic so near/far adjustments work correctly alongside elevation and do not distort the globe radius logic.

### Design decision

- The earth sphere radius should remain fixed.
- `setElevation` should set the camera's elevation relative to the earth surface rather than changing the globe's radius.
- The user-facing distance adjustment should be handled separately from the base earth radius and elevation values.

### Scope

- Review the existing `setElevation` and camera-distance logic.
- Separate globe radius from viewer altitude and target-distance controls.
- Recalculate view depth and clipping in a way that respects real-world elevation and target distance.
- Update the camera controls to keep `near/far` behavior stable across terrain and flat modes.

### Expected behavior

- Elevation changes do not alter the base earth radius.
- Camera distance can be adjusted independently for a better view composition.
- Near/far zoom logic remains consistent when moving over high or low terrain.
- Terrain-to-flat transitions preserve sensible camera spacing.

### Acceptance criteria

- The earth radius remains constant.
- `setElevation` behaves as an altitude adjustment, not as a radius mutation.
- Distance adjustments improve the visual framing without breaking the world geometry.
- The camera remains stable across varying terrain heights.

---

## 3. Smooth Terrain and Flat Map Switching UX

### Goal

Improve the transition between terrain view and flat map mode so the switch feels intentional and fluid instead of abrupt.

### Scope

- Review the current terrain/flat mode transitions.
- Add a smoother view-change path when switching modes.
- Preserve target location and user context during the change.
- Ensure the transition works for both keyboard and pointer-driven interactions.

### Expected behavior

- Switching between terrain and flat modes feels smooth and controlled.
- The map does not jump unexpectedly or lose focus on the target.
- The transition timing is consistent and readable.
- The UI clearly reflects the current active mode.

### Acceptance criteria

- Users can switch between terrain and flat mode without a jarring reset.
- The selected target remains visible during transition.
- Mode switching is animated or smoothly interpolated where appropriate.
- Reduced-motion behavior remains respectful.

---

## 4. Border-Style Theme Exploration

### Goal

Try a lighter border-based visual theme to better match the River Mist design language and improve the clarity of controls and panels.

### Scope

- Update visual styling for overlays, panels, controls, and toolbars to use border emphasis instead of heavy fills or flat monochrome surfaces.
- Keep the application visually consistent with the existing River Mist palette.
- Apply the theme to the map workspace, panels, buttons, and dialog surfaces.

### Expected behavior

- Panels and controls visually separate without becoming overly dark or heavy.
- The UI feels airy, technical, and easy to read over map imagery.
- Borders are visible enough to support contrast and accessibility.

### Acceptance criteria

- Core controls and panels use a soft, readable border treatment.
- The new styling remains compatible with map overlays and light surfaces.
- The theme is applied consistently across the main client interfaces.

---

## 5. Implement `flyTo` Navigation

### Goal

Add a camera navigation method that smoothly flies to a target position and/or view state instead of snapping instantly.

### Scope

- Define the camera target parameters, such as latitude, longitude, zoom level, elevation, and optional target distance.
- Add a smooth interpolation path between the current camera state and the target state.
- Support cancellation or interruption when a new navigation request arrives.
- Make the API fit the existing client camera control patterns.

### Expected behavior

- The camera moves smoothly to the target rather than jumping immediately.
- Users can fly to a selected place, feature, or photo location.
- The final view preserves a sensible orientation and framing.

### Acceptance criteria

- `flyTo` can move the camera to a target position smoothly.
- Target parameters can include location, zoom, and elevation as needed.
- The function is reliable during repeated navigation commands.
- The resulting motion feels stable and not jittery.

---

## 6. Add a Quick Drop-Down From High Altitude to Low Altitude

### Goal

Provide a fast way for users to move from a high overview altitude down to a lower inspection altitude with smooth animation.

### Scope

- Add a shortcut or control for quick altitude descent.
- Define a sensible low-altitude target with stable framing.
- Animate the transition so the descent feels controlled rather than abrupt.
- Ensure this works in conjunction with target location, zoom, and elevation state.

### Expected behavior

- The user can quickly descend from a high-level overview to a detailed close look.
- The motion is smooth and has a clear visual purpose.
- The camera remains focused on the intended target.

### Acceptance criteria

- A quick drop-down action is available in the client UI or control flow.
- The transition is animated and readable.
- The target is preserved through the whole motion.
- The action remains useful in both terrain and flat views.

---

## 7. Add Animation Support for `setZoomLevel` and `setLatlng`

### Goal

Allow camera view changes to animate when the client updates zoom level or target coordinates.

### Scope

- Extend `setZoomLevel` to support optional animation.
- Extend `setLatlng` to support optional animation.
- Define the easing behavior and animation timing.
- Ensure the animated path is compatible with the current camera control system.

### Expected behavior

- Zoom or location updates can run with animation when requested.
- A non-animated mode remains available when immediate updates are needed.
- The camera motion is smooth, predictable, and not excessive.

### Acceptance criteria

- Animated zoom updates are supported.
- Animated lat/lng updates are supported.
- Immediate updates still work when animation is disabled.
- The API remains easy to call from existing client interactions.

---

## Recommended Delivery Order

1. Elevation-aware camera logic and `setElevation` fix
2. `setZoomLevel` and `setLatlng` animation support
3. `flyTo` navigation implementation
4. Quick drop-down altitude workflow
5. Photo marker loading and preview integration
6. Terrain/flat mode transition polish
7. Border-style visual refinement

---

## Notes

These tasks are intentionally ordered to reduce rework: the camera logic should be settled first so the rest of the interaction work can build on a stable foundation. The elevation rule change described in the current notes is especially important because it affects both map framing and future navigation behavior.
