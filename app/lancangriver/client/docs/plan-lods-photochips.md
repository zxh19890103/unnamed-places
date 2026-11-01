## Recommended approach

Add a **hierarchical chip pyramid**, and let map zoom choose which level to display. Keep the existing `0.1°` journey grouping unchanged initially.

### Current behavior

- `journey.ts` groups coordinates using `toFixed(1)`.
- `Map App` renders those fixed groups, using their average coordinates and first photo.
- Selection returns a chip key that the `parent page` resolves against the original groups.

Therefore, changing only marker rendering would leave selection inconsistent.

## 1. Generate genuinely nested chips

Use a **Web Mercator quadtree**, matching Leaflet’s map projection, rather than independently rounding coordinates to different decimal precisions.

Each chip has:

```ts
type PhotoChip = {
  id: string; // level/x/y
  level: number;
  parentId: string | null;
  childIds: string[];
  photoCount: number;
  representativePhotoId: string;
  representativeLat: number;
  representativeLng: number;
};
```

Maintain photo membership separately, referencing existing records rather than copying full photo arrays into every level.

Generation:

1. Assign each valid photo to a finest-level cell.
2. Aggregate occupied cells upward.
3. Compute counts and representatives from actual member photos.
4. Choose representative photos deterministically—for example, nearest to the chip’s centroid, breaking ties by photo ID.

This gives stable representatives within a level and more local representatives when chips split.

## 2. Connect zoom to LOD

Start with `chipLevel = mapZoom + 2`, bounded by supported levels. This corresponds to roughly 64-pixel cells for the current 48-pixel badges.

Illustrative sizes at the equator:

| Map zoom | Chip level | Approximate cell width |
| -------- | ---------: | ---------------------: |
| 6        |          8 |                 156 km |
| 10       |         12 |                 9.8 km |
| 14       |         16 |                  610 m |
| 18       |         20 |                   38 m |

These are starting values, to tune visually—not fixed geographic distances everywhere.

In `Map App`:

- Reconcile markers on `zoomend` and `moveend`.
- Render only the selected level’s visible chips, with a viewport margin.
- Reuse markers by chip ID instead of clearing all layers.
- Fit bounds only when a new dataset arrives, never during LOD updates.
- Keep co-located photos grouped at maximum detail.

**Important:** fixed grid cells do not guarantee collision-free centroid markers; check overlap during browser validation.

## 3. Preserve correct selection

Recommended interaction:

- **Aggregate chip:** click to zoom into its member bounds and reveal finer chips.
- **Single-photo chip:** select that photo.
- **Finest-level multi-photo chip:** open exactly that chip’s photos.

Replace CSS-class parsing with marker handlers that capture chip IDs directly.

Update the `iframe bridge` to carry typed LOD selections. The parent must resolve membership from the LOD index—not search the legacy `geoNodes` or silently open a larger `0.1°` group.

Include a ready handshake and dataset revision so reloads and stale selections are handled reliably.

## 4. Implementation sequence

1. **Data layer:** add shared chip types and a pure hierarchy builder; leave existing journey outputs intact.
2. **Map integration:** select LOD by zoom, filter by viewport, and reconcile markers.
3. **Selection integration:** update messages and resolve selected chip membership into the existing photo-opening workflow.
4. **Validation and documentation:** document the hierarchy, zoom policy, and selection contract.

Everything can initially run client-side using the already-loaded photo records. **No service or database migration is needed.**

## 5. Acceptance criteria

- Zooming in splits occupied chips; zooming out merges them.
- Parent counts equal the sum of child counts; no photos disappear or duplicate within a level.
- Representatives remain identical after zooming away and back.
- Clicking opens precisely the displayed group’s membership.
- Panning and zooming never reset the camera.
- Boundary cases cover negative coordinates, the antimeridian, Mercator latitude limits, empty datasets, and identical locations.
- Run client build/typecheck and browser checks; target marker updates below **100 ms** on an agreed representative dataset.

**Scope recommendation:** ship map LOD first; defer changing the timeline’s grouping and automatic 3D LOD to a separate update.
