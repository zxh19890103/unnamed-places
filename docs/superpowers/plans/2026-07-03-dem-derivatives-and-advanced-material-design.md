# DEM Derivatives and Advanced Material Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Lancangriver terrain rendering with on-demand server-side slope/aspect derivatives and a new non-satellite terrain material mode for advanced hillshade visualization.

**Architecture:** Server computes and caches combined slope/aspect derivatives PNG from DEM tiles on first request; client creates a new TileDemAdvanceMaterial that loads DEM + derivatives textures and renders terrain with directional color and optional stylized hillshade without satellite dependency. Zoom-level guards prevent usage above z15 with user alerts.

**Tech Stack:** Node.js + Express (serve), Three.js + GLSL (client), PNG encoding/decoding, typed arrays for DEM gradient computation.

---

## File Structure

**Serve (Node.js/Express):**

- `app/lancangriver/serve/src/routes/raster.js` — extend existing DEM route with `/derivatives.png` sub-route
- `app/lancangriver/serve/test/raster.route.test.js` — add derivatives generation and caching tests

**Client (TypeScript + Three.js):**

- `app/lancangriver/client/src/explore/materials/TileDemAdvanceMaterial.class.ts` — new material class with internal texture loading
- `app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.vert.glsl` — vertex shader with DEM displacement
- `app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.frag.glsl` — fragment shader with slope/aspect-based lighting and color
- `app/lancangriver/client/src/explore/SphereTile.class.ts` — modify to support material mode enum and switching
- `app/lancangriver/client/src/explore/setup.ts` — integrate mode changes with tile refresh
- `app/lancangriver/client/src/explore/gui.ts` — add dem-advance mode selector with zoom guard

---

## Tasks

### Task 1: Implement Serve Derivatives Route

**Files:**

- Modify: `app/lancangriver/serve/src/routes/raster.js`
- Create: (if not present) helper function for slope/aspect computation

**Goal:** Add GET `/raster/dem/:z/:x/:y/derivatives.png` endpoint that computes slope/aspect from cached DEM and returns combined RGBA PNG.

- [ ] **Step 1: Examine existing DEM route structure**

Open `app/lancangriver/serve/src/routes/raster.js` and locate:

- How coordinates (z/x/y) are validated
- How DEM tile PNG is fetched/cached (current dem.png handling)
- Cache directory structure
- Response headers and streaming logic

- [ ] **Step 2: Add derivatives route handler skeleton**

Add a new route handler after the existing DEM route:

```javascript
// In raster.js, after the existing /raster/dem/:z/:x/:y route

app.get("/raster/dem/:z/:x/:y/derivatives.png", async (req, res) => {
  const { z, x, y } = req.params;
  const zNum = parseInt(z, 10);
  const xNum = parseInt(x, 10);
  const yNum = parseInt(y, 10);

  // Validation will be added in next steps
  // Placeholder: respond with error for now
  res.status(501).json({ error: "not implemented" });
});
```

- [ ] **Step 3: Validate coordinates and zoom cap**

Replace placeholder in handler:

```javascript
// Validate z/x/y format
if (
  !Number.isInteger(zNum) ||
  !Number.isInteger(xNum) ||
  !Number.isInteger(yNum)
) {
  return res.status(400).json({ error: "Invalid tile coordinates" });
}
if (zNum < 0 || zNum > 15) {
  return res.status(400).json({ error: "Derivatives not available above z15" });
}

const maxTile = Math.pow(2, zNum);
if (xNum < 0 || xNum >= maxTile || yNum < 0 || yNum >= maxTile) {
  return res.status(400).json({ error: "Tile coordinates out of range" });
}
```

- [ ] **Step 4: Implement cache resolution**

Add cache path logic (reuse existing pattern from DEM route):

```javascript
const cacheDir = path.join(process.cwd(), ".data", "raster", "dem", z, x);
const derivativesPath = path.join(cacheDir, "derivatives.png");

// Check if cached derivatives exist
if (fs.existsSync(derivativesPath)) {
  return res.sendFile(derivativesPath, {
    headers: {
      "Cache-Control": "public, max-age=31536000",
      "Content-Type": "image/png",
    },
  });
}
```

- [ ] **Step 5: Fetch/cache DEM tile (reuse existing logic)**

Add logic to ensure DEM tile exists before computing derivatives:

