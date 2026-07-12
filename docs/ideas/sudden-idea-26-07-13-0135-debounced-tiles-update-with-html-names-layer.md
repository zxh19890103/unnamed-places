---
done: no
comment: ""
---

# Sudden Idea

## Source Prompt

consider use debounce for tiles update, make it happy to integrate map tiles rendering system. load names and render as html layer.

## Intent

Stabilize tile update churn with debouncing so camera movement feels smoother, while preparing integration with the map tile rendering pipeline and adding place-name labels rendered in an HTML overlay layer.

## Proposed Shape

- Add a debounced tile-update trigger so rapid camera/controls events do not cause excessive tile diff/render cycles.
- Integrate the current sphere-zoom tile flow with the existing map tile rendering system through a clean adapter entry point.
- Load name features (or name fields from tile/vector payloads) and render them in a screen-projected HTML label layer above WebGL.

## Open Questions

- Should label source come from vector tiles already used by map rendering, or from a dedicated names endpoint?
- What debounce strategy is preferred: fixed delay, trailing-only, or adaptive by zoom/motion speed?
- Should labels be shown at all zooms, or only below a zoom threshold to control clutter?

## Next Step

Create a minimal spike in sphere-zoom that adds a trailing debounced `threeTiles.update()` wrapper and renders 5-10 mock projected name labels in an absolute HTML overlay to validate interaction and readability.
