---
done: yes
---

# Sudden Idea

## Source Prompt

add a route to serve tiles composing, given `latlng`, search the tile, then extend 1 aronud, totally 9 tiles, and use sharp to compose them, save it in disk, then response with the stream.

## Intent

Expose a service endpoint that turns a geographic point into a stitched neighborhood image by locating the center tile, collecting a 3x3 tile block, composing a single output image, caching it on disk, and streaming it back.

## Proposed Shape

- Add a new route that accepts `latlng` (and optionally zoom) to determine the center tile key.
- Resolve the 8 surrounding tiles plus center (total 9), compose them into one image with `sharp`, and persist the output in a cache directory for reuse.
- On cache hit, skip composition and stream the cached image; on miss, compose + write + stream, with clear behavior for missing source tiles.

## Open Questions

- What should be the fixed zoom level or zoom selection rule when not explicitly provided?
- For missing neighbor tiles, should we fill with transparent pixels, solid color, or nearest-available fallback tile?
- Should the response image include metadata (center lat/lng, zoom, tile keys) or image-only stream?

## Next Step

Define the route contract (`query/body`, zoom default, output format), cache key schema, and missing-tile fallback rule, then implement one end-to-end path with tests for cache miss/hit and partial tile availability.