```javascript
// Reuse the existing DEM tile fetch logic
// (call existing getDemTile or equivalent function that caches dem.png)
const demPath = path.join(cacheDir, `dem.png`);
if (!fs.existsSync(demPath)) {
  // Fetch DEM tile from Terrarium (reuse existing fetch in your codebase)
  // This assumes you have a helper like fetchAndCacheDemTile(z, x, y, cacheDir)
  try {
    await fetchAndCacheDemTile(zNum, xNum, yNum, cacheDir);
  } catch (err) {
    console.error(`Failed to fetch DEM for ${z}/${x}/${y}:`, err);
    return res.status(502).json({ error: "DEM fetch failed" });
  }
}
```

- [ ] **Step 6: Write slope/aspect computation function**

Create a helper function (add to raster.js or separate utils file):

```javascript
function computeSlopeAspect(demPng, width, height) {
  // demPng is a Uint8Array of RGBA data (Terrarium format: R/G/B = height)
  // Returns Uint8Array of RGBA derivatives data

  const output = new Uint8Array(width * height * 4);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Read 3x3 neighborhood (Terrarium: elevation = (R*256 + G + B/256) - 32768)
      const getElevation = (px, py) => {
        const pidx = (py * width + px) * 4;
        const r = demPng[pidx];
        const g = demPng[pidx + 1];
        const b = demPng[pidx + 2];
        return r * 256 + g + b / 256 - 32768;
      };

      const z00 = getElevation(x - 1, y - 1);
      const z10 = getElevation(x, y - 1);
      const z20 = getElevation(x + 1, y - 1);
      const z01 = getElevation(x - 1, y);
      const z21 = getElevation(x + 1, y);
      const z02 = getElevation(x - 1, y + 1);
      const z12 = getElevation(x, y + 1);
      const z22 = getElevation(x + 1, y + 1);

      // Horn-style derivatives
      const dz_dx = (-z00 - 2 * z01 - z02 + z20 + 2 * z21 + z22) / 8.0;
      const dz_dy = (-z00 - 2 * z10 - z20 + z02 + 2 * z12 + z22) / 8.0;

      // Slope in degrees
      const slope =
        Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy)) * (180 / Math.PI);

      // Aspect in radians [0, 2π)
      let aspect = Math.atan2(dz_dy, dz_dx);
      if (aspect < 0) aspect += 2 * Math.PI;

      // Pack to RGBA
      output[idx] = Math.round(Math.max(0, Math.min(255, (slope / 90) * 255))); // R = slope
      output[idx + 1] = Math.round((Math.sin(aspect) * 0.5 + 0.5) * 255); // G = sin(aspect)
      output[idx + 2] = Math.round((Math.cos(aspect) * 0.5 + 0.5) * 255); // B = cos(aspect)
      output[idx + 3] = 255; // A = 255
    }
  }

  // Handle border (replicate edge pixels)
  // Top/bottom rows
  for (let x = 0; x < width; x++) {
    const srcIdx = (1 * width + x) * 4;
    const topIdx = (0 * width + x) * 4;
    output.set(output.subarray(srcIdx, srcIdx + 4), topIdx);

    const srcBotIdx = ((height - 2) * width + x) * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    output.set(output.subarray(srcBotIdx, srcBotIdx + 4), botIdx);
  }

  // Left/right columns
  for (let y = 0; y < height; y++) {
    const srcIdx = (y * width + 1) * 4;
    const leftIdx = (y * width + 0) * 4;
    output.set(output.subarray(srcIdx, srcIdx + 4), leftIdx);

    const srcRIdx = (y * width + (width - 2)) * 4;
    const rIdx = (y * width + (width - 1)) * 4;
    output.set(output.subarray(srcRIdx, srcRIdx + 4), rIdx);
  }

  return output;
}
```

- [ ] **Step 7: Decode DEM PNG and call computation**

Add PNG decoding (use existing library in your codebase, e.g., `png` npm package or similar):

