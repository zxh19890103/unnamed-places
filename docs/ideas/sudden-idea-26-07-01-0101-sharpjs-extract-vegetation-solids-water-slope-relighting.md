---
done: yes
comment: all we need is to extract slope.
---

# Sudden Idea

## Source Prompt

use sharpjs to extract vegetations and solids, even waters (very hard) from satellite images, and then render them with threejs lights, even consdider the `slope`.

## Intent

Build a pipeline that derives semantic terrain-like layers from satellite imagery (vegetation, solid/built surfaces, and water), then uses those layers to drive more realistic Three.js lighting and material response. The end goal is to make terrain rendering feel physically richer than plain texture mapping by combining image-derived classes with slope-aware shading.

## Proposed Shape

- Run Sharp.js based preprocessing on satellite tiles to generate per-pixel class masks for vegetation, solids, and water, plus confidence values where extraction is uncertain.
- Feed extracted masks into Three.js material/light logic so each class can react differently to directional light, ambient light, shadows, and tone mapping.
- Incorporate DEM-derived slope to modulate brightness/specular/roughness and reduce visual mismatch where flat-image classification conflicts with steep terrain geometry.
- Treat water extraction as a difficult/optional track with fallback behavior (low-confidence mask, conservative detection, or disabled-by-default pass).
- Keep scope to tile-level augmentation over existing raster/DEM flow rather than full semantic world reconstruction.

## Open Questions

- Should this run fully server-side during tile ingest/cache, or partially client-side for interactive tuning?
- What minimum quality threshold makes water extraction acceptable for production use?
- Which lighting parameters should be class-controlled first (e.g., roughness/specular only vs full material override)?
- Should slope influence only shading, or also class confidence correction (e.g., suppress improbable water on steep slopes)?
- What cache format should store derived masks (PNG channels, WebP, binary packed textures)?

## Next Step

Prototype one z/x/y tile pass that outputs vegetation/solid/water masks and slope-aware shaded preview frames, then compare visual gain and processing cost against current satellite-only rendering.
