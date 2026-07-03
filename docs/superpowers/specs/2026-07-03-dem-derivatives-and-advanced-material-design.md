# DEM Derivatives and Advanced Material Design

Date: 2026-07-03
Status: Draft for review
Project phase: Lancangriver serve + client terrain shading extension

## 1. Scope and Goals

### 1.1 Product context

Current system pieces already in place:

- DEM raster route and cache flow in app/lancangriver/serve/src/routes/raster.js
- DEM-based terrain material in app/lancangriver/client/src/explore/materials/TileDemMaterial.class.ts
- Tile material lifecycle switching via app/lancangriver/client/src/explore/SphereTile.class.ts and app/lancangriver/client/src/explore/setup.ts
- Terrain controls in app/lancangriver/client/src/explore/gui.ts

The target capability is to expose slope/aspect-derived terrain signals from server-side DEM tiles and use them in a new client material mode that does not rely on satellite texture.

### 1.2 Chosen scope

This design covers:

- one combined derivatives raster route
- one new client material class TileDemAdvanceMaterial
- one GUI mode switch path to activate advanced material
- zoom-limit handling with alert feedback

### 1.3 In scope

- Serve route: GET /raster/dem/:z/:x/:y/derivatives.png
- On-demand derivatives generation from dem.png with cache persistence
- No smoothing/denoise in v1
- Combined 8-bit PNG packing:
  - R = slope in 0..90 deg mapped to 0..255
  - G = sin(aspect) mapped from -1..1 to 0..255
  - B = cos(aspect) mapped from -1..1 to 0..255
  - A = 255
- TileDemAdvanceMaterial constructor receives tileKey and loads DEM + derivatives textures internally
- Advanced material supports:
  - DEM displacement response
  - lighting response
  - directional color ramp
  - optional stylized hillshade (default off)
  - no satellite texture sampling
- GUI control to switch to TileDemAdvanceMaterial
- If z > 15, block advanced mode and show alert

### 1.4 Out of scope

- Batch regional derivatives precomputation
- Optional smoothing/denoise controls
- 16-bit PNG output in v1
- New data provider or DEM source changes
- Full terrain shader redesign beyond advanced mode

## 2. Architecture

### 2.1 Primary approach

Approach A (selected): on-demand server derivatives + client advanced material mode.

Server and client responsibilities:

- Serve computes and caches derivatives texture per tile on first request.
- Client advanced material loads required textures by tile key and renders terrain with non-satellite shading.
- Setup/GUI controls mode switching and zoom guard.

### 2.2 Core components

#### Derivatives route extension (serve)

Location: app/lancangriver/serve/src/routes/raster.js

Responsibilities:

- Validate z/x/y
- Ensure dem.png exists
- Compute slope/aspect from DEM pixels
- Pack and cache combined derivatives PNG
- Return image/png with existing cache headers

#### TileDemAdvanceMaterial (client)

Location: app/lancangriver/client/src/explore/materials/TileDemAdvanceMaterial.class.ts

Responsibilities:

- Constructor takes tileKey (+ loaders + optional params)
- Loads DEM and derivatives textures internally
- Maintains texture readiness flags
- Applies terrain lighting/color logic without satellite texture
- Supports hillshade toggle uniform (default off)

#### Material mode integration (client)

Locations:

- app/lancangriver/client/src/explore/SphereTile.class.ts
- app/lancangriver/client/src/explore/setup.ts
- app/lancangriver/client/src/explore/gui.ts

Responsibilities:

- Add material mode enum/state with dem-advance option
- Switch material per tile at runtime
- Enforce DEM zoom limit
- Trigger alert when advanced mode is requested out of range

## 3. Data Flow and Runtime Behavior

### 3.1 Serve flow for derivatives route

1. Receive /raster/dem/:z/:x/:y/derivatives.png
2. Validate coordinates and DEM zoom cap constraints
3. Resolve cache path for derivatives tile
4. If cached derivatives exists, return immediately
5. Ensure dem.png exists by reusing DEM tile fetch/cached flow
6. Decode DEM elevations from Terrarium RGB
7. Compute gradients using 3x3 finite differences
8. Derive slope and aspect per pixel
9. Pack to RGBA and write cached PNG atomically
10. Return cached file

### 3.2 Slope/aspect computation details