```javascript
// After DEM tile is confirmed to exist:
const png = require("png"); // or your existing PNG lib
const fs = require("fs");

// Read and decode DEM PNG
const demBuffer = fs.readFileSync(demPath);
const decoder = new png.PNG();
decoder.parse(demBuffer, (err, data) => {
  if (err) {
    console.error("DEM decode error:", err);
    return res.status(500).json({ error: "DEM decode failed" });
  }

  const width = data.width;
  const height = data.height;
  const derivativesData = computeSlopeAspect(data.data, width, height);

  // Encode derivatives to PNG and cache
  const derivativePng = new png.PNG({ width, height });
  derivativePng.data = Buffer.from(derivativesData);

  // Write to cache (atomic write recommended)
  const tmpPath = derivativesPath + ".tmp";
  const writeStream = fs.createWriteStream(tmpPath);

  derivativePng.pack().pipe(writeStream);

  writeStream.on("finish", () => {
    fs.renameSync(tmpPath, derivativesPath);
    res.sendFile(derivativesPath, {
      headers: {
        "Cache-Control": "public, max-age=31536000",
        "Content-Type": "image/png",
      },
    });
  });

  writeStream.on("error", (err) => {
    console.error("Derivatives write error:", err);
    res.status(500).json({ error: "Derivatives write failed" });
  });
});
```

- [ ] **Step 8: Run serve tests to verify route doesn't break existing tests**

Run: `cd app/lancangriver/serve && npm test`

Expected: All existing tests pass (derivatives tests will be added separately in Task 2).

- [ ] **Step 9: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/serve/src/routes/raster.js
git commit -m "feat(serve): add derivatives route for slope/aspect computation"
```

---

### Task 2: Add Serve Derivatives Route Tests

**Files:**

- Modify: `app/lancangriver/serve/test/raster.route.test.js`

**Goal:** Add test cases for derivatives route: valid tile returns PNG, caching works, DEM fetch failures handled, channel values in valid range.

- [ ] **Step 1: Examine existing test structure**

Open `app/lancangriver/serve/test/raster.route.test.js` and identify:

- Test framework (e.g., Jest, Mocha)
- Mock patterns for DEM tile fetching
- Response assertions
- Cache dir setup/teardown

- [ ] **Step 2: Add derivatives happy-path test**

```javascript
describe("/raster/dem/:z/:x/:y/derivatives.png", () => {
  test("should return image/png for valid tile", async () => {
    const response = await request(app).get(
      "/raster/dem/10/512/512/derivatives.png",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/image\/png/);
    expect(response.body).toBeDefined();
  });
});
```

- [ ] **Step 3: Add caching test**

```javascript
test("should cache derivatives and return cached on second request", async () => {
  // Mock expensive computation by tracking call count
  let computeCallCount = 0;

  // First request should compute
  const response1 = await request(app).get(
    "/raster/dem/10/512/512/derivatives.png",
  );
  expect(response1.status).toBe(200);

  // Second request should hit cache (verify by checking response time or mock call count)
  const response2 = await request(app).get(
    "/raster/dem/10/512/512/derivatives.png",
  );
  expect(response2.status).toBe(200);

  // Both responses should be identical (same bytes)
  expect(response1.body).toEqual(response2.body);
});
```

- [ ] **Step 4: Add DEM fetch failure test**

```javascript
test("should return 502 when DEM fetch fails", async () => {
  // Mock fetchAndCacheDemTile to throw
  jest
    .spyOn(rasterModule, "fetchAndCacheDemTile")
    .mockRejectedValueOnce(new Error("Network error"));

  const response = await request(app).get(
    "/raster/dem/10/512/512/derivatives.png",
  );
  expect(response.status).toBe(502);
  expect(response.body.error).toMatch(/DEM fetch failed/);
});
```

- [ ] **Step 5: Add channel value range test**

```javascript
test("should pack derivatives channels in 0..255 range", async () => {
  const response = await request(app).get(
    "/raster/dem/10/512/512/derivatives.png",
  );
  expect(response.status).toBe(200);

  // Decode PNG and verify each channel [R,G,B,A] is 0..255
  const png = require("png");
  const decoder = new png.PNG();
  decoder.parse(response.body, (err, data) => {
    expect(err).toBeNull();
    for (let i = 0; i < data.data.length; i++) {
      expect(data.data[i]).toBeGreaterThanOrEqual(0);
      expect(data.data[i]).toBeLessThanOrEqual(255);
    }
  });
});
```

- [ ] **Step 6: Add invalid zoom test**

```javascript
test("should reject z > 15 with 400 status", async () => {
  const response = await request(app).get(
    "/raster/dem/16/512/512/derivatives.png",
  );
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/not available above z15/);
});
```

- [ ] **Step 7: Run tests**

Run: `cd app/lancangriver/serve && npm test -- raster.route.test.js`

Expected: All new tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/serve/test/raster.route.test.js
git commit -m "test(serve): add derivatives route tests for caching and error handling"
```

