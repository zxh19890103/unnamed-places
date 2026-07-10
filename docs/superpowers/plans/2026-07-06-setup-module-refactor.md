# Setup Module Refactor Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

Goal: Break the large explore setup module into focused setup files so scene bootstrap is easy to read and evolve.

Architecture: Keep behavior unchanged while extracting cohesive responsibilities into setup/sky.ts, setup/clouds.ts, setup/vendors.ts, and setup/init.ts. Use a thin compatibility entry at explore/setup.ts so existing imports keep working during the migration.

Tech Stack: TypeScript, Vite, React, Three.js, SunCalc, existing Lancangriver explore modules.

---

## Target File Responsibilities

- app/lancangriver/client/src/explore/setup.ts
  - Compatibility surface only. Re-export createScene from setup/init.ts.

- app/lancangriver/client/src/explore/setup/init.ts
  - Bootstrap composition point.
  - Create scene, camera, renderer, controls, managers, and wire callbacks.
  - Own top-level orchestration lifecycle and returned API.

- app/lancangriver/client/src/explore/setup/sky.ts
  - Sky object creation and sky uniforms setup.
  - Sun direction and local-time helpers.
  - Sky sync with orbit target and camera distance.

- app/lancangriver/client/src/explore/setup/clouds.ts
  - Ground orbit cloud atlas material creation.
  - Cloud points creation, replacement, cleanup, and viewport sync.

- app/lancangriver/client/src/explore/setup/vendors.ts
  - Singleton-style shared setup dependencies (LoadingManager, TextureLoader, ImageLoader).
  - Loading snapshot state and manager hooks.
  - Preload cloud atlas texture config.

- app/lancangriver/client/src/explore/setup/types.ts (new)
  - Shared setup-side types for extracted modules.
  - Keep init.ts signatures compact and explicit.

## Constraints And Non-Goals

- Do not change runtime behavior intentionally.
- Do not add unit tests for this refactor.
- Keep existing public createScene return shape intact.
- Keep rendering and tile loading cadence unchanged.

### Task 1: Freeze Current Behavior And Define Module Contracts

Files:

- Modify: app/lancangriver/client/src/explore/setup.ts
- Create: app/lancangriver/client/src/explore/setup/types.ts
- Modify: app/lancangriver/client/src/explore/setup/init.ts

- [ ] Step 1: Add explicit shared types for extracted setup modules
  - Define SetupLoadingSnapshot, GroundOrbitState, SkySyncParams, and VendorBundle in setup/types.ts.
  - Include only fields currently used in setup.ts.

- [ ] Step 2: Move createScene signature ownership to init.ts
  - Ensure init.ts exports createScene(container: HTMLElement).
  - Keep setup.ts as re-export only to preserve existing imports.

- [ ] Step 3: Make setup.ts a compatibility bridge
  - Replace setup.ts implementation body with an export passthrough from setup/init.ts.

- [ ] Step 4: Commit
  - Commit message: refactor: establish setup module contracts and init entry

### Task 2: Extract Vendors (Loaders, Manager, Snapshot)

Files:

- Modify: app/lancangriver/client/src/explore/setup/vendors.ts
- Modify: app/lancangriver/client/src/explore/setup/init.ts
- Modify: app/lancangriver/client/src/explore/setup/types.ts

- [ ] Step 1: Implement vendor factory in vendors.ts
  - Add createVendors() that builds:
    - THREE.LoadingManager
    - loadingSnapshot object with current fields
    - THREE.TextureLoader and THREE.ImageLoader bound to manager
    - configured cloudAtlasTexture

- [ ] Step 2: Move loading manager callbacks into vendors.ts
  - Transfer onStart, onProgress, onLoad, onError logic unchanged.

- [ ] Step 3: Wire init.ts to consume createVendors()
  - Replace local manager/loader/atlas initialization with vendor bundle usage.

- [ ] Step 4: Keep sphere and photo marker consumers on the same loader instances
  - Ensure Sphere and PhotoMarkerMaterial still receive textureLoader/imageLoader from vendors.

- [ ] Step 5: Commit
  - Commit message: refactor: extract setup vendors and loading snapshot

### Task 3: Extract Sky Creation And Sync

Files:

- Modify: app/lancangriver/client/src/explore/setup/sky.ts
- Modify: app/lancangriver/client/src/explore/setup/init.ts
- Modify: app/lancangriver/client/src/explore/setup/types.ts

