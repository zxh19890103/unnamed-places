---
done: no
comment: ""
---

# Sudden Idea

## Source Prompt

postGis can generate 3d tiles tilesets, so we can use it to provide 3d tiles to render.

## Intent

Use PostGIS as a server-side source for generating 3D Tiles tilesets, then expose those tilesets to the client renderer so terrain or feature content can be streamed and displayed as standard 3D Tiles.

## Proposed Shape

- Build a PostGIS-backed export path that produces Cesium 3D Tiles-compatible tilesets from selected spatial layers.
- Add a service endpoint that serves the generated tileset metadata and tile content for client-side streaming.
- Keep scope focused on one pilot dataset and one rendering path before expanding to full multi-layer production coverage.

## Open Questions

- Should generation be fully on-demand, precomputed in batch jobs, or a hybrid cache strategy?
- Which data type is first: buildings, terrain-derived meshes, or corridor-focused vector extrusions?
- What target format profile and optimization level are required for current client performance constraints?

## Next Step

Define a minimal pilot: pick one PostGIS table, generate a single valid 3D Tiles tileset end-to-end, and verify it renders in the Lancangriver client with measurable load time and frame rate.