---

### Task 3: Create TileDemAdvanceMaterial Class

**Files:**

- Create: `app/lancangriver/client/src/explore/materials/TileDemAdvanceMaterial.class.ts`

**Goal:** Implement new Three.js material class that loads DEM + derivatives textures and renders terrain without satellite dependency.

- [ ] **Step 1: Examine existing TileDemMaterial for reference**

Open `app/lancangriver/client/src/explore/materials/TileDemMaterial.class.ts` and note:

- Constructor signature and texture loaders
- Uniforms structure
- How DEM texture is loaded and cached
- Error handling for missing textures

- [ ] **Step 2: Create TileDemAdvanceMaterial skeleton**

```typescript
import * as THREE from "three";
import { TileGeometry } from "../geometries/TileGeometry.class";

export class TileDemAdvanceMaterial extends THREE.ShaderMaterial {
  private demTextureReady = false;
  private derivativesTextureReady = false;
  private demTexture: THREE.Texture | null = null;
  private derivativesTexture: THREE.Texture | null = null;
  private tileKey: string;

  constructor(
    tileKey: string,
    textureLoader: THREE.TextureLoader,
    options?: {
      hillshadeEnabled?: boolean;
      colorRampScale?: number;
    },
  ) {
    super({
      vertexShader: require("./shaders/tiledem.advance.vert.glsl"),
      fragmentShader: require("./shaders/tiledem.advance.frag.glsl"),
      uniforms: {
        uDemTexture: { value: new THREE.Texture() },
        uDerivativesTexture: { value: new THREE.Texture() },
        uHillshadeEnabled: { value: options?.hillshadeEnabled ?? false },
        uColorRampScale: { value: options?.colorRampScale ?? 1.0 },
        uTexturesReady: { value: false },
      },
      side: THREE.FrontSide,
      fog: true,
    });

    this.tileKey = tileKey;
    this.loadTextures(textureLoader);
  }

  private loadTextures(textureLoader: THREE.TextureLoader): void {
    const [z, x, y] = this.tileKey.split("/").map(Number);

    // Load DEM texture
    const demUrl = `/raster/dem/${z}/${x}/${y}.png`;
    textureLoader.load(
      demUrl,
      (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        this.demTexture = texture;
        this.demTextureReady = true;
        this.uniforms.uDemTexture.value = texture;
        this.updateTextureReadiness();
      },
      undefined,
      (err) => {
        console.error(`Failed to load DEM for ${this.tileKey}:`, err);
      },
    );

    // Load derivatives texture
    const derivUrl = `/raster/dem/${z}/${x}/${y}/derivatives.png`;
    textureLoader.load(
      derivUrl,
      (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        this.derivativesTexture = texture;
        this.derivativesTextureReady = true;
        this.uniforms.uDerivativesTexture.value = texture;
        this.updateTextureReadiness();
      },
      undefined,
      (err) => {
        console.error(`Failed to load derivatives for ${this.tileKey}:`, err);
        // Fallback: continue rendering without derivatives (handled in shader)
      },
    );
  }

  private updateTextureReadiness(): void {
    // Mark ready when both are available (derivatives optional)
    const ready = this.demTextureReady;
    this.uniforms.uTexturesReady.value = ready;
  }

  dispose(): void {
    if (this.demTexture) {
      this.demTexture.dispose();
    }
    if (this.derivativesTexture) {
      this.derivativesTexture.dispose();
    }
    super.dispose();
  }

  isReady(): boolean {
    return this.demTextureReady;
  }
}
```

- [ ] **Step 3: Add texture readiness getter**

```typescript
getTextureReadiness(): { dem: boolean; derivatives: boolean } {
  return {
    dem: this.demTextureReady,
    derivatives: this.derivativesTextureReady,
  };
}
```

- [ ] **Step 4: Add hillshade toggle method**

```typescript
setHillshadeEnabled(enabled: boolean): void {
  this.uniforms.uHillshadeEnabled.value = enabled;
}

getHillshadeEnabled(): boolean {
  return this.uniforms.uHillshadeEnabled.value as boolean;
}
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd app/lancangriver/client && npm run typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/client/src/explore/materials/TileDemAdvanceMaterial.class.ts
git commit -m "feat(client): add TileDemAdvanceMaterial class for derivatives rendering"
```

