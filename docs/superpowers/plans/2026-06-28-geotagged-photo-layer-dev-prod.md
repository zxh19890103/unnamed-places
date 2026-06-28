# Geotagged Photo Layer (DEV + PROD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a geotagged-photo data flow that works in both modes: DEV pulls photo metadata from the local Node service API, PROD opens a native folder dialog in Electron and returns the same normalized payload to the web client.

**Architecture:** Define one shared client-side photo record contract and normalization pipeline, then provide two mode-specific adapters (DEV HTTP adapter, PROD Electron IPC adapter). Service-side and Electron-side scanners both emit the same wire format so rendering logic remains mode-agnostic.

**Tech Stack:** Electron main/preload (Node.js), Express service, Vite + React + TypeScript client, Vitest + Supertest, EXIF parsing via exifr.

---

## File Structure Map

- Modify: `app/lancangriver/serve/package.json` (add EXIF parsing dependency)
- Create: `app/lancangriver/serve/src/photos/scanGeotaggedPhotos.js` (service-side folder scanner)
- Create: `app/lancangriver/serve/src/routes/photos.js` (DEV-only geotagged photo API route)
- Modify: `app/lancangriver/serve/src/server.js` (register route)
- Create: `app/lancangriver/serve/test/photos.route.test.js` (route tests)
- Modify: `app/main.js` (IPC handler for PROD folder picker + scanner)
- Modify: `app/preload.js` (expose photos bridge)
- Modify: `package.json` (add EXIF dependency for Electron main process)
- Create: `app/lancangriver/client/src/photos/types.ts` (shared client contract)
- Create: `app/lancangriver/client/src/photos/normalize.ts` (shared normalizer for both modes)
- Create: `app/lancangriver/client/src/photos/sources.ts` (mode switch + adapter calls)
- Create: `app/lancangriver/client/src/photos/sources.test.ts` (mode routing tests)
- Modify: `app/lancangriver/client/src/global.d.ts` (declare preload bridge)
- Modify: `app/lancangriver/client/src/App.tsx` (button click fetch flow)
- Modify: `app/lancangriver/client/package.json` (if needed for test helpers only)

### Task 1: Define Shared Photo Data Contract in Client

**Files:**

- Create: `app/lancangriver/client/src/photos/types.ts`
- Create: `app/lancangriver/client/src/photos/normalize.ts`
- Test: `app/lancangriver/client/src/photos/sources.test.ts`

- [ ] **Step 1: Write the failing test for normalization**

```ts
import { describe, expect, it } from "vitest";
import { normalizePhotoRecords } from "./normalize";

describe("normalizePhotoRecords", () => {
  it("maps mixed raw records into stable shape", () => {
    const result = normalizePhotoRecords([
      {
        id: "img-1",
        filePath: "/tmp/a.jpg",
        lat: 40.746,
        lng: 14.498,
        takenAt: "2024-01-02T03:04:05.000Z",
      },
      {
        filePath: "/tmp/b.jpg",
        latitude: 40.75,
        longitude: 14.49,
      },
    ]);

    expect(result).toEqual([
      {
        id: "img-1",
        filePath: "/tmp/a.jpg",
        lat: 40.746,
        lng: 14.498,
        takenAt: "2024-01-02T03:04:05.000Z",
      },
      {
        id: "/tmp/b.jpg",
        filePath: "/tmp/b.jpg",
        lat: 40.75,
        lng: 14.49,
        takenAt: null,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: FAIL with module-not-found or `normalizePhotoRecords is not defined`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lancangriver/client/src/photos/types.ts
export type PhotoRecord = {
  id: string;
  filePath: string;
  lat: number;
  lng: number;
  takenAt: string | null;
};

export type RawPhotoRecord = {
  id?: string;
  filePath?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  takenAt?: string | null;
};
```

