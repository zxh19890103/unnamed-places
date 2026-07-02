---
done: no
comment: ""
---

# Sudden Idea

## Source Prompt

geojson tiles. i want we could dynamically load the geojson (osm format) data for each tile, and also we support geojson merge load. but i have no clear idea for it.

User follow-up decision: 2 (Merge-first region load as default)

## Intent

Support two GeoJSON data-loading modes for OSM-like vector content: tile-based dynamic loading and merged-region loading, with merged-region loading as the default path to simplify rendering continuity and reduce per-tile request churn.

## Proposed Shape

- Default to merge-first region loading for the current viewport/area so the client receives one combined GeoJSON payload for stable map interaction.
- Keep per-tile GeoJSON loading as a fallback path when merged data is unavailable, too large, or still processing.
- Define one client-facing loading contract that can switch between merged and tiled sources without changing downstream rendering code.

## Open Questions

- What is the merge boundary unit: current viewport bbox, fixed grid region, admin boundary, or route corridor?
- What maximum merged payload size is acceptable before forcing tile fallback?
- Should merge mode deduplicate and simplify geometries server-side, and if yes, at what zoom-dependent tolerance?
- How should cache invalidation/versioning work between merged payloads and tile payloads to avoid stale mixed states?

## Next Step

Draft a small API contract for both endpoints (merged and tile), including response metadata and fallback rules, then map that contract to one client loader interface.