- [ ] Step 1: Move sky constants and sun helpers to sky.ts
  - Move SKY_DISTANCE, SKY_SCALE_MULTIPLIER, SKY_MIN_SCALE, SKY_MAX_SCALE.
  - Move computeSunDirectionForLocation, getDefaultCenterLatlng, getLatlngNow.

- [ ] Step 2: Add createSkyRig in sky.ts
  - Function builds Sky, sets uniforms, creates directional light, and returns:
    - sky object
    - sun light
    - initial center latlng
    - syncSkyWithCamera function

- [ ] Step 3: Replace inline sky logic in init.ts
  - Use createSkyRig(scene) during bootstrap.
  - Use returned syncSkyWithCamera in ground-orbit flow.

- [ ] Step 4: Preserve scene fog/background behavior
  - Keep sky and fog colors unchanged.

- [ ] Step 5: Commit
  - Commit message: refactor: extract sky setup and synchronization

### Task 4: Extract Ground Orbit Clouds Lifecycle

Files:

- Modify: app/lancangriver/client/src/explore/setup/clouds.ts
- Modify: app/lancangriver/client/src/explore/setup/init.ts
- Modify: app/lancangriver/client/src/explore/setup/types.ts

- [ ] Step 1: Implement cloud lifecycle helper in clouds.ts
  - Add createGroundOrbitCloudsController with methods:
    - replaceCloudsAtTarget
    - clear
    - syncViewportHeight
    - dispose

- [ ] Step 2: Move cloud geometry/material creation to clouds.ts
  - Keep CloudGeometry and CloudMaterial options unchanged.
  - Keep atlas texture usage from vendors bundle.

- [ ] Step 3: Replace local groundOrbitClouds state in init.ts
  - Remove direct cloud object management and call controller methods.

- [ ] Step 4: Wire resize and cleanup
  - resize uses controller.syncViewportHeight(height).
  - cleanup uses controller.dispose().

- [ ] Step 5: Commit
  - Commit message: refactor: extract ground orbit clouds controller

### Task 5: Shrink init.ts To Orchestration-Only Bootstrap

Files:

- Modify: app/lancangriver/client/src/explore/setup/init.ts

- [ ] Step 1: Reorder init.ts into explicit bootstrap sections
  - Section order:
    - create scene and camera
    - create vendors
    - create renderer and controls
    - create sphere and managers
    - wire tile lifecycle callbacks
    - wire gui and interaction callbacks
    - wire orbit focus flow
    - expose API and cleanup

- [ ] Step 2: Keep high-level helpers local only when truly orchestration-specific
  - Keep only helpers that connect modules together.
  - Move any remaining sky/cloud/vendor-specific details out.

- [ ] Step 3: Verify createScene return contract remains stable
  - Keep fields currently consumed by App.tsx unchanged.

- [ ] Step 4: Commit
  - Commit message: refactor: reduce init bootstrap to composition orchestration

### Task 6: Manual Verification (No Unit Tests)

Files:

- Verify: app/lancangriver/client/src/explore/setup.ts
- Verify: app/lancangriver/client/src/explore/setup/init.ts
- Verify: app/lancangriver/client/src/explore/setup/sky.ts
- Verify: app/lancangriver/client/src/explore/setup/clouds.ts
- Verify: app/lancangriver/client/src/explore/setup/vendors.ts

- [ ] Step 1: Run build verification
  - Command: cd app/lancangriver/client && npm run build
  - Expected: build succeeds with no TypeScript errors.

- [ ] Step 2: Run development server sanity check
  - Command: cd app/lancangriver/client && npm run dev
  - Expected: app starts, scene renders, no immediate console/runtime exceptions.

- [ ] Step 3: Exercise critical interactions manually
  - Check camera mode switches.
  - Check visible tiles continue loading.
  - Check ground orbit focus still updates sky and clouds.
  - Check GUI material switching still applies.

- [ ] Step 4: Commit final cleanup
  - Commit message: chore: finalize setup module refactor wiring

## Self-Review

Spec coverage:

- Extract sky code to setup/sky.ts: covered by Task 3.
- Extract clouds code to setup/clouds.ts: covered by Task 4.
- Place singletons/loaders/managers in setup/vendors.ts: covered by Task 2.
- init.ts as bootstrap and wiring hub: covered by Task 1 and Task 5.
- Step-by-step migration with readability goal: covered by Tasks 1-6.
- No unit test requirement: respected in Task 6 manual verification only.

Placeholder scan:

- No TODO or TBD placeholders in task steps.
- Each task has explicit files and concrete actions.

Type consistency:

- Shared extracted module signatures are centralized in setup/types.ts to prevent drift.
- createScene public contract is explicitly preserved in Task 5.