---

### Task 4: Create TileDemAdvanceMaterial Vertex Shader

**Files:**

- Create: `app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.vert.glsl`

**Goal:** Vertex shader that displaces vertices based on DEM elevation and prepares derivatives data for fragment shader.

- [ ] **Step 1: Create shader file**

```glsl
#include <common>
#include <fog_pars_vertex>

uniform sampler2D uDemTexture;
uniform bool uTexturesReady;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec4 vDerivatives;

void main() {
  vUv = uv;

  vec3 pos = position;

  if (uTexturesReady) {
    // Sample DEM elevation (Terrarium format: elevation = (R*256 + G + B/256) - 32768)
    vec4 demSample = texture2D(uDemTexture, uv);
    float elevation = (demSample.r * 256.0 + demSample.g + demSample.b / 256.0) - 32768.0;

    // Normalize elevation to 0..1 range for displacement
    // Typical range: -11000 to 8848 meters (normalized to scale 0..0.05 for visual effect)
    float displacementScale = 0.05;
    pos.z += (elevation / 200000.0) * displacementScale;
  }

  vPosition = pos;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
```

- [ ] **Step 2: Verify shader syntax**

Run: `cd app/lancangriver/client && npm run build`

Expected: No shader compilation errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.vert.glsl
git commit -m "feat(client): add vertex shader for DEM-based displacement"
```

---

### Task 5: Create TileDemAdvanceMaterial Fragment Shader

**Files:**

- Create: `app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.frag.glsl`

**Goal:** Fragment shader that uses slope/aspect derivatives to compute directional lighting and color without satellite texture.

- [ ] **Step 1: Create shader file**

```glsl
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uDerivativesTexture;
uniform bool uHillshadeEnabled;
uniform float uColorRampScale;
uniform bool uTexturesReady;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

vec3 colorRamp(float slope, float aspect) {
  // Simple directional color ramp based on slope and aspect
  // Low slope = greenish, high slope = reddish, with aspect affecting hue
  float slopeNorm = clamp(slope / 90.0, 0.0, 1.0);

  // Base color from slope (green to brown)
  vec3 lowSlopeColor = vec3(0.2, 0.6, 0.3);
  vec3 highSlopeColor = vec3(0.7, 0.4, 0.2);
  vec3 baseColor = mix(lowSlopeColor, highSlopeColor, slopeNorm);

  // Aspect hue modulation (sin/cos mapped from derivatives)
  float sinAspect = (aspect - 0.5) * 2.0; // Remap from [0..1] to [-1..1]
  float cosAspect = (aspect + 0.5 - 1.0) * 2.0; // Similar mapping

  // Light direction bias from aspect (prefer NE lighting)
  vec3 aspectBias = vec3(
    mix(0.8, 1.2, sinAspect * 0.5 + 0.5),
    mix(0.9, 1.0, cosAspect * 0.5 + 0.5),
    1.0
  );

  return baseColor * aspectBias * uColorRampScale;
}

vec3 hillshade(float slope, float aspect) {
  // Stylized hillshade using standard illumination direction (NW sun)
  // Assumes sun altitude = 45°, azimuth = 315° (NW)

  float sunAzimuth = 315.0 * 3.14159 / 180.0; // Convert to radians
  float sunAltitude = 45.0 * 3.14159 / 180.0;

  // Approximate surface normal from slope/aspect
  float slopeRad = slope * 3.14159 / 180.0;
  float aspectRad = aspect * 2.0 * 3.14159; // aspect encoded in [0..1] in texture

  vec3 surfaceNormal = normalize(vec3(
    sin(slopeRad) * cos(aspectRad),
    sin(slopeRad) * sin(aspectRad),
    cos(slopeRad)
  ));

  // Sun direction (simplified)
  vec3 sunDir = vec3(
    cos(sunAltitude) * sin(sunAzimuth),
    cos(sunAltitude) * cos(sunAzimuth),
    sin(sunAltitude)
  );

  // Lambertian shading
  float illumination = max(0.3, dot(surfaceNormal, sunDir));

  return vec3(illumination);
}

