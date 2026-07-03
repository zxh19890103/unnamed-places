---
done: no
comment: ""
---

# Sudden Idea

## Source Prompt

add a serve route to provide a slope (0 - 90 deg) map and a aspect (0 - 360 deg) map computed from `dem.png` by sharpjs. so that we can render terrian with lights or some visual effects.

## Intent

Expose lightweight derived terrain products from existing DEM tiles so the client can use slope and aspect for terrain shading, relighting, and visual effects without introducing a separate heavy preprocessing pipeline.

## Proposed Shape

- Add serve endpoints that derive and return two raster products from each DEM tile: slope (degrees, 0-90) and aspect (degrees, 0-360).
- Compute outputs on demand from `dem.png` using Sharp-based image processing in the serve layer, with cache reuse similar to existing tile cache behavior.
- Keep scope to tile-level derived maps only; do not include full terrain analysis workflows or region-wide batch generation in this step.

## Open Questions

- Output encoding choice for slope/aspect: grayscale PNG, RGB packed values, or float-friendly format for client shader consumption?

  ```
  RGB packed values, slope in R channel, aspect in G channel, B unused.
  Need Png with 16bit depth to avoid precision loss.
  0 - 255 for slope (0-90 deg), 0 - 255 for aspect (0-360 deg).
  ```

- Should routes return independent files (`/slope.png`, `/aspect.png`) or a combined packed texture for fewer client requests?
  ```
  Combined, use R and G channels.
  ```
- Should slope/aspect be generated from raw DEM values only, or include optional smoothing/denoise controls?
  ```
  yes. but not optional, apply denoise controls by default.
  ```

## Next Step

Draft a small serve API spec covering route paths, response formats, caching rules, and the exact DEM-to-slope/aspect calculation method to keep client and server expectations aligned.
