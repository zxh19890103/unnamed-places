# DEM Compose Route with Extent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one DEM compose endpoint at `/raster/dem/:z/:x/:y/compose.png?extent={e}` that stitches neighboring DEM tiles into one PNG, caches it on disk, and streams it.

**Architecture:** Extend the existing DEM raster flow with a compose route keyed by tile coordinates (`z/x/y`) and query `extent`. Default `extent=1` generates `3x3`; `extent=2` generates `4x4`; general rule is output grid size `extent + 2`. Build a deterministic tile window using the same neighbor rule as client focus tiles: compute raw offsets, wrap X with modulo (`(((x % n) + n) % n)`), and clamp Y (`max(0, min(n - 1, y))`). Load existing/fetched DEM PNG tiles, fill fetch failures with transparent placeholders, compose with `sharp`, save under `.tiles/composed/dem`, then stream.

**Tech Stack:** Node.js (ESM), Express, sharp, Vitest, Supertest.

Response contract for this endpoint:

- Success responses MUST be binary PNG bytes (web-renderable image stream/body), never JSON metadata.
- Internal helpers may return filesystem paths for composition flow, but route output is always `image/png` bytes.

---

## File Structure

- Modify: `app/lancangriver/serve/src/routes/raster.js`
- Modify: `app/lancangriver/serve/test/raster.route.test.js`

Responsibilities:

- `src/routes/raster.js`: route contract, extent parsing, compose window math, compose/cache/stream behavior for DEM.
- `test/raster.route.test.js`: endpoint behavior tests (validation, cache miss/hit, extent override, partial neighbors).

### Task 1: DEM Compose Route Contract + Validation (TDD)

**Files:**

- Modify: `app/lancangriver/serve/test/raster.route.test.js`
- Modify: `app/lancangriver/serve/src/routes/raster.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

describe("GET /raster/dem/:z/:x/:y/compose.png", () => {
  it("uses default extent=1 (3x3) when query is omitted", async () => {
    const composeDemSpy = vi.fn().mockResolvedValue({
      outputPath: "/tmp/.tiles/composed/dem/11/1024/768/e1.png",
      cached: false,
    });
    const app = createApp({
      raster: { composeDemNeighborhood: composeDemSpy },
    });

    const response = await request(app).get(
      "/raster/dem/11/1024/768/compose.png",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/image\/png/);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(response.body.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(composeDemSpy).toHaveBeenCalledWith(11, 1024, 768, 1);
  });

  it("rejects invalid extent", async () => {
    const app = createApp();
    const response = await request(app).get(
      "/raster/dem/11/1024/768/compose.png?extent=0",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_EXTENT",
        reason: "extent must be an integer >= 1",
      },
    });
  });

  it("rejects invalid tile coordinates", async () => {
    const app = createApp();
    const response = await request(app).get(
      "/raster/dem/11/-1/768/compose.png",
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_TILE_COORDINATES");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/raster.route.test.js -t "compose.png"`
Expected: FAIL with 404 or wrong payload/response type for `/raster/dem/:z/:x/:y/compose.png`.

- [ ] **Step 3: Write minimal implementation**

```js
function parseExtent(value, fallback = 1) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed >= 1 ? parsed : null;
}

router.get("/raster/dem/:z/:x/:y/compose.png", async (req, res) => {
  const z = parseTileCoordinate(req.params.z);
  const x = parseTileCoordinate(req.params.x);
  const y = parseTileCoordinate(req.params.y);
  const extent = parseExtent(req.query.extent, 1);

  if (!validateTileCoordinates(z, x, y)) {
    sendRasterError(
      res,
      400,
      "INVALID_TILE_COORDINATES",
      "Invalid z/x/y tile coordinates",
    );
    return;
  }

  if (extent === null) {
    sendRasterError(
      res,
      400,
      "INVALID_EXTENT",
      "extent must be an integer >= 1",
    );
    return;
  }

  res.status(501).json({ ok: false, code: "NOT_IMPLEMENTED_YET" });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/raster.route.test.js -t "compose.png"`