For each pixel, use 3x3 neighborhood and Horn-style derivatives:

- dz/dx and dz/dy from weighted neighbors
- slope = atan(sqrt((dz/dx)^2 + (dz/dy)^2)) in degrees
- aspect derived from atan2 and normalized to [0, 360)

Then pack:

- R = round(clamp(slope / 90, 0, 1) \* 255)
- G = round((sin(aspectRad) _ 0.5 + 0.5) _ 255)
- B = round((cos(aspectRad) _ 0.5 + 0.5) _ 255)
- A = 255

Border handling in v1:

- replicate edge pixels for missing neighbors

### 3.3 Client material flow

Per tile material creation:

1. TileDemAdvanceMaterial constructed with tileKey
2. Class loads dem and derivatives textures directly:

- /raster/dem/:z/:x/:y.png
- /raster/dem/:z/:x/:y/derivatives.png

3. Uniforms update readiness flags on load
4. Shader uses DEM for displacement context + derivatives for lighting/color effects
5. Hillshade branch is disabled by default and toggled by uniform

### 3.4 GUI and zoom-limit behavior

- Terrain GUI exposes mode switch including dem-advance
- If user selects dem-advance when zoom level is unsupported (z > 15):
  - reject mode switch
  - call alert with clear reason
  - keep current valid material mode
- If currently in dem-advance and camera crosses above supported zoom:
  - auto-revert to dem mode when dem is allowed; otherwise fallback to basic mode
  - show alert once per transition

## 4. Error Handling and Resilience

### 4.1 Serve errors

- DEM download failure: return structured error JSON with status 502/500
- Derivatives compute failure: return 500 and log z/x/y context
- Use in-flight dedupe map for derivatives generation to avoid duplicate concurrent compute

### 4.2 Client errors

- Derivatives texture load failure:
  - material remains valid
  - fallback shading path used
- DEM texture load failure:
  - render neutral fallback color path
- Material dispose must cancel pending image loads and dispose textures safely

### 4.3 Stability rules

- Never crash tile render path due to missing derivatives texture
- Keep mode switching deterministic and reversible
- Alerts should be scoped to state transitions, not every frame

## 5. Testing Strategy and Acceptance Criteria

### 5.1 Serve tests

Target file: app/lancangriver/serve/test/raster.route.test.js

Add tests for:

- derivatives route returns image/png for valid tile
- derivatives route caches generated output
- derivatives route handles DEM fetch failure
- packed channel values stay in 0..255 range

### 5.2 Client tests

Target files:

- app/lancangriver/client test suite around tile/material behavior
- setup/gui mode switch tests

Add tests for:

- dem-advance material selection path
- blocked switch and alert on unsupported zoom
- auto-revert behavior when leaving supported zoom

### 5.3 Manual verification checklist

- Toggle dem-advance at z <= 15 and observe non-satellite terrain shading
- Confirm hillshade is off by default
- Toggle hillshade on and verify visible stylized shading response
- Zoom to unsupported range and confirm alert + mode fallback
- Revisit same tile and verify derivatives route is cached

### 5.4 Acceptance criteria

Functional:

- Combined derivatives route is available and cache-backed
- TileDemAdvanceMaterial loads textures by tileKey in constructor
- dem-advance mode can be selected in GUI
- Mode is blocked with alert beyond DEM support zoom

Quality:

- No runtime errors when derivatives are missing/unready
- No satellite texture dependency in dem-advance shader path
- Existing DEM/basic modes continue to work unchanged

## 6. File-Level Change Plan

Serve:

- app/lancangriver/serve/src/routes/raster.js
- app/lancangriver/serve/test/raster.route.test.js

Client:

- app/lancangriver/client/src/explore/materials/TileDemAdvanceMaterial.class.ts
- app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.vert.glsl
- app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.frag.glsl
- app/lancangriver/client/src/explore/SphereTile.class.ts
- app/lancangriver/client/src/explore/setup.ts
- app/lancangriver/client/src/explore/gui.ts

## 7. Notes for Planning Handoff

Implementation ordering recommendation:

1. Serve route + tests
2. New material + shaders
3. SphereTile mode support
4. Setup + GUI switch and zoom guard with alert
5. Verification and tuning of default color-ramp/hillshade params
