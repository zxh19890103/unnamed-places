# Sudden Idea

## Source Prompt

need to track the loaded areas, and save them in db or somewhere, so that users know which is viewed and loaded before, click it and no need network to enter the 3d views.

## Intent

Enable users to revisit previously viewed 3D areas without network access by tracking which areas were loaded and persisting that state in a backend database.

## Proposed Shape

- Track loaded/viewed 3D areas with stable area identifiers and lightweight metadata (name, bounds, last viewed, cache status).
- Show a "Previously Loaded" list/map layer so users can see what has been viewed and click an area to reopen it.
- Support offline re-entry for already cached areas only; uncached/new areas still require network.

## Open Questions

- Should offline availability include only geometry/tiles, or also associated textures, DEM, and vector overlays?
- How should area retention/eviction be handled when storage limits are reached?
- Is backend DB persistence per-user account, per-device, or both?

## Next Step

Define the minimal loaded-area metadata schema and the client flow for marking an area as offline-ready after successful full asset caching.