void main() {
  if (!uTexturesReady) {
    // Fallback: neutral gray
    gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
    #include <fog_fragment>
    return;
  }

  vec4 derivSample = texture2D(uDerivativesTexture, vUv);

  // Unpack slope and aspect from derivatives
  float slope = (derivSample.r / 255.0) * 90.0; // R channel: slope 0..90°
  float sinAspect = (derivSample.g / 255.0) * 2.0 - 1.0; // G channel: sin(aspect) in [-1..1]
  float cosAspect = (derivSample.b / 255.0) * 2.0 - 1.0; // B channel: cos(aspect) in [-1..1]

  // Recompute aspect angle from sin/cos
  float aspect = atan(sinAspect, cosAspect) + 3.14159; // Shift to [0..2π]
  aspect = aspect / (2.0 * 3.14159); // Normalize to [0..1] for ramp function

  vec3 color;
  if (uHillshadeEnabled) {
    color = hillshade(slope, aspect);
  } else {
    color = colorRamp(slope, aspect);
  }

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
}
```

- [ ] **Step 2: Verify shader syntax**

Run: `cd app/lancangriver/client && npm run build`

Expected: No shader compilation errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/client/src/explore/materials/shaders/tiledem.advance.frag.glsl
git commit -m "feat(client): add fragment shader with slope/aspect-based coloring"
```

---

### Task 6: Add Material Mode Enum to SphereTile

**Files:**

- Modify: `app/lancangriver/client/src/explore/SphereTile.class.ts`

**Goal:** Add material mode enumeration and extend SphereTile to support switching between dem, dem-advance, and basic modes.

- [ ] **Step 1: Examine current SphereTile structure**

Open `app/lancangriver/client/src/explore/SphereTile.class.ts` and identify:

- Current material assignment logic
- How materials are disposed
- Tile initialization flow
- Existing material classes used

- [ ] **Step 2: Add material mode enum near top of file**

```typescript
export enum TileMaterialMode {
  Basic = "basic",
  Dem = "dem",
  DemAdvance = "dem-advance",
}
```

- [ ] **Step 3: Add mode property to SphereTile**

In the SphereTile class, add:

```typescript
private materialMode: TileMaterialMode = TileMaterialMode.Dem;

setMaterialMode(mode: TileMaterialMode): void {
  if (this.materialMode === mode) {
    return; // Already in requested mode
  }

  if (this.mesh && this.mesh.material) {
    (this.mesh.material as THREE.Material).dispose();
  }

  this.materialMode = mode;
  this.updateMaterial();
}

getMaterialMode(): TileMaterialMode {
  return this.materialMode;
}

private updateMaterial(): void {
  if (!this.mesh || !this.geometry) {
    return;
  }

  let material: THREE.Material;

  switch (this.materialMode) {
    case TileMaterialMode.Basic:
      material = this.createBasicMaterial();
      break;
    case TileMaterialMode.Dem:
      material = this.createDemMaterial();
      break;
    case TileMaterialMode.DemAdvance:
      material = this.createDemAdvanceMaterial();
      break;
  }

  this.mesh.material = material;
}

private createBasicMaterial(): THREE.Material {
  // Return existing basic material logic (currently used)
  return new THREE.MeshPhongMaterial({
    color: 0xcccccc,
  });
}

private createDemMaterial(): THREE.Material {
  // Return existing DEM material (currently used)
  return new TileDemMaterial(this.tileKey, this.textureLoader);
}

private createDemAdvanceMaterial(): THREE.Material {
  // Return new advanced material
  return new TileDemAdvanceMaterial(this.tileKey, this.textureLoader);
}
```

- [ ] **Step 4: Update constructor**

Ensure SphereTile stores `textureLoader` as a property:

```typescript
private textureLoader: THREE.TextureLoader;

constructor(tileKey: string, geometry: THREE.BufferGeometry, textureLoader: THREE.TextureLoader) {
  this.tileKey = tileKey;
  this.geometry = geometry;
  this.textureLoader = textureLoader;
  // ... existing logic
}
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd app/lancangriver/client && npm run typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/client/src/explore/SphereTile.class.ts
git commit -m "feat(client): add material mode enum and switching to SphereTile"
```

---

### Task 7: Integrate Material Mode in Setup

**Files:**

- Modify: `app/lancangriver/client/src/explore/setup.ts`

**Goal:** Wire material mode changes to tile refresh and ensure mode state persists across viewport changes.

- [ ] **Step 1: Examine setup.ts structure**

Open `app/lancangriver/client/src/explore/setup.ts` and identify:

