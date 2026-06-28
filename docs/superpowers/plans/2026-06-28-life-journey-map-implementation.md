# Life Journey Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-panel, day-based Life Journey Map that derives from loaded geotagged photos on the client and focuses camera via existing ground-orbit logic.

**Architecture:** Keep source fetching unchanged, add a pure journey transform module, render a dedicated Journey panel component, and wire App state so day-card clicks call the existing `focusGroundOrbitAtLatLngRef` handler. No backend/API changes.

**Tech Stack:** React + TypeScript + Vite + Vitest in `app/lancangriver/client`.

---

## File Structure Map

Create:

- `app/lancangriver/client/src/photos/journey.ts` (pure grouping/aggregation)
- `app/lancangriver/client/src/photos/journey.test.ts` (unit tests for grouping logic)
- `app/lancangriver/client/src/photos/JourneyPanel.tsx` (left panel UI)

Modify:

- `app/lancangriver/client/src/photos/types.ts` (journey types)
- `app/lancangriver/client/src/App.tsx` (journey state, click focus wiring)

Optional (only if existing test setup supports component tests smoothly):

- `app/lancangriver/client/src/photos/JourneyPanel.test.tsx`

## Task 1: Add Journey Domain Types

**Files:**

- Modify: `app/lancangriver/client/src/photos/types.ts`
- Test: `app/lancangriver/client/src/photos/journey.test.ts`

- [ ] **Step 1: Write failing type-usage test scaffold**

```ts
import { describe, expect, it } from "vitest";
import type { JourneyDayNode } from "./types";

describe("JourneyDayNode type", () => {
  it("supports required fields", () => {
    const sample: JourneyDayNode = {
      dayKey: "2026-06-28",
      displayLabel: "2026-06-28",
      photoCount: 2,
      representativeLat: 40.746,
      representativeLng: 14.498,
      placeChips: ["40.75, 14.50"],
      photoIds: ["1", "2"],
    };

    expect(sample.photoCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app/lancangriver/client && npm test -- src/photos/journey.test.ts`
Expected: FAIL because `JourneyDayNode` type is not declared yet.

- [ ] **Step 3: Add journey types in `types.ts`**

```ts
export type JourneyDayNode = {
  dayKey: string;
  displayLabel: string;
  photoCount: number;
  representativeLat: number;
  representativeLng: number;
  placeChips: string[];
  photoIds: string[];
};

export type JourneyBuildResult = {
  days: JourneyDayNode[];
  skippedInvalidCoordinateCount: number;
};
```

- [ ] **Step 4: Re-run test to verify pass**

Run: `cd app/lancangriver/client && npm test -- src/photos/journey.test.ts`
Expected: PASS for type-usage test.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/photos/types.ts app/lancangriver/client/src/photos/journey.test.ts
git commit -m "feat(client): add journey timeline domain types"
```

## Task 2: Implement Journey Transform Logic

**Files:**

- Create: `app/lancangriver/client/src/photos/journey.ts`
- Modify: `app/lancangriver/client/src/photos/journey.test.ts`

- [ ] **Step 1: Write failing behavior tests**

```ts
import { describe, expect, it } from "vitest";
import { buildJourneyDays } from "./journey";

