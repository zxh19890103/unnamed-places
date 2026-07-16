---
done: no
comment: ""
---

# Sudden Idea

## Source Prompt

render terrians in 中国古山水画 style

## Intent

Create a real-time visual style for terrain rendering that evokes traditional Chinese shanshui painting (ink wash, layered depth, misty atmosphere) while staying interactive in the 3D globe viewer.

## Proposed Shape

- Add a realtime shader-based stylization pass that remaps terrain shading into ink-like tones and brush-style contour emphasis.
- Preserve terrain readability with altitude-based layering, soft atmospheric haze, and simplified color bands inspired by shanshui composition.
- Keep this as an optional render mode that can be toggled on/off without changing tile data formats.

## Open Questions

- Which visual anchors are most important for v1: ink outlines, wash gradients, or mist/fog layering?
- Should satellite textures be fully replaced in this mode, or blended with stylized shading at low opacity?
- What frame-time budget should this mode target on mid-range devices?

## Next Step

Build a small shader prototype in sphere-zoom that applies ink-tone quantization plus elevation-based haze to existing terrain tiles, then compare readability and FPS against the default style.