Expected: PASS for validation tests.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/routes/raster.js app/lancangriver/serve/test/raster.route.test.js
git commit -m "test(raster): add dem compose route validation contract"
```

### Task 2: DEM Compose + Cache + Stream (TDD)

**Files:**

- Modify: `app/lancangriver/serve/test/raster.route.test.js`
- Modify: `app/lancangriver/serve/src/routes/raster.js`

- [ ] **Step 1: Write the failing test**

```js
it("composes on cache miss then serves cache on hit", async () => {
  const composeSpy = vi.fn().mockImplementation(async ({ outputPath }) => ({
    outputPath,
    cached: false,
  }));

  const app = createApp({
    raster: {
      composeDemNeighborhood: composeSpy,
    },
  });

  const url = "/raster/dem/11/1024/768/compose.png?extent=1";
  const first = await request(app).get(url);
  const second = await request(app).get(url);

  expect(first.status).toBe(200);
  expect(first.headers["content-type"]).toMatch(/image\/png/);
  expect(first.body.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(second.status).toBe(200);
  expect(second.headers["content-type"]).toMatch(/image\/png/);
  expect(second.body.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(composeSpy).toHaveBeenCalledTimes(1);
});

it("maps extent=2 to a 4x4 output", async () => {
  const composeSpy = vi.fn().mockResolvedValue({
    outputPath: "/tmp/.tiles/composed/dem/11/1024/768/e2.png",
    cached: false,
  });

  const app = createApp({ raster: { composeDemNeighborhood: composeSpy } });

  const response = await request(app).get(
    "/raster/dem/11/1024/768/compose.png?extent=2",
  );

  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toMatch(/image\/png/);
  expect(response.body.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(composeSpy).toHaveBeenCalledWith(11, 1024, 768, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/raster.route.test.js -t "cache miss"`
Expected: FAIL because compose path is not implemented and not returning PNG bytes.

- [ ] **Step 3: Write minimal implementation**

```js
import sharp from "sharp";

function buildComposeWindow(z, centerX, centerY, extent) {
  const n = 2 ** z;
  const size = extent + 2; // extent=1 -> 3x3, extent=2 -> 4x4
  const coords = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const dx = col - extent;
      const dy = row - extent;
      const rawX = centerX + dx;
      const rawY = centerY + dy;
      const wrappedX = ((rawX % n) + n) % n;
      const clampedY = Math.max(0, Math.min(n - 1, rawY));
      coords.push({
        x: wrappedX,
        y: clampedY,
        row,
        col,
      });
    }
  }
  return { size, tiles: coords };
}

async function defaultComposeDemNeighborhood({
  z,
  centerX,
  centerY,
  extent,
  rasterRoot,
  fetchDemPngTile,
}) {
  const cachePath = resolve(
    rasterRoot,
    "composed",
    "dem",
    String(z),
    String(centerX),
    String(centerY),
    `e${extent}.png`,
  );
  if (await isExistingPath(cachePath))
    return { outputPath: cachePath, cached: true };

  const { size, tiles } = buildComposeWindow(z, centerX, centerY, extent);
  const inputs = [];
  const tileSize = 256;

  for (const tile of tiles) {
    const left = tile.col * tileSize;
    const top = tile.row * tileSize;

    try {
      const result = await fetchDemPngTile(z, tile.x, tile.y);
      const path = result.pngPath ?? result.path;
      inputs.push({ input: path, left, top, blend: "over" });
    } catch {
      const blank = await sharp({
        create: {
          width: tileSize,
          height: tileSize,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      inputs.push({ input: blank, left, top });
    }
  }

  await ensureDirectory(cachePath);
  await sharp({
    create: {
      width: size * tileSize,
      height: size * tileSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(inputs)
    .png()
    .toFile(cachePath);

  return { outputPath: cachePath, cached: false };
}
```

And in route body:

```js
const composeResult = await composeDemNeighborhoodOnce(z, x, y, extent);
await sendRasterFile(res, composeResult.outputPath, "image/png");
```

And add a guard assertion in tests to ensure non-JSON on success:

```js
expect(response.headers["content-type"]).not.toMatch(/application\/json/);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/raster.route.test.js -t "compose on cache miss|maps extent=2"`
Expected: PASS, second request reuses cache and extent=2 routes to 4x4 compose.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/src/routes/raster.js app/lancangriver/serve/test/raster.route.test.js
git commit -m "feat(raster): add dem compose cache route with extent"
```

### Task 3: Partial Neighborhood Behavior (TDD)

**Files:**

- Modify: `app/lancangriver/serve/test/raster.route.test.js`
- Modify: `app/lancangriver/serve/src/routes/raster.js`

- [ ] **Step 1: Write the failing test**

```js
it("fills failed neighbor fetches with transparent tiles and still returns png", async () => {
  const fetchDemPngTile = vi.fn(async (z, x, y) => {
    if (x === 0 && y === 0) {
      throw new Error("missing-source-tile");
    }
    return { path: `/tmp/fake/${z}/${x}/${y}/dem.png` };
  });

  const app = createApp({ raster: { fetchDemPngTile } });
  const response = await request(app).get(
    "/raster/dem/4/0/0/compose.png?extent=2",
  );

  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toMatch(/image\/png/);
  expect(response.body.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/raster.route.test.js -t "fills missing neighbors"`
Expected: FAIL because thrown source-tile fetch errors currently break composition.

- [ ] **Step 3: Write minimal implementation**

```js
// In compose loop
try {
  const result = await fetchDemPngTile(z, tile.x, tile.y);
  const path = result.pngPath ?? result.path;
  inputs.push({ input: path, left, top });
} catch {
  const blank = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  inputs.push({ input: blank, left, top });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/serve && npm test -- test/raster.route.test.js -t "compose.png|fills missing"`
Expected: PASS.

- [ ] **Step 5: Run focused suite + Commit**

```bash
cd app/lancangriver/serve
npm test -- test/raster.route.test.js
git add app/lancangriver/serve/src/routes/raster.js app/lancangriver/serve/test/raster.route.test.js
git commit -m "test(raster): cover dem compose extent and fallback behavior"
```

## Self-Review

1. Spec coverage:

- Route shape is `/raster/dem/:z/:x/:y/compose.png?extent={e}`: covered in Task 1.
- DEM-only compose flow: covered in Task 2.
- Extent semantics (`extent=1 -> 3x3`, `extent=2 -> 4x4`, general `extent+2`): covered in Task 1 and Task 2.
- Compose with sharp + save to disk + stream PNG response: covered in Task 2.
- Cache hit skips compose: covered in Task 2 test.
- Neighbor tile selection follows wrap-X + clamp-Y rule from focus-tile logic: covered in Task 2.
- Missing source tile behavior: covered in Task 3.

2. Placeholder scan:

- No `TBD`/`TODO` placeholders.
- Every code-changing step includes concrete code.
- Every verification step includes exact command and expected outcome.

3. Type/signature consistency:

- Route path consistently uses `/raster/dem/:z/:x/:y/compose.png`.
- Query params consistently use `extent`.
- Route success response consistently returns PNG bytes (`image/png`) rather than JSON metadata.
