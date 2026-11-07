# Lancangriver Client (`client`)

Browser client for exploring Lancangriver map, terrain, imagery, and vector data.

## Tech Stack

- Vite for development, bundling, and multiple HTML entry points.
- TypeScript with ES modules.
- React 19 for application and interface UI.
- Three.js for the 3D globe, terrain tiles, materials, and scene controls.
- Leaflet for the flat map view and map interactions.
- Vitest for unit tests.
- Tailwind CSS and the Tailwind Vite plugin for utility styling.
- Radix UI primitives for tabs, tooltips, and icons.
- `@mapbox/vector-tile` and `pbf` for decoding vector tile data.
- `lil-gui` for development controls and diagnostics.
- `suncalc` and `tz-lookup` for sun and timezone calculations.
- `clsx` for composing UI class names.

## Prerequisites

- Node.js 18+
- npm
- Service running (default expected base URL: `http://localhost:4050`)

## Install

From `app/lancangriver/client`:

```bash
npm install
```

## Run (Dev)

From `app/lancangriver/client`:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Photo modal map

On `/photoview-in-3d`, open a chip's photo viewer and use the globe button in
the header to toggle the left map panel. The EXIF panel on the right can remain
open independently. On narrow screens, scroll the content horizontally to reach
both panels without squeezing the photo.

The map shows the chip's photo locations. Click a numbered marker to select its
photo; overlapping markers spread on click so each photo can be selected.
Markers are numbered 34 x 24 pixel landscape rectangles with rounded corners,
centered on their locations. Their size stays fixed when zooming the map.
Spread markers turn coral red with dashed pale-rose borders and matching connector
lines to their true locations. Each distinct true location also shows a borderless
6px pale-rose dot at 0.67 opacity while spread; dots and lines disappear on collapse.
The selected photo retains its gold fill, with
the dashed pale-rose border when spread. Collapsing restores the original styling.
Drag the map to reach a large spread group; zooming, clicking the map background,
or choosing **Fit all** collapses it.
Thumbnail and arrow navigation also highlight the selected marker. **Fit all**
restores the full group view; ordinary selection preserves zoom and pans only
when necessary.