```ts
// app/lancangriver/client/src/photos/normalize.ts
import type { PhotoRecord, RawPhotoRecord } from "./types";

export function normalizePhotoRecords(raw: RawPhotoRecord[]): PhotoRecord[] {
  return raw
    .filter((item) => typeof item.filePath === "string")
    .map((item) => {
      const lat = item.lat ?? item.latitude;
      const lng = item.lng ?? item.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") {
        return null;
      }

      return {
        id: item.id ?? item.filePath!,
        filePath: item.filePath!,
        lat,
        lng,
        takenAt: item.takenAt ?? null,
      };
    })
    .filter((item): item is PhotoRecord => item !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: PASS for `normalizePhotoRecords maps mixed raw records into stable shape`.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/photos/types.ts app/lancangriver/client/src/photos/normalize.ts app/lancangriver/client/src/photos/sources.test.ts
git commit -m "feat(client): add shared photo record contract and normalizer"
```

### Task 2: Add DEV Service Endpoint for Geotagged Photo Metadata

**Files:**

- Modify: `app/lancangriver/serve/package.json`
- Create: `app/lancangriver/serve/src/photos/scanGeotaggedPhotos.js`
- Create: `app/lancangriver/serve/src/routes/photos.js`
- Modify: `app/lancangriver/serve/src/server.js`
- Test: `app/lancangriver/serve/test/photos.route.test.js`

- [ ] **Step 1: Write failing route tests**

```js
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";

describe("GET /photos/geotagged", () => {
  it("returns normalized records", async () => {
    const scanGeotaggedPhotos = vi
      .fn()
      .mockResolvedValue([
        {
          id: "1",
          filePath: "/tmp/a.jpg",
          lat: 40.746,
          lng: 14.498,
          takenAt: null,
        },
      ]);

    const app = createApp({ scanGeotaggedPhotos });
    const response = await request(app)
      .get("/photos/geotagged")
      .query({ root: "/tmp" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      photos: [
        {
          id: "1",
          filePath: "/tmp/a.jpg",
          lat: 40.746,
          lng: 14.498,
          takenAt: null,
        },
      ],
    });
  });

  it("returns 400 when root is missing", async () => {
    const app = createApp({ scanGeotaggedPhotos: vi.fn() });
    const response = await request(app).get("/photos/geotagged");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ROOT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/serve && npm test -- test/photos.route.test.js`
Expected: FAIL because `/photos/geotagged` route is missing.

- [ ] **Step 3: Write minimal route + scanner implementation**

```js
// app/lancangriver/serve/src/photos/scanGeotaggedPhotos.js
import { readdir } from "node:fs/promises";
import path from "node:path";
import * as exifr from "exifr";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp"]);

export async function scanGeotaggedPhotos(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(root, entry.name))
    .filter((filePath) =>
      IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
    );

  const records = [];

  for (const filePath of files) {
    const gps = await exifr.gps(filePath).catch(() => null);
    if (
      !gps ||
      typeof gps.latitude !== "number" ||
      typeof gps.longitude !== "number"
    ) {
      continue;
    }

    records.push({
      id: filePath,
      filePath,
      lat: gps.latitude,
      lng: gps.longitude,
      takenAt: null,
    });
  }

  return records;
}
```

```js
// app/lancangriver/serve/src/routes/photos.js
import { Router } from "express";
import { scanGeotaggedPhotos as defaultScanGeotaggedPhotos } from "../photos/scanGeotaggedPhotos.js";

export function createPhotosRouter(options = {}) {
  const router = Router();
  const scanGeotaggedPhotos =
    options.scanGeotaggedPhotos ?? defaultScanGeotaggedPhotos;

  router.get("/photos/geotagged", async (req, res) => {
    const root = typeof req.query.root === "string" ? req.query.root : "";

    if (!root) {
      res
        .status(400)
        .json({
          error: {
            code: "INVALID_ROOT",
            reason: "Query param root is required",
          },
        });
      return;
    }

    const photos = await scanGeotaggedPhotos(root);
    res.status(200).json({ photos });
  });

  return router;
}
```

```js
// app/lancangriver/serve/src/server.js (add import + mount)
import { createPhotosRouter } from "./routes/photos.js";

// in createApp()
app.use(createPhotosRouter(options));
```

```json
// app/lancangriver/serve/package.json (dependencies)
{
  "dependencies": {
    "exifr": "^7.1.3"
  }
}
```

- [ ] **Step 4: Run service tests to verify route passes**

