# Hierarchical Photo Chip LOD System

## Overview

The photo chip Level-of-Detail (LOD) system provides a hierarchical quadtree pyramid of photo markers on the 2D map (`photos-on-map`), synchronized with the 3D terrain viewer (`photoview-in-3d`).

Previously, photo markers were grouped using a fixed `0.1°` coordinate rounding, causing marker clustering and selection to be static regardless of map zoom. The LOD system builds a Web Mercator quadtree hierarchy matching Leaflet's projection and dynamically adjusts the displayed chip level based on map zoom.

---

## 1. Hierarchy Structure & Web Mercator Quadtree

### Cell Indexing
Every photo chip is identified by standard Web Mercator tile coordinates:
```
id: `${level}/${x}/${y}`
```
where:
- `level` is an integer in the range `[DEFAULT_MIN_CHIP_LEVEL, DEFAULT_MAX_CHIP_LEVEL]` (default: 2 to 20).
- `x` and `y` are integer tile coordinates in `[0, 2^level - 1]`.

### Projection Formulas
Given latitude $\phi \in [-85.05112878, 85.05112878]$ and longitude $\lambda \in [-180, 180]$ at level $z$:
$$n = 2^z$$
$$x = \left\lfloor \frac{\lambda + 180}{360} \cdot n \right\rfloor$$
$$y = \left\lfloor \left(1 - \frac{\ln(\tan(\phi \cdot \frac{\pi}{180}) + \sec(\phi \cdot \frac{\pi}{180}))}{\pi}\right) / 2 \cdot n \right\rfloor$$

Parent tile coordinates at level $z - 1$:
$$x_{\text{parent}} = \lfloor x / 2 \rfloor, \quad y_{\text{parent}} = \lfloor y / 2 \rfloor$$

### Upward Aggregation
1. **Finest cell assignment**: Each valid photo is assigned to its cell at `maxLevel` (level 20).
2. **Upward aggregation**: Occupied cells are recursively aggregated up to `minLevel` (level 2).
3. **Partition invariant**: Child cells partition parent cells disjointly. Therefore, the parent count is strictly equal to the sum of its children's counts:
   $$\text{photoCount}_{\text{parent}} = \sum_{c \in \text{children}} \text{photoCount}_c$$
4. **Photo membership**: Stored separately in `chipPhotoIds: Map<string, string[]>` referencing photo records without duplicating photo objects across levels.

### Deterministic Centroid & Representative Photo
- **Centroid**:
  $$\text{centroidLat} = \frac{1}{N}\sum \text{photo.lat}, \quad \text{centroidLng} = \frac{1}{N}\sum \text{photo.lng}$$
- **Representative Photo**: The member photo minimizing squared spherical distance to the centroid in degrees:
  $$d_{\text{lat}} = \text{photo.lat} - \text{centroidLat}$$
  $$d_{\text{lng}} = (\text{photo.lng} - \text{centroidLng}) \cdot \cos(\text{centroidLat} \cdot \frac{\pi}{180})$$
  $$\text{distSq} = d_{\text{lat}}^2 + d_{\text{lng}}^2$$
  Ties are broken deterministically by lexicographical comparison of `photo.id`.
- Zooming away and back produces identical representatives.

---

## 2. Zoom Policy & LOD Mapping

### Zoom to Chip Level
The chip level is connected to map zoom via:
$$\text{chipLevel} = \text{clamp}(\text{round}(\text{mapZoom}) + 2, \text{minLevel}, \text{maxLevel})$$

Illustrative dimensions at the equator:

| Map zoom | Chip level | Approximate cell width |
| -------- | ---------: | ---------------------: |
| 6        |          8 |                 156 km |
| 10       |         12 |                 9.8 km |
| 14       |         16 |                  610 m |
| 18       |         20 |                   38 m |

### Viewport Culling & Marker Reuse
- Reconciles markers on Leaflet `zoomend` and `moveend` events.
- Evaluates chips only within the current viewport expanded by a margin (`map.getBounds().pad(0.35)`).
- Reuses existing marker DOM instances keyed by `chip.id`. Only newly visible chips create markers, and markers leaving the viewport margin are detached.
- Initial camera fit: `map.fitBounds()` executes only once when a new dataset arrives (identified by dataset `revision`), never during LOD updates or user panning/zooming.

---

## 3. Selection Contract & Iframe Bridge

The flat map runs inside an iframe and communicates with the parent viewer (`photoview-in-3d`) using typed postMessage events.

### Lifecycle Handshake
1. **Map Ready**: When `photos-on-map` mounts, it posts:
   ```ts
   { type: 'photos-map-ready' }
   ```
2. **Photos Load**: Parent sends dataset with revision:
   ```ts
   {
     type: 'photos-load',
     data: JourneyBuildResult,
     revision: string,
   }
   ```

### Interaction Rules
1. **Single-photo chip** (`photoCount === 1`):
   Sends typed selection:
   ```ts
   {
     type: 'photo-chip-select',
     chipId: chip.id,
     revision: string,
     selectionType: 'single-photo',
     photoIds: [chip.representativePhotoId],
     representativePhotoId: chip.representativePhotoId,
     representativeLat: chip.representativeLat,
     representativeLng: chip.representativeLng,
   }
   ```
   Parent resolves photo from LOD index and opens + selects the photo in the 3D scene.

2. **Finest-level multi-photo chip** (`level >= maxLevel` or co-located photos with 0 spatial extent):
   Sends typed selection:
   ```ts
   {
     type: 'photo-chip-select',
     chipId: chip.id,
     revision: string,
     selectionType: 'multi-photo',
     photoIds: string[],
     representativePhotoId: chip.representativePhotoId,
     representativeLat: chip.representativeLat,
     representativeLng: chip.representativeLng,
   }
   ```
   Parent resolves membership directly from the LOD index and constructs a `JourneyGeoNode` with exactly that chip's member photos (not the legacy 0.1° cluster).

3. **Aggregate chip** (`photoCount > 1` with distinct member locations at `level < maxLevel`):
   Handled locally on the map: zooms to the member bounding box (`map.fitBounds(chip.bounds.pad(0.25))`), which automatically increases zoom and reveals finer sub-chips.

4. **Stale Selection Guard**:
   Parent validates `selection.revision === currentRevision`. Stale messages from outdated loads or cancelled tasks are dropped.

---

## 4. Boundary Cases Covered

- **Negative Coordinates**: Supports southern and western hemispheres.
- **Antimeridian**: Longitude normalization and wrap-around handling.
- **Mercator Latitude Limits**: Coordinates clamped within $[-85.05112878, 85.05112878]$.
- **Empty Datasets**: Returns empty hierarchy safely without exceptions; clears layer markers.
- **Identical Locations**: Clustered photos with identical coordinates remain grouped at level 20 and can be opened as a multi-photo chip.