describe("buildJourneyDays", () => {
  it("groups parseable timestamps by local day", () => {
    const result = buildJourneyDays([
      {
        id: "1",
        filePath: "a.jpg",
        lat: 40,
        lng: 14,
        takenAt: "2026-06-28T08:00:00.000Z",
      },
      {
        id: "2",
        filePath: "b.jpg",
        lat: 40.1,
        lng: 14.1,
        takenAt: "2026-06-28T10:00:00.000Z",
      },
    ]);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].photoCount).toBe(2);
  });

  it("routes missing/invalid takenAt to unknown-date", () => {
    const result = buildJourneyDays([
      { id: "1", filePath: "a.jpg", lat: 40, lng: 14, takenAt: null },
      { id: "2", filePath: "b.jpg", lat: 41, lng: 15, takenAt: "not-a-date" },
    ]);

    expect(result.days.at(-1)?.dayKey).toBe("unknown-date");
  });

  it("skips invalid coordinates and tracks skipped count", () => {
    const result = buildJourneyDays([
      { id: "1", filePath: "a.jpg", lat: 40, lng: 14, takenAt: null },
      { id: "2", filePath: "b.jpg", lat: Number.NaN, lng: 15, takenAt: null },
    ]);

    expect(result.skippedInvalidCoordinateCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd app/lancangriver/client && npm test -- src/photos/journey.test.ts`
Expected: FAIL because `buildJourneyDays` is missing.

- [ ] **Step 3: Implement minimal transform in `journey.ts`**

```ts
import type { JourneyBuildResult, JourneyDayNode, PhotoRecord } from "./types";

function toDayKey(takenAt: string | null): string {
  if (!takenAt) return "unknown-date";
  const d = new Date(takenAt);
  if (Number.isNaN(d.getTime())) return "unknown-date";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toPlaceChip(lat: number, lng: number): string {
  return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

export function buildJourneyDays(records: PhotoRecord[]): JourneyBuildResult {
  const buckets = new Map<string, PhotoRecord[]>();
  let skippedInvalidCoordinateCount = 0;

  for (const record of records) {
    if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) {
      skippedInvalidCoordinateCount += 1;
      continue;
    }
    const dayKey = toDayKey(record.takenAt);
    const list = buckets.get(dayKey) ?? [];
    list.push(record);
    buckets.set(dayKey, list);
  }

  const days: JourneyDayNode[] = [...buckets.entries()].map(
    ([dayKey, list]) => {
      const photoCount = list.length;
      const representativeLat =
        list.reduce((sum, p) => sum + p.lat, 0) / photoCount;
      const representativeLng =
        list.reduce((sum, p) => sum + p.lng, 0) / photoCount;
      const placeChips = [
        ...new Set(list.map((p) => toPlaceChip(p.lat, p.lng))),
      ];

      return {
        dayKey,
        displayLabel: dayKey === "unknown-date" ? "Unknown Date" : dayKey,
        photoCount,
        representativeLat,
        representativeLng,
        placeChips,
        photoIds: list.map((p) => p.id),
      };
    },
  );

  days.sort((a, b) => {
    if (a.dayKey === "unknown-date") return 1;
    if (b.dayKey === "unknown-date") return -1;
    return b.dayKey.localeCompare(a.dayKey);
  });

  return { days, skippedInvalidCoordinateCount };
}
```

- [ ] **Step 4: Re-run tests**

Run: `cd app/lancangriver/client && npm test -- src/photos/journey.test.ts`
Expected: PASS for grouping, unknown-date, and skipped-coordinate tests.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/photos/journey.ts app/lancangriver/client/src/photos/journey.test.ts
git commit -m "feat(client): add day-based journey transform"
```

## Task 3: Build Journey Panel UI Component

**Files:**

- Create: `app/lancangriver/client/src/photos/JourneyPanel.tsx`
- Optional Test: `app/lancangriver/client/src/photos/JourneyPanel.test.tsx`

- [ ] **Step 1: Write failing render test (optional if setup supports it)**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JourneyPanel } from "./JourneyPanel";

describe("JourneyPanel", () => {
  it("renders cards and handles click", () => {
    const onSelect = vi.fn();
    render(
      <JourneyPanel
        days={[
          {
            dayKey: "2026-06-28",
            displayLabel: "2026-06-28",
            photoCount: 2,
            representativeLat: 40,
            representativeLng: 14,
            placeChips: ["40.00, 14.00"],
            photoIds: ["1", "2"],
          },
        ]}
        selectedDayKey={null}
        onSelectDay={onSelect}
      />,
    );

    fireEvent.click(screen.getByText("2026-06-28"));
    expect(onSelect).toHaveBeenCalledWith("2026-06-28");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd app/lancangriver/client && npm test -- src/photos/JourneyPanel.test.tsx`
Expected: FAIL because component does not exist yet.

- [ ] **Step 3: Implement component**

```tsx
import type { JourneyDayNode } from "./types";

type Props = {
  days: JourneyDayNode[];
  selectedDayKey: string | null;
  loading: boolean;
  error: string | null;
  onSelectDay: (dayKey: string) => void;
};

export function JourneyPanel({
  days,
  selectedDayKey,
  loading,
  error,
  onSelectDay,
}: Props) {
  return (
    <aside className="fixed left-4 top-4 z-40 w-[320px] max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-slate-950/70 p-3 text-white backdrop-blur-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
        Life Journey
      </h2>

      {loading && <p className="text-xs text-slate-300">Loading photos...</p>}
      {!loading && error && <p className="text-xs text-rose-300">{error}</p>}
      {!loading && !error && days.length === 0 && (
        <p className="text-xs text-slate-300">No geotagged photos found</p>
      )}

      <div className="mt-2 space-y-2 overflow-y-auto pr-1">
        {days.map((day) => {
          const selected = selectedDayKey === day.dayKey;
          return (
            <button
              key={day.dayKey}
              type="button"
              onClick={() => onSelectDay(day.dayKey)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selected
                  ? "border-sky-400 bg-sky-500/20"
                  : "border-slate-700 bg-slate-900/50 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{day.displayLabel}</span>
                <span className="text-xs text-slate-300">
                  {day.photoCount} photos
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {day.placeChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run target tests (if component test added) or typecheck**

Run (test path): `cd app/lancangriver/client && npm test -- src/photos/JourneyPanel.test.tsx`
Expected: PASS.

Run (fallback): `cd app/lancangriver/client && npm run typecheck`
Expected: PASS for component typing.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/photos/JourneyPanel.tsx app/lancangriver/client/src/photos/JourneyPanel.test.tsx
git commit -m "feat(client): add life journey left panel component"
```

## Task 4: Wire Journey State and Ground-Orbit Focus in App

**Files:**

- Modify: `app/lancangriver/client/src/App.tsx`
- Modify: `app/lancangriver/client/src/photos/types.ts` (if needed)

- [ ] **Step 1: Add failing app-level behavior test or focused function test**

If App tests are not currently set up, add a focused unit around selection handler logic in `journey.test.ts` by extracting a helper.

```ts
// pseudo-target: verify selecting a day triggers focus callback with representative coordinates
expect(focusMock).toHaveBeenCalledWith({ lat: 40.746, lng: 14.498 });
```

- [ ] **Step 2: Run test to confirm failure before wiring**

Run: `cd app/lancangriver/client && npm test -- src/photos/journey.test.ts`
Expected: FAIL for missing selection/focus hook logic (if added as helper test).

- [ ] **Step 3: Implement App wiring**

Required changes in `App.tsx`:

- Add state:
  - `const [journeyDays, setJourneyDays] = useState<JourneyDayNode[]>([]);`
  - `const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);`
  - `const [journeyError, setJourneyError] = useState<string | null>(null);`
  - `const [journeyLoading, setJourneyLoading] = useState(false);`
- In `handleLoadGeotaggedPhotos`:
  - set loading true
  - fetch photos
  - `const result = buildJourneyDays(photos)`
  - update state and clear/set error
  - keep previous data on fetch failure
- Add `handleSelectJourneyDay(dayKey)`:
  - set selected day
  - lookup node
  - call `focusGroundOrbitAtLatLngRef.current?.({ lat: node.representativeLat, lng: node.representativeLng })`
  - `catch` and `console.warn` only
- Render `<JourneyPanel ... />` left side with state and callback.

- [ ] **Step 4: Run client tests and typecheck**

Run: `cd app/lancangriver/client && npm test -- src/photos/journey.test.ts src/photos/sources.test.ts`
Expected: PASS.

Run: `cd app/lancangriver/client && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/client/src/App.tsx app/lancangriver/client/src/photos/journey.ts app/lancangriver/client/src/photos/JourneyPanel.tsx app/lancangriver/client/src/photos/types.ts
git commit -m "feat(client): wire life journey panel to ground-orbit focus"
```

## Task 5: Final Verification and Dev Sanity Check

**Files:**

- No new files required; validation only.

- [ ] **Step 1: Run full targeted photo/journey tests**

Run: `cd app/lancangriver/client && npm test -- src/photos/sources.test.ts src/photos/journey.test.ts`
Expected: PASS.

- [ ] **Step 2: Run project client test suite (known pre-existing failures allowed if unchanged)**

Run: `cd app/lancangriver/client && npm test`
Expected: Journey/photo tests pass; document any unrelated known failures without modifying unrelated modules.

- [ ] **Step 3: Run typecheck + build**

Run: `cd app/lancangriver/client && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual dev sanity check**

Run: `npm run dev`
Expected:

- Load geotagged photos populates left journey panel.
- Day card click focuses camera via existing ground-orbit behavior.
- Empty/error states behave as spec defines.

- [ ] **Step 5: Commit final polish (if any)**

```bash
git add app/lancangriver/client/src/photos app/lancangriver/client/src/App.tsx
git commit -m "test: verify life journey flow and interaction stability"
```

## Spec Coverage Checklist

- Day-based grouping: covered in Task 2 tests and transformer implementation.
- One day card with multi-place chips: covered in Task 2 + Task 3.
- Left side panel UI: covered in Task 3 + Task 4.
- Camera focus must use existing `focusGroundOrbitAtLatLngRef`: explicitly wired in Task 4.
- No backend changes: all tasks scoped to client only.
- Error/empty handling: covered in Task 3 + Task 4.

## Notes for Implementer

- Avoid introducing any new camera control path; call only existing `focusGroundOrbitAtLatLngRef` integration point.
- Keep journey aggregation pure and deterministic to simplify testing.
- Preserve existing App behavior (flat map modal and scene monitor) while adding panel UI.