Run: `cd app/lancangriver/serve && npm install && npm test -- test/photos.route.test.js`
Expected: PASS for `/photos/geotagged` success and 400 validation cases.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/package.json app/lancangriver/serve/package-lock.json app/lancangriver/serve/src/photos/scanGeotaggedPhotos.js app/lancangriver/serve/src/routes/photos.js app/lancangriver/serve/src/server.js app/lancangriver/serve/test/photos.route.test.js
git commit -m "feat(serve): add dev geotagged photos endpoint"
```

### Task 3: Add PROD Electron IPC Source Returning Same Contract

**Files:**

- Modify: `package.json`
- Modify: `app/main.js`
- Modify: `app/preload.js`
- Modify: `app/lancangriver/client/src/global.d.ts`

- [ ] **Step 1: Write failing client-side bridge test**

```ts
import { describe, expect, it, vi } from "vitest";
import { getProdPhotosViaElectron } from "./sources";

describe("getProdPhotosViaElectron", () => {
  it("calls preload bridge and returns normalized records", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue([
        { filePath: "/tmp/a.jpg", lat: 40.746, lng: 14.498, takenAt: null },
      ]);

    (globalThis as any).window = {
      electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
    };

    const result = await getProdPhotosViaElectron();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result[0].id).toBe("/tmp/a.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: FAIL because `window.electronPhotos` bridge is missing and `getProdPhotosViaElectron` is not implemented.

- [ ] **Step 3: Implement Electron IPC and preload bridge**

```js
// app/main.js (imports)
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import * as exifr from "exifr";

async function scanFolderForGeotaggedPhotos(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(rootPath, entry.name))
    .filter((filePath) =>
      [".jpg", ".jpeg", ".png", ".heic", ".webp"].includes(
        extname(filePath).toLowerCase(),
      ),
    );

  const result = [];
  for (const filePath of files) {
    const gps = await exifr.gps(filePath).catch(() => null);
    if (!gps?.latitude || !gps?.longitude) continue;

    result.push({
      id: filePath,
      filePath,
      lat: gps.latitude,
      lng: gps.longitude,
      takenAt: null,
    });
  }

  return result;
}

ipcMain.handle("photos:pick-and-load", async () => {
  const focusedWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const selection = await dialog.showOpenDialog(focusedWindow, {
    title: "Select photo folder",
    properties: ["openDirectory"],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return [];
  }

  return scanFolderForGeotaggedPhotos(selection.filePaths[0]);
});
```

```js
// app/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronPhotos", {
  pickAndLoadGeotaggedPhotos: () => ipcRenderer.invoke("photos:pick-and-load"),
});
```

```ts
// app/lancangriver/client/src/global.d.ts
declare global {
  interface Window {
    electronPhotos?: {
      pickAndLoadGeotaggedPhotos: () => Promise<unknown[]>;
    };
  }
}

export {};
```

```json
// package.json (root dependencies)
{
  "dependencies": {
    "exifr": "^7.1.3"
  }
}
```

- [ ] **Step 4: Run targeted checks**

Run: `npm install && npm run dev:electron`
Expected: Electron launches without preload/contextBridge errors.

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: PASS for preload bridge invocation test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/main.js app/preload.js app/lancangriver/client/src/global.d.ts app/lancangriver/client/src/photos/sources.test.ts
git commit -m "feat(electron): add prod photo folder picker bridge"
```

### Task 4: Build Mode-Aware Client Source Adapter (DEV API vs PROD IPC)

**Files:**

- Create: `app/lancangriver/client/src/photos/sources.ts`
- Modify: `app/lancangriver/client/src/photos/sources.test.ts`
- Modify: `app/lancangriver/client/src/App.tsx`

- [ ] **Step 1: Write failing source-routing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchGeotaggedPhotos } from "./sources";

describe("fetchGeotaggedPhotos", () => {
  it("uses DEV service adapter when mode is dev", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photos: [
          { filePath: "/tmp/a.jpg", lat: 40.7, lng: 14.4, takenAt: null },
        ],
      }),
    });

    (globalThis as any).fetch = fetchMock;

    const photos = await fetchGeotaggedPhotos({ mode: "dev", devRoot: "/tmp" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4050/photos/geotagged?root=%2Ftmp",
    );
    expect(photos).toHaveLength(1);
  });

  it("uses PROD bridge adapter when mode is prod", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue([
        { filePath: "/tmp/b.jpg", lat: 40.8, lng: 14.5, takenAt: null },
      ]);

    (globalThis as any).window = {
      electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
    };

    const photos = await fetchGeotaggedPhotos({ mode: "prod" });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(photos[0].id).toBe("/tmp/b.jpg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: FAIL because `fetchGeotaggedPhotos` routing is not implemented.

- [ ] **Step 3: Implement mode-aware source adapter and App button action**

```ts
// app/lancangriver/client/src/photos/sources.ts
import { normalizePhotoRecords } from "./normalize";
import type { PhotoRecord } from "./types";

type FetchOptions = { mode: "dev"; devRoot: string } | { mode: "prod" };

export async function getProdPhotosViaElectron(): Promise<PhotoRecord[]> {
  const raw = await window.electronPhotos?.pickAndLoadGeotaggedPhotos?.();
  return normalizePhotoRecords(Array.isArray(raw) ? raw : []);
}

async function getDevPhotosViaService(devRoot: string): Promise<PhotoRecord[]> {
  const url = `http://localhost:4050/photos/geotagged?root=${encodeURIComponent(devRoot)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DEV photos API failed: ${response.status}`);
  }

  const body = await response.json();
  return normalizePhotoRecords(Array.isArray(body.photos) ? body.photos : []);
}

export async function fetchGeotaggedPhotos(
  options: FetchOptions,
): Promise<PhotoRecord[]> {
  if (options.mode === "dev") {
    return getDevPhotosViaService(options.devRoot);
  }
  return getProdPhotosViaElectron();
}
```

```tsx
// app/lancangriver/client/src/App.tsx (add button callback)
import { fetchGeotaggedPhotos } from "./photos/sources";

const mode = import.meta.env.DEV ? "dev" : "prod";

const handleLoadPhotos = async () => {
  const photos =
    mode === "dev"
      ? await fetchGeotaggedPhotos({ mode: "dev", devRoot: "/tmp/photos" })
      : await fetchGeotaggedPhotos({ mode: "prod" });

  console.log("Loaded geotagged photos", photos);
};
```

```tsx
// app/lancangriver/client/src/App.tsx (render)
<button
  type="button"
  onClick={() => void handleLoadPhotos()}
  className="absolute left-4 bottom-4 z-40 rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900"
>
  Load geotagged photos
</button>
```

- [ ] **Step 4: Run tests and DEV smoke check**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: PASS for both mode routing tests.

Run: `npm run dev`
Expected: client, service, electron start; DEV button logs normalized photo array from API.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/photos/sources.ts app/lancangriver/client/src/photos/sources.test.ts app/lancangriver/client/src/App.tsx
git commit -m "feat(client): add dev/prod geotagged photo source routing"
```

### Task 5: Enforce Mode Boundaries and Shared Logic Regression Tests

**Files:**

- Modify: `app/lancangriver/client/src/photos/sources.test.ts`
- Modify: `app/lancangriver/serve/test/photos.route.test.js`

- [ ] **Step 1: Add failing guardrail tests for mode boundaries**

```ts
it("does not call Electron bridge in dev mode", async () => {
  const invoke = vi.fn();
  (globalThis as any).window = {
    electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
  };
  (globalThis as any).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ photos: [] }),
  });

  await fetchGeotaggedPhotos({ mode: "dev", devRoot: "/tmp" });
  expect(invoke).not.toHaveBeenCalled();
});

it("does not call DEV API in prod mode", async () => {
  const fetchMock = vi.fn();
  const invoke = vi.fn().mockResolvedValue([]);

  (globalThis as any).fetch = fetchMock;
  (globalThis as any).window = {
    electronPhotos: { pickAndLoadGeotaggedPhotos: invoke },
  };

  await fetchGeotaggedPhotos({ mode: "prod" });
  expect(fetchMock).not.toHaveBeenCalled();
});
```

```js
it("returns an empty photos list when scanner returns none", async () => {
  const scanGeotaggedPhotos = vi.fn().mockResolvedValue([]);
  const app = createApp({ scanGeotaggedPhotos });

  const response = await request(app)
    .get("/photos/geotagged")
    .query({ root: "/tmp" });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ photos: [] });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts`
Expected: FAIL before guard logic adjustments.

Run: `cd app/lancangriver/serve && npm test -- test/photos.route.test.js`
Expected: FAIL before route edge case is handled.

- [ ] **Step 3: Implement minimal fixes to satisfy guardrails**

```ts
// app/lancangriver/client/src/photos/sources.ts
export async function getProdPhotosViaElectron(): Promise<PhotoRecord[]> {
  if (!window.electronPhotos?.pickAndLoadGeotaggedPhotos) {
    return [];
  }

  const raw = await window.electronPhotos.pickAndLoadGeotaggedPhotos();
  return normalizePhotoRecords(Array.isArray(raw) ? raw : []);
}
```

```js
// app/lancangriver/serve/src/routes/photos.js
router.get("/photos/geotagged", async (req, res) => {
  // ...existing validation...
  const photos = await scanGeotaggedPhotos(root);
  res.status(200).json({ photos: Array.isArray(photos) ? photos : [] });
});
```

- [ ] **Step 4: Run full relevant test suites**

Run: `cd app/lancangriver/client && npm test`
Expected: PASS for all client tests.

Run: `cd app/lancangriver/serve && npm test`
Expected: PASS for all service tests including new photos route tests.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/photos/sources.ts app/lancangriver/client/src/photos/sources.test.ts app/lancangriver/serve/src/routes/photos.js app/lancangriver/serve/test/photos.route.test.js
git commit -m "test: enforce dev/prod photo source boundaries"
```

### Task 6: Document DEV/PROD Photo Workflow and Manual Validation

**Files:**

- Modify: `app/lancangriver/README.md`
- Modify: `app/lancangriver/serve/README.md`

- [ ] **Step 1: Write failing documentation check (manual gate)**

```md
Checklist before merge:

- README explains DEV mode uses `/photos/geotagged` API.
- README explains PROD mode uses Electron folder picker.
- Both docs state that payload contract is identical (`id`, `filePath`, `lat`, `lng`, `takenAt`).
```

- [ ] **Step 2: Run manual check and confirm current docs fail the checklist**

Run: `grep -n "photos/geotagged\|folder picker\|payload contract" app/lancangriver/README.md app/lancangriver/serve/README.md`
Expected: missing entries before edits.

- [ ] **Step 3: Add minimal docs sections**

```md
## Geotagged Photos Mode Matrix

- DEV (`npm run dev`): client button calls `GET /photos/geotagged?root=...` on local service.
- PROD (packaged Electron): client button triggers preload bridge `window.electronPhotos.pickAndLoadGeotaggedPhotos()`.
- Shared client payload contract:
  - `id: string`
  - `filePath: string`
  - `lat: number`
  - `lng: number`
  - `takenAt: string | null`
```

- [ ] **Step 4: Re-run manual check**

Run: `grep -n "photos/geotagged\|folder picker\|payload contract" app/lancangriver/README.md app/lancangriver/serve/README.md`
Expected: matches found in both docs.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/README.md app/lancangriver/serve/README.md
git commit -m "docs: describe dev/prod geotagged photo flow"
```

## Verification Matrix (before final merge)

1. Run: `cd app/lancangriver/client && npm test`
   Expected: all Vitest specs pass including photo source routing.

2. Run: `cd app/lancangriver/serve && npm test`
   Expected: all Vitest/Supertest specs pass including `/photos/geotagged`.

3. Run: `npm run dev`
   Expected: DEV button loads via service API and logs normalized array.

4. Run: `npm run pack:mac`
   Expected: packaged app starts and PROD button opens folder picker, returning normalized records.

## Self-Review

- Spec coverage check: plan includes DEV API path, PROD folder dialog path, and shared client contract/normalizer used by both modes.
- Placeholder scan: no `TODO`, `TBD`, or "write tests later" placeholders remain.
- Type consistency: shared record keys are consistently `id`, `filePath`, `lat`, `lng`, `takenAt` across service, Electron, and client steps.
