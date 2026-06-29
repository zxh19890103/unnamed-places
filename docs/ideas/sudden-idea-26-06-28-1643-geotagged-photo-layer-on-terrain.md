---
done: yes
---

# Sudden Idea

## Source Prompt

access user's local disk (approved read permissions), to read photos (with geo information), then render the img layer on 3d terrain map, so that users can view their photos taken at specific locations. that would be very cool.

## Intent

Let users grant folder-level disk access so the app can discover geotagged photos and visualize them on the 3D terrain map at the coordinates where each photo was taken.

## Proposed Shape

- In Electron, users explicitly choose one or more local folders; the app reads image EXIF GPS metadata from approved paths only.
- Build a photo location layer in the 3D terrain view, where each marker/thumbnail is anchored to terrain coordinates and can open a preview.
- Scope is local-only browsing and rendering from user-selected folders; no automatic full-library scan by default.

## Open Questions

- How should photos without GPS metadata be handled (hidden, separate list, or manual pinning)?
- Should this layer support clustering/timeline filters when many photos are in one area?
- Is indexing metadata cached locally for performance, and what refresh behavior is expected?

## Next Step

Define a minimal metadata ingestion contract (file path, timestamp, GPS, thumbnail pointer) and a UX flow for folder permission, scan, and map-layer toggle.