Leaflet renders styled OSM GeoJSON (highways, waterways, water polygons, and
places), with no raster basemap by default. **Tiles**, beside **Fit all**, toggles
OpenStreetMap standard raster tiles beneath the overlays without changing zoom,
position, or selection. These align with the OSM vectors and WGS84 photo locations
without a GCJ-02 offset. The map retains its OpenStreetMap attribution; failed tiles
show a warning and can be retried by toggling off and on.
Tiles use `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with native zoom up to
19 and overzoom at 20. Use is subject to the
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/);
this is an interactive basemap, not a bulk-download or offline-cache feature.
The toggle starts off each time the map panel opens.
Place labels vary in size and weight by type:
cities are largest, followed by towns, suburbs, villages, and smaller localities.
Their existing zoom-based visibility keeps minor places out of wider views.
Named roads and waterways are labeled halfway along their longest line; water
polygons use the largest polygon's centroid, with an interior-point fallback for
concave shapes and holes. Labels prefer Chinese names, then the default name.
Road names use subdued text and water names use blue text with a dark halo.
Minor names appear only when zoomed in; overlapping labels are suppressed,
prioritizing photo markers and then place names.
Requests use the parent viewer's loaded chip
bbox, not the current map viewport. Panning and zooming do not load additional
vector coverage or start ingestion. When enabled, OSM background tiles follow the
visible map independently of that bbox. Empty results mean no loaded features were returned,
not necessarily that the area has no OSM coverage. Failed layers show errors and
can be retried without disabling photo selection. Photos with invalid coordinates
remain available in the filmstrip.

## Photo journey panel

On `/photoview-in-3d`, the **Open journey** button beside **Open map** opens a
440px left panel that combines time and place. Map and Journey are mutually
exclusive; clicking the active button closes that mode, while the other button
switches modes. EXIF, the main photo, and the filmstrip remain independent.
Journey components live in `src/(experiments)/photoview-in-3d/photo-journey/`;
both map modes reuse OSM requests, styling, labels, and retry handling from
`photo-map/usePhotoMapLayers.ts`.

The north-up spatial scene shows the selected moment and up to two moments on
each side against muted OSM geography. Dashed daylight-colored links mean
**photo sequence, not a recorded route**; distances and bearings are straight-line
relationships, not inferred walking/riding tracks. The current moment is larger
(80 x 60px), with a gold outer ring and gold sequence badge; neighboring thumbnails
are dimmed and desaturated, restoring brightness on hover. Every thumbnail has its
full-journey moment number at top-left (jade for unselected moments). Stacks also
show a separate dark **x n** count badge at top-right; single photos omit it.
Both badges have dark outlines for contrast. Marker centers stay
anchored to their geographic locations. Links have a 5px daylight-colored stroke
with dark and white casings for contrast over both light tiles and dark backgrounds,
including nighttime colors. All three strokes use matching dashes.
Links break at capture-date
changes, gaps over six hours, missing locations, and unknown capture times.
Only the already loaded chip bbox is requested; panning does not expand coverage.
Unavailable, empty, loading, and failed OSM data are reported; failed layers can
be retried without disabling photo selection.

Journey sorts its own chronological copy without reordering modal navigation or
the filmstrip. Only timestamps with an explicit timezone can establish chronology;
untimed/invalid/timezone-less photos appear last with no sequence links. Capture
times display in the browser's locale and timezone.
Consecutive same-place photos within 15m of the first photo and 30 minutes between
shots form a stack (without crossing capture dates). A later revisit is a separate
moment. Stack thumbnails, neighboring-moment cards, and map thumbnails select the
main photo; filmstrip/arrow navigation updates the Journey selection in return.
Neighbor cards show elapsed time, distance, direction, and sequence breaks.

The first view fits nearby moments; subsequent selections center the selected
photo's location, even when it was already visible, preserving zoom and orientation.
Rapid navigation interrupts the previous pan so the latest selection is centered.
Photos without valid coordinates leave the map position unchanged.
**Fit nearby** reframes the current context.
**Tiles**, beside **Fit nearby**, toggles OpenStreetMap raster tiles beneath the
OSM vectors and journey moments without changing selection, zoom, or position.
It starts off whenever Journey opens and remains enabled during photo navigation.
Loading and tile failures appear in the map status area; toggle off and on to retry.
The layer uses the same standard OSM tile URL, zoom limits, attribution, and
interactive-use policy as Photo map. Raster coverage follows the viewport,
independently of the loaded vector bbox. Both modes share the tile-layer lifecycle
in `photo-map/usePhotoMapTiles.ts`.
Reduced-motion preferences disable selection panning animation. Repeated-location
moments can overlap on the map; the chronological neighbor cards remain available.
On narrow screens the modal's existing horizontal scroll keeps both the panel
and main photo reachable.

## Photo filmstrip timeline

The thumbnail background represents estimated natural daylight from SunCalc solar
elevation at each photo's capture time and coordinates: deep navy at night,
violet/peach mornings, pale gold to bright cream near noon, and amber/coral evenings.
Closer color stops near the horizon emphasize dawn/dusk changes. Solar azimuth
smoothly blends morning and evening palettes, distinguishing equal elevations
without an abrupt color switch at noon.
Each photo contributes a low-opacity, daylight-colored glow behind its thumbnail:
a rounded source with a zero-offset box shadow, 52px blur, and 12px spread.
Neighboring glows overlap instead of using a flat linear gradient. They scroll
with the strip; thumbnails keep equal spacing and are not tinted. The exposed
band below them makes the glow visible. Background-only sources extend two items
beyond each side of the mounted thumbnail range so scrolling does not pop glows
in or out; the existing 12-thumbnail mounting limit is unchanged.
Only the background fades into the surrounding stone color:
12px vertically and 32px horizontally, with fixed side fades at the scroll viewport.
Thumbnails and focus outlines remain crisp and interactive.
This estimates daylight, not weather or photographic exposure.

Capture times must include `Z` or an explicit UTC offset. Missing, invalid, or
timezone-less times and invalid coordinates produce a neutral glow;
thumbnail tooltips explain the reason. No browser-local
timezone is guessed. Date changes (using the dates encoded in capture timestamps)
or time gaps over six hours separate glow groups. Shadows are clipped at these
boundaries and around unavailable metadata rather than mixing unrelated captures
or inventing unseen day/night cycles. Photo order and selection are unchanged.

Hovering or keyboard-focusing a thumbnail opens the shared tooltip above it,
showing the wrapped filename, capture time formatted in the browser's locale and
local timezone, and daylight description. Missing or invalid capture times show
"Time unavailable". The tooltip is portaled outside the scrolling strip to avoid
clipping; native browser title tooltips are not used.

The photo modal displays a read-only timeline below its thumbnail strip. The
bar spans all valid capture times in the chip; its white outlined window covers
the earliest and latest times of thumbnails currently visible, including partially
visible thumbnails but excluding virtualization overscan. Scroll, resize, and
selection-driven scrolling update the highlighted span without reordering photos.
With unsorted photos, the highlight is a time envelope, not a continuous sequence.

A gold downward caret above the bar marks the selected photo's capture time.
Photo selection moves the caret; scrolling alone does not. Its exact time appears
in the Selected label. Missing or invalid selected times hide the caret and show
"Time unavailable"; a zero-duration capture range centers the caret.

The bar's jade brightness shows photo density in 64 equal-duration buckets over
the full capture range. Dark buckets are empty, and brighter buckets contain more
photos, using logarithmic scaling relative to the busiest bucket. Brightness
blends smoothly between bucket centers instead of changing in solid blocks. Density stays
fixed while scrolling, and the transparent outline leaves it visible. Photos with
identical timestamps form a single bright peak at the center when the time range
has zero duration.

The visible range shows exact capture times, and ticks include dates for multi-day
chips. Times use the browser's local timezone. Missing/invalid times are excluded
and reported; identical timestamps use a minimum-width indicator. The timeline
does not support clicking or dragging to navigate.

## Photo view print export

On `/photoview-in-3d`, choose **Export A2 PNG** to download a 7016 x 4961 pixel
landscape image (A2 at 300 DPI). The export waits up to 60 seconds for terrain,
imagery, and vector loading, then renders in GPU-sized tiles with progress and
cancellation. Animation, controls, and terrain LOD are frozen during capture.
Failed/missing terrain or satellite imagery prevents export rather than saving placeholders.

The paper aspect ratio preserves the camera's vertical field of view and adjusts
horizontal framing. Scene labels are included; HTML panels and maps are not.
The final image is assembled in browser memory, so close other tabs if allocation
or encoding fails. This is not an unlimited-size/offline stitching workflow.

Print the downloaded PNG on A2 landscape paper (594 x 420 mm). Set that physical
size in your print application rather than relying on browser PNG DPI metadata;
disable automatic fit/cropping when exact dimensions matter.
