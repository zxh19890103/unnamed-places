---
done: yes
comment: defined a customized Geometry and Material for photo markers instead.
---

# Sudden Idea

## Source Prompt

since we have journey panel now, we need to add the photos on the 3d map, how? use `import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js"`. users click the markers, we show the photo then.

## Intent

Add photo points to the 3D map so journey-related images are visible in-world as clickable markers, then open the corresponding photo when a marker is selected.

## Proposed Shape

- Render photo markers as `CSS2DObject` overlays anchored to geographic positions in the existing Three.js scene.
- Use `CSS2DRenderer` alongside the current WebGL renderer so markers remain interactive and readable over terrain/camera movement.
- On marker click, open a photo viewer tied to journey panel state (show image, title/caption, and close/back behavior), without changing core terrain rendering flow.

## Open Questions

- Should click open the photo inside the journey panel, as a floating lightbox over the map, or both?
- What is the source of marker data (journey panel dataset, API endpoint, or static seed data)?
- Do we need clustering/visibility limits when many photos exist in one area?

## Next Step

Create a short technical design note defining marker data schema (id, lng, lat, image URL, caption), map-to-world placement logic, and click interaction wiring between `CSS2DObject` markers and the journey panel/photo viewer state.