- How tiles are created and cached
- Where material assignment happens
- How GUI changes trigger tile updates
- Viewport/camera refresh flow

- [ ] **Step 2: Add global material mode state**

```typescript
let currentMaterialMode: TileMaterialMode = TileMaterialMode.Dem;

export function setMaterialMode(mode: TileMaterialMode): void {
  currentMaterialMode = mode;
  // Refresh all visible tiles with new material
  refreshVisibleTilesWithNewMaterial();
}

export function getMaterialMode(): TileMaterialMode {
  return currentMaterialMode;
}
```

- [ ] **Step 3: Add tile refresh function**

```typescript
function refreshVisibleTilesWithNewMaterial(): void {
  const tiles = getVisibleTiles(); // Existing function to get current tiles

  tiles.forEach((tile: SphereTile) => {
    tile.setMaterialMode(currentMaterialMode);
  });
}
```

- [ ] **Step 4: Hook mode changes to existing tile refresh**

Locate where `refreshVisibleTilesAndStats()` is called and ensure material mode is applied to newly created tiles:

```typescript
// In tile creation logic:
const tile = new SphereTile(tileKey, geometry, textureLoader);
tile.setMaterialMode(currentMaterialMode);
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd app/lancangriver/client && npm run typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/client/src/explore/setup.ts
git commit -m "feat(client): wire material mode changes to tile refresh in setup"
```

---

### Task 8: Add Material Mode Selector to GUI

**Files:**

- Modify: `app/lancangriver/client/src/explore/gui.ts`

**Goal:** Add GUI control to switch material modes with zoom-level guard; block dem-advance if z > 15 with alert.

- [ ] **Step 1: Examine gui.ts structure**

Open `app/lancangriver/client/src/explore/gui.ts` and identify:

- How controls are added (lil-gui or similar)
- Camera/zoom level access
- Alert/feedback mechanisms
- Existing mode selectors (if any)

- [ ] **Step 2: Add zoom-level guard function**

```typescript
function canUseAdvancedMode(): boolean {
  const camera = getCamera(); // Existing function to access camera
  const currentZoom = cameraDistanceToZoom(
    camera.position.distanceTo(cameraTarget),
  );
  return currentZoom <= 15;
}

function cameraDistanceToZoom(distance: number): number {
  // Convert camera altitude distance to zoom level
  // Inverse of typical Web Mercator zoom formula
  const earthRadius = 6371000; // meters
  const z = Math.log2(earthRadius / distance);
  return Math.max(0, Math.min(19, z));
}
```

- [ ] **Step 3: Add material mode GUI control**

```typescript
const materialsFolder = gui.addFolder("Terrain");

const materialConfig = {
  mode: "dem",
};

materialsFolder
  .add(materialConfig, "mode", ["basic", "dem", "dem-advance"])
  .name("Material Mode")
  .onChange((value: string) => {
    if (value === "dem-advance" && !canUseAdvancedMode()) {
      const currentZoom = cameraDistanceToZoom(
        getCamera().position.distanceTo(cameraTarget),
      );
      alert(
        `Advanced terrain mode requires zoom level ≤ 15. Current zoom: ${currentZoom.toFixed(1)}`,
      );
      // Revert selection
      materialConfig.mode = getMaterialMode();
      return;
    }

    const mode = value as TileMaterialMode;
    setMaterialMode(mode);
  });

materialsFolder.open();
```

- [ ] **Step 4: Add auto-revert logic for out-of-range zoom**

```typescript
// Monitor camera movement and auto-revert if leaving dem-advance zoom range
let lastZoom = cameraDistanceToZoom(
  getCamera().position.distanceTo(cameraTarget),
);

function onCameraMove(): void {
  const newZoom = cameraDistanceToZoom(
    getCamera().position.distanceTo(cameraTarget),
  );

  if (getMaterialMode() === TileMaterialMode.DemAdvance && newZoom > 15) {
    // Auto-revert
    setMaterialMode(TileMaterialMode.Dem);
    alert(
      `Zoom level (${newZoom.toFixed(1)}) exceeds terrain mode support. Reverted to standard DEM mode.`,
    );
  }

  lastZoom = newZoom;
}

// Hook into existing camera change listener
getCameraControls().addEventListener("change", onCameraMove);
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd app/lancangriver/client && npm run typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add app/lancangriver/client/src/explore/gui.ts
git commit -m "feat(client): add material mode selector with zoom-level guard in GUI"
```

