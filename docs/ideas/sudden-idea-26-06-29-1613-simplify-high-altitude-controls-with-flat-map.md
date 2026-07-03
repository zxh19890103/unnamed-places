---
done: yes
---

# Sudden Idea

## Source Prompt

To simplify the UI interaction, cancel the `OrbitControls` and `MapControls` on high altitude, only support GUI controls to simplify the interaction of global map. `PointerControls` is the default, `FlyControls` and `GroundOrbiControls` can be choose when camera is on the low altitude. We currently have a Flat version of map for user's view/selection, this's enough!

## Intent

Reduce interaction complexity in the global map by making high-altitude viewing rely on GUI and pointer-based control only, while reserving more physically navigable camera modes for low-altitude exploration.

## Proposed Shape

- Disable OrbitControls and MapControls when the camera is at high altitude so the global view stays simple and predictable.
- Keep PointerControls as the default interaction mode, and only expose FlyControls and GroundOrbitControls when the camera is near the ground.
- Use the existing Flat map view for selection and browsing, so the 3D global map does not need to carry every interaction pattern.

## Open Questions

- What exact altitude threshold should switch between high-altitude and low-altitude control modes?
- Should GUI mode be a strict lockout at high altitude, or merely the default with an optional advanced override?
- Do we want a single control selector in the UI, or automatic switching based on camera altitude only?

## Next Step

Define the altitude thresholds and a control-mode state machine, then wire the existing camera controllers so high-altitude and low-altitude behavior are enforced consistently.
