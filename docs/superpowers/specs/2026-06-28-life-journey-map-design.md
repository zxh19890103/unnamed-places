# Life Journey Map Design

## Goal

Add a storytelling-first Life Journey Map to the Lancangriver client that turns loaded geotagged photos into a day-based timeline shown in a left side panel while keeping the globe as the main canvas.

## Scope

In scope:

- Client-only timeline derivation from already loaded photo records.
- Day-based grouping with support for multi-place chips inside a day.
- Left side panel timeline UI.
- Day-card click focuses the globe using existing ground-orbit camera flow.

Out of scope:

- Backend schema or endpoint changes.
- Reverse geocoding/place-name services.
- New camera system or control mode implementation.
- Social sharing/export features.

## Existing Constraints and Decisions

- Chosen direction: storytelling features.
- First storytelling feature: Life Journey Map.
- Grouping unit: day.
- Multi-place days: one day card with multiple place chips.
- UI location: left side panel.
- Camera movement must follow existing logic through `focusGroundOrbitAtLatLngRef` in App, which routes into current ground-orbit behavior.

## Architecture

### High-Level Flow

1. User loads photos through existing button in App.
2. Existing photo source logic returns normalized `PhotoRecord[]`.
3. New journey transformer converts photos into day nodes.
4. Left panel renders day cards.
5. Clicking a day card focuses the globe by calling existing focus handler.

### Layer Boundaries

- Source layer: fetch and normalize photo records (existing).
- Journey layer: pure grouping and aggregation (new).
- UI layer: left panel rendering and selection state (new).
- App orchestration: wires photo load, journey state, and focus callback (existing file updates).

## Components and File Plan

Create:

- `app/lancangriver/client/src/photos/journey.ts`
  - Pure transform utilities from `PhotoRecord[]` to journey day nodes.
- `app/lancangriver/client/src/photos/JourneyPanel.tsx`
  - Left panel UI component.
- `app/lancangriver/client/src/photos/journey.test.ts`
  - Unit tests for grouping and aggregation.

Modify:

- `app/lancangriver/client/src/App.tsx`
  - Manage journey state, render panel, handle day-card click focus.
- `app/lancangriver/client/src/photos/types.ts`
  - Add journey node types if needed.

Optional test file (if test stack already supports component tests cleanly):

- `app/lancangriver/client/src/photos/JourneyPanel.test.tsx`

## Data Model

### Input (existing)

`PhotoRecord`

- `id: string`
- `filePath: string`
- `lat: number`
- `lng: number`
- `takenAt: string | null`

### New Derived Types

`JourneyDayNode`

- `dayKey: string` (for example `2026-06-28` or `unknown-date`)
- `displayLabel: string` (human-readable day label)
- `photoCount: number`
- `representativeLat: number`
- `representativeLng: number`
- `placeChips: string[]`
- `photoIds: string[]`

`JourneyBuildResult`

- `days: JourneyDayNode[]`
- `skippedInvalidCoordinateCount: number`

## Grouping and Aggregation Rules

### Day Grouping

- If `takenAt` is parseable as a valid date, group by local calendar day (`YYYY-MM-DD`).
- If `takenAt` is missing or invalid, route photo to `unknown-date` bucket.

### Ordering

- Known date buckets sorted descending by day (newest first).
- `unknown-date` bucket shown last.

### Representative Coordinate

- Use centroid average across all valid lat/lng in a day bucket.
- If a bucket ends up with no valid coordinates, drop that bucket from focusable list.

### Multi-Place Chips

- Use lightweight coordinate bins to create place chips without external services.
- Initial chip format: rounded coordinate labels (for example `40.75, 14.50`).
- Deduplicate chips per day.

## UI and Interaction Design

### Left Panel

- Fixed left panel over globe.
- Scrollable day-card list.
- Each card shows:
  - day label
  - photo count
  - place chips

### Card Selection and Focus

- On card click:
  1. mark selected card in panel
  2. call `focusGroundOrbitAtLatLngRef.current({ lat, lng })` if available
- No alternate camera path is allowed.
- This preserves existing mode switching and tile/compositor behavior.

### Empty and Error States

- No data: show `No geotagged photos found`.
- Load failure: show `Could not load photos` and preserve previous timeline if available.

## Error Handling

- Invalid coordinate records are skipped, not fatal.
- Missing/invalid `takenAt` records are kept in `unknown-date`.
- If focus callback ref is null, keep selection state and do not crash.
- Any focus promise rejection is non-fatal and should log warning only.

## Performance

- Build journey data once per photo-load action.
- Keep transform pure and linear with dataset size.
- Avoid per-frame computation in render loop.
- No additional network requests for timeline interactions.

## Testing Strategy

### Unit Tests (required)

`journey.test.ts`

- groups valid `takenAt` photos by day.
- places missing/invalid `takenAt` into unknown bucket.
- computes representative centroid correctly.
- builds multiple place chips for multi-place day.
- skips invalid coordinates and tracks skipped count.
- sorts days with unknown bucket last.

### UI/Interaction Tests

- If component test infra is available, test `JourneyPanel` click callback and selected styling.
- At minimum, test App-level day-click handler invokes focus callback with representative lat/lng.

### Regression Safety

- Existing photo source tests remain green.
- No changes to server route contracts.

## Rollout Plan

1. Add journey types and transform module with tests.
2. Add panel component.
3. Wire App state and click-to-focus using existing focus ref.
4. Add/adjust tests.
5. Visual sanity check in dev mode with real photo dataset.

## Success Criteria

- Loading photos produces visible day cards in left panel.
- Multi-place day appears as one card with multiple chips.
- Clicking a day card moves camera through existing ground-orbit path.
- No backend changes required.
- No frame-loop regressions introduced.