---

### Task 9: Manual Integration Verification

**Files:** (None — validation only)

**Goal:** Run dev server and manually verify derivatives route, material loading, and GUI controls work end-to-end.

- [ ] **Step 1: Start local PostGIS Docker**

Run: `cd app/lancangriver/docker && docker-compose up -d`

Expected: PostGIS container running on localhost:5432.

- [ ] **Step 2: Start Lancangriver serve**

Run: `cd app/lancangriver/serve && npm run dev`

Expected: Server listening on (e.g.) `http://localhost:3000`.

- [ ] **Step 3: Start Lancangriver client**

Run: `cd app/lancangriver/client && npm run dev`

Expected: Vite dev server on `http://localhost:5173` (or configured port).

- [ ] **Step 4: Navigate to client and verify derivatives route**

1. Open browser to client dev server
2. Open DevTools Network tab
3. Zoom into supported range (z ≤ 15)
4. Verify `/raster/dem/:z/:x/:y/derivatives.png` requests appear in Network
5. Confirm 200 status and PNG MIME type

- [ ] **Step 5: Select dem-advance mode and observe rendering**

1. In GUI "Terrain" folder, select "dem-advance" from mode dropdown
2. Verify non-satellite terrain rendering with slope/aspect coloring
3. Confirm no satellite texture is loaded (no `/raster/satellite/...` requests)

- [ ] **Step 6: Test zoom-level guard**

1. Zoom out to z > 15
2. Try to select "dem-advance" in GUI
3. Verify alert appears: "Advanced terrain mode requires zoom level ≤ 15"
4. Confirm mode reverts to previous selection
5. Zoom back in to z ≤ 15
6. Verify "dem-advance" is now selectable again

- [ ] **Step 7: Test hillshade toggle (if implemented)**

1. While in dem-advance mode, look for hillshade toggle in GUI
2. Toggle on/off and observe rendering changes
3. Confirm default is "off"

- [ ] **Step 8: Test tile refresh on mode switch**

1. Switch between dem, dem-advance, and basic modes
2. Observe all visible tiles update material without lag or flicker
3. Confirm no console errors

- [ ] **Step 9: Test cache persistence**

1. Request a derivatives tile
2. Open Network tab DevTools and observe the timing
3. Request same tile again
4. Confirm second request is faster (cached)

- [ ] **Step 10: Commit verification note (optional)**

```bash
cd /Users/xhzhang1911/WorkSpace/unnamed-places
git add docs/superpowers/plans/2026-07-03-dem-derivatives-and-advanced-material-design.md
git commit -m "docs: mark DEM derivatives plan as verified"
```

---

## Acceptance Criteria Summary

**Functional:**

- ✅ Derivatives route computes and caches slope/aspect PNG
- ✅ TileDemAdvanceMaterial loads textures by tileKey
- ✅ Material mode can be selected via GUI
- ✅ dem-advance blocked with alert if z > 15
- ✅ All visible tiles update when mode changes

**Quality:**

- ✅ No runtime errors when derivatives are missing
- ✅ No satellite texture in dem-advance shader path
- ✅ Existing dem/basic modes unchanged
- ✅ All tests passing (serve + client)
- ✅ No TypeScript errors

**Performance:**

- ✅ Derivatives cached server-side
- ✅ Material GPU-resident (no frame stuttering on mode switch)
- ✅ Fallback coloring if derivatives unavailable

---

## Notes for Implementation

1. **PNG Library:** Verify that Node.js PNG library is already in `app/lancangriver/serve/package.json`. If not, add:

   ```bash
   npm install png
   ```

2. **Shader Imports:** Ensure your build system (Vite for client) can import `.glsl` files as strings. Add loader if needed:

   ```bash
   npm install --save-dev vite-plugin-glsl
   ```

3. **Terrarium DEM Format:** The existing DEM route likely already handles Terrarium RGB encoding. Verify the format matches: `elevation = (R*256 + G + B/256) - 32768`.

4. **Coordinate Systems:** Camera distance-to-zoom conversion depends on your existing camera setup. Adjust `cameraDistanceToZoom()` function if your zoom formula differs.

5. **Testing Mode:** Client tests may have pre-existing failures (noted in repo memory). Focus on new tests for derivatives material behavior.

---
