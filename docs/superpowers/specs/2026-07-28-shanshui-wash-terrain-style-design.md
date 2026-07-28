# Shanshui Wash Terrain Style Design

Date: 2026-07-28
Status: Proposed
Scope: Lancangriver client terrain rendering mode

## Summary

Introduce an optional real-time terrain render mode that evokes a traditional Chinese shanshui painting feel with a wash-first visual direction. The mode preserves interactivity in the 3D globe and targets 60 FPS on mid-range laptop GPUs.

Chosen constraints:

- Visual anchor: wash-first
- Texture strategy: blend satellite texture at low opacity under wash shading
- Performance target: 60 FPS target on mid-range laptop GPU during interaction

## Goals

1. Add a distinct shanshui-inspired look without changing tile data formats or streaming APIs.
2. Keep terrain readability at near, mid, and far distances.
3. Preserve current navigation and LOD behavior.
4. Stay performant enough for interactive globe exploration with a 60 FPS target.

## Non-Goals

1. No new tile formats or backend changes.
2. No full-screen post-process pipeline in v1.
3. No art-tool authoring pipeline for custom brush textures in v1.
4. No replacement of existing terrain modes.

## Recommended Approach

Implement a dedicated terrain material mode named shanshui-wash, integrated into the existing tile material switching system.

Why this approach:

- Better quality and control than a generic overlay/filter path.
- Lower complexity and GPU cost than a full-screen post-process pass.
- Aligns with current material-per-tile architecture for isolated rollout.

## Architecture

### High-level

1. Add a new terrain mode enum value: shanshui-wash.
2. Add a new tile material class and shader pair.
3. Reuse existing tile lifecycle and data flow.
4. Add runtime parameters and quality presets for tuning and frame-time protection.

### Components

1. ShanshuiWashMaterial class

- New material class alongside existing terrain materials.
- Owns and updates uniforms:
  - uToneBands
  - uInkEdgeStrength
  - uWashContrast
  - uHazeStrength
  - uSatelliteBlendOpacity

2. Shanshui wash shaders

- Vertex shader: reuse current terrain geometry flow.
- Fragment shader responsibilities:
  - derive tonal value from elevation and lighting cues
  - quantize to soft wash bands
  - add subtle contour emphasis from normal/gradient contrast
  - blend satellite texture at low opacity
  - apply distance-based atmospheric haze

3. Terrain mode integration

- Mode appears in existing terrain mode controls.
- Mode switching follows existing material replacement flow.
- Tile request, cache, and LOD behavior remain unchanged.

4. Runtime tuning controls

- Expose style knobs for development and iterative tuning:
  - tone bands
  - edge intensity
  - haze strength
  - satellite blend opacity
- Add quality presets:
  - High
  - Balanced (default)
  - Low

## Data Flow

1. Tile attach

- Tile node attaches as usual.
- If current mode is shanshui-wash, assign ShanshuiWashMaterial.

2. Per-frame render

- Camera and lighting state update as currently implemented.
- Relevant uniforms are updated with camera distance and style values.

3. Fragment composition

- Sample satellite texture.
- Compute wash tonal color from terrain cues.
- Blend output using low-opacity satellite contribution.
- Apply distance haze for depth layering.

4. Mode switching

- Existing material swap path is used for entering and leaving shanshui-wash.
- Resource disposal rules remain aligned with existing material lifecycles.

## Error Handling and Safety

1. Shader compile/link fallback

- On compile/link failure, fallback to basic terrain material.
- Emit clear console warning including mode and shader stage.

2. Uniform clamping

- Prevent unstable visuals with bounded parameters:
  - tone bands: 2 to 8
  - satellite blend opacity: 0.0 to 0.35
  - haze strength: clamped to avoid whiteout

3. Texture unavailability behavior

- If satellite texture is unavailable for a tile, render wash-only shading until texture resolves.

4. Mode-switch robustness

- Ensure previous material resources are disposed on rapid mode toggles.

## Performance Guardrails

1. Default quality preset

- Balanced preset is default and tuned for the 60 FPS target.

2. Cost containment

- Single tile material pass only.
- No additional geometry pass.
- No full-screen post-process in v1.

3. Dynamic degradation hooks

- If frame time remains above threshold for a sustained window:
  - reduce tone bands
  - reduce edge intensity
  - reduce haze complexity
- Recover quality gradually when frame time stabilizes.

4. Metrics

- Track FPS and frame-time p95 in development diagnostics for baseline comparisons.

## Testing Strategy

1. Unit tests

- Validate preset-to-uniform mapping.
- Validate parameter clamping behavior.
- Validate fallback mode selection paths.

2. Integration tests

- Mode switching updates attached tiles correctly and disposes stale materials.
- Missing texture path renders without crash.

3. Visual regression checks

- Capture reference images at fixed camera states:
  - near zoom
  - mid zoom
  - far zoom
- Validate tonal layering, haze depth, and readability consistency.

4. Performance verification

- Compare baseline terrain mode vs shanshui-wash on representative camera paths.
- Acceptance criteria:
  - Balanced preset operates near 60 FPS target on mid-range laptop GPU
  - no significant stutter regression during mode toggles

## Rollout Plan

1. Add mode and material class behind default-off selection.
2. Integrate minimal balanced preset and core uniforms.
3. Validate correctness and performance.
4. Expand tuning controls after baseline stability is confirmed.

## Open Follow-ups (Post-v1)

1. Optional ink-first hybrid toggle for stronger contour stylization.
2. Optional zoom-aware opacity curve for satellite blend.
3. Artist-oriented palette presets for multiple wash moods.
