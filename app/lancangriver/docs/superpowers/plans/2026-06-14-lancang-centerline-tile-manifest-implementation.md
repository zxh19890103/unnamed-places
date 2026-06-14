# Lancang Centerline Tile Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic raster-only preprocessing flow that extracts the Lancang main stem from OSM and generates a z=11 tile manifest for DEM and satellite prefetch.

**Architecture:** Extend the existing Python pipeline with two focused scripts: one extracts and stitches the Lancang centerline from Overpass data, and one buffers that line and enumerates intersecting z/x/y tiles. Extend the existing Node prefetch script to accept a manifest input mode while keeping bbox mode unchanged.

**Tech Stack:** Python 3.11, requests, shapely, pyproj, pytest, Node.js 22, Vitest

---

## File Structure

- Modify: `app/lancangriver/pipeline/config/pilot_corridor.json` (add origin/end coordinates)
- Modify: `app/lancangriver/pipeline/src/common/config.py` (validate and expose origin/end)
- Modify: `app/lancangriver/pipeline/requirements.txt` (add shapely/pyproj)
- Create: `app/lancangriver/pipeline/src/ingest/river_centerline.py` (OSM query, filter, stitch, clip, GeoJSON output)
- Create: `app/lancangriver/pipeline/src/ingest/tile_manifest.py` (buffer centerline and generate z/x/y list)
- Create: `app/lancangriver/pipeline/tests/test_river_centerline.py` (unit + smoke tests for centerline extraction)
- Create: `app/lancangriver/pipeline/tests/test_tile_manifest.py` (tile math and manifest tests)
- Modify: `app/lancangriver/serve/scripts/prefetch-tiles.js` (`--manifest` support + input validation)
- Create: `app/lancangriver/serve/test/prefetch.tiles.manifest.test.js` (manifest mode tests)

## Task 1: Corridor Config Contract (TDD)

**Files:**

- Modify: `app/lancangriver/pipeline/src/common/config.py`
- Modify: `app/lancangriver/pipeline/config/pilot_corridor.json`
- Modify: `app/lancangriver/pipeline/tests/test_corridor_config.py`

- [ ] **Step 1: Write failing tests for origin/end validation**

```python
from pipeline.src.common.config import load_corridor


def test_load_corridor_includes_origin_and_end() -> None:
    cfg = load_corridor('pipeline/config/pilot_corridor.json')
    assert cfg['origin'] == [97.17658060985056, 31.13551645138972]
    assert cfg['end'] == [101.12626731734983, 21.773330764859452]


def test_load_corridor_rejects_invalid_origin(tmp_path) -> None:
    bad = tmp_path / 'bad.json'
    bad.write_text('{"zoom":11,"origin":[97.1],"end":[101.1,21.7],"corridor":[{"bbox":[99,21,101.5,23]}]}')
    try:
        load_corridor(str(bad))
        assert False, 'expected ValueError'
    except ValueError as err:
        assert 'origin' in str(err)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd app/lancangriver && pytest pipeline/tests/test_corridor_config.py -q`
Expected: FAIL with missing `origin`/`end` keys or missing validation.

- [ ] **Step 3: Add minimal config validation and fixture data**

```python
def _validate_point(name: str, value: Any) -> None:
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f'{name} must contain 2 numbers')
    if any(not isinstance(v, (int, float)) for v in value):
        raise ValueError(f'{name} values must be numbers')


def load_corridor(path: str) -> dict[str, Any]:
    # existing file read + zoom checks...
    origin = data.get('origin')
    end = data.get('end')
    _validate_point('origin', origin)
    _validate_point('end', end)
    # existing corridor checks...
    return data
```

```json
{
  "name": "lancangriver-pilot-corridor",
  "zoom": 11,
  "origin": [97.17658060985056, 31.13551645138972],
  "end": [101.12626731734983, 21.773330764859452],
  "corridor": [
    {
      "id": "pilot-001",
      "bbox": [99.0, 21.0, 101.5, 23.0],
      "enabled": true,
      "priority": 1
    }
  ]
}
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `cd app/lancangriver && pytest pipeline/tests/test_corridor_config.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/pipeline/src/common/config.py app/lancangriver/pipeline/config/pilot_corridor.json app/lancangriver/pipeline/tests/test_corridor_config.py
git commit -m "feat(pipeline): add origin/end to corridor config contract"
```

## Task 2: Build Lancang Centerline Extraction Script (TDD)

**Files:**

- Create: `app/lancangriver/pipeline/src/ingest/river_centerline.py`
- Create: `app/lancangriver/pipeline/tests/test_river_centerline.py`
- Modify: `app/lancangriver/pipeline/requirements.txt`

- [ ] **Step 1: Write failing tests for query and name filtering**

```python
from pipeline.src.ingest.river_centerline import build_river_query, filter_lancang_ways


def test_build_river_query_uses_bbox_order() -> None:
    q = build_river_query([97.1, 21.7, 101.2, 31.1])
    assert '(21.7,97.1,31.1,101.2)' in q
    assert 'waterway' in q


def test_filter_lancang_ways_keeps_only_allowed_names() -> None:
    elements = [
        {"type": "way", "id": 1, "tags": {"name": "澜沧江"}, "geometry": [{"lon": 99, "lat": 22}, {"lon": 99.1, "lat": 21.9}]},
        {"type": "way", "id": 2, "tags": {"name": "Mekong"}, "geometry": [{"lon": 99, "lat": 22}, {"lon": 99.2, "lat": 21.8}]}
    ]
    kept = filter_lancang_ways(elements)
    assert [w['id'] for w in kept] == [1]
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd app/lancangriver && pytest pipeline/tests/test_river_centerline.py -q`
Expected: FAIL with import/module not found.

- [ ] **Step 3: Implement minimal query + filter logic and dependencies**

```python
ALLOWED_NAMES = {'澜沧江', 'lancang jiang', 'lancang river'}


def build_river_query(bbox: list[float]) -> str:
    min_lon, min_lat, max_lon, max_lat = bbox
    return f'''[out:json][timeout:120];\nway["waterway"="river"]({min_lat},{min_lon},{max_lat},{max_lon});\nout geom tags;'''


def filter_lancang_ways(elements: list[dict]) -> list[dict]:
    kept = []
    for element in elements:
        if element.get('type') != 'way':
            continue
        name = str(element.get('tags', {}).get('name', '')).strip().lower()
        if name in ALLOWED_NAMES:
            kept.append(element)
    return kept
```

```txt
requests==2.32.3
pytest==8.3.2
psycopg[binary]==3.2.9
shapely>=2.0
pyproj>=3.6
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `cd app/lancangriver && pytest pipeline/tests/test_river_centerline.py -q`
Expected: PASS for the first two tests.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/pipeline/src/ingest/river_centerline.py app/lancangriver/pipeline/tests/test_river_centerline.py app/lancangriver/pipeline/requirements.txt
git commit -m "feat(pipeline): add Lancang query and name filter primitives"
```

## Task 3: Stitch, Clip, and Write Centerline GeoJSON (TDD)

**Files:**

- Modify: `app/lancangriver/pipeline/src/ingest/river_centerline.py`
- Modify: `app/lancangriver/pipeline/tests/test_river_centerline.py`

- [ ] **Step 1: Add failing tests for stitch/clip/output shape**

```python
from pipeline.src.ingest.river_centerline import stitch_centerline, clip_between_points, to_feature


def test_stitch_centerline_orders_disordered_segments() -> None:
    ways = [
        {"geometry": [{"lon": 99.1, "lat": 21.9}, {"lon": 99.2, "lat": 21.8}]},
        {"geometry": [{"lon": 99.0, "lat": 22.0}, {"lon": 99.1, "lat": 21.9}]}
    ]
    coords, gaps = stitch_centerline(ways, [99.0, 22.0], [99.2, 21.8])
    assert coords[0] == [99.0, 22.0]
    assert coords[-1] == [99.2, 21.8]
    assert gaps == 0


def test_to_feature_contains_required_properties() -> None:
    f = to_feature([[99.0, 22.0], [99.2, 21.8]], [97.17, 31.13], [101.12, 21.77], 0)
    assert f['geometry']['type'] == 'LineString'
    assert f['properties']['source'] == 'osm'
    assert 'total_km' in f['properties']
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd app/lancangriver && pytest pipeline/tests/test_river_centerline.py -q`
Expected: FAIL on missing functions or incorrect ordering.

- [ ] **Step 3: Implement minimal stitching + clip + CLI writer**

```python
from pathlib import Path
import json
from shapely.geometry import LineString, Point


def stitch_centerline(ways: list[dict], origin: list[float], end: list[float]) -> tuple[list[list[float]], int]:
    chains = []
    for way in ways:
        chain = [[p['lon'], p['lat']] for p in way.get('geometry', [])]
        if len(chain) >= 2:
            chains.append(chain)
    chains.sort(key=len, reverse=True)
    best = chains[0] if chains else []
    return best, max(0, len(chains) - 1)


def clip_between_points(coords: list[list[float]], origin: list[float], end: list[float]) -> list[list[float]]:
    if len(coords) < 2:
        return coords
    line = LineString(coords)
    o = line.project(Point(origin[0], origin[1]))
    e = line.project(Point(end[0], end[1]))
    start, stop = sorted((o, e))
    out = [pt for pt in coords if start <= line.project(Point(pt[0], pt[1])) <= stop]
    return out if len(out) >= 2 else coords


def to_feature(coords: list[list[float]], origin: list[float], end: list[float], gap_count: int) -> dict:
    line = LineString(coords)
    return {
        'type': 'Feature',
        'geometry': {'type': 'LineString', 'coordinates': coords},
        'properties': {
            'source': 'osm',
            'origin': origin,
            'end': end,
            'total_km': round(line.length * 111.32, 3),
            'gap_count': gap_count,
        },
    }
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `cd app/lancangriver && pytest pipeline/tests/test_river_centerline.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/pipeline/src/ingest/river_centerline.py app/lancangriver/pipeline/tests/test_river_centerline.py
git commit -m "feat(pipeline): stitch and export Lancang centerline GeoJSON"
```

## Task 4: Generate z=11 Tile Manifest From Buffered Centerline (TDD)

**Files:**

- Create: `app/lancangriver/pipeline/src/ingest/tile_manifest.py`
- Create: `app/lancangriver/pipeline/tests/test_tile_manifest.py`

- [ ] **Step 1: Write failing tile math and intersection tests**

```python
from shapely.geometry import LineString
from pipeline.src.ingest.tile_manifest import lon2tile_x, lat2tile_y, tiles_for_buffered_line


def test_lon_lat_to_tile_indices_at_zoom_11() -> None:
    assert lon2tile_x(99.0, 11) <= lon2tile_x(101.0, 11)
    assert lat2tile_y(31.0, 11) <= lat2tile_y(21.8, 11)


def test_tiles_for_buffered_line_returns_non_empty() -> None:
    line = LineString([(99.0, 22.0), (99.2, 21.8)])
    tiles = tiles_for_buffered_line(line, zoom=11, buffer_km=10)
    assert len(tiles) > 0
    assert all(t['z'] == 11 for t in tiles)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd app/lancangriver && pytest pipeline/tests/test_tile_manifest.py -q`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement minimal manifest generator**

```python
import json
import math
from shapely.geometry import LineString, box, shape
from shapely.ops import transform
from pyproj import Transformer


def lon2tile_x(lon: float, z: int) -> int:
    return math.floor(((lon + 180.0) / 360.0) * (2 ** z))


def lat2tile_y(lat: float, z: int) -> int:
    r = math.radians(lat)
    return math.floor(((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2) * (2 ** z))


def tiles_for_buffered_line(line: LineString, zoom: int, buffer_km: float) -> list[dict]:
    to_utm = Transformer.from_crs('EPSG:4326', 'EPSG:32647', always_xy=True).transform
    to_wgs = Transformer.from_crs('EPSG:32647', 'EPSG:4326', always_xy=True).transform
    buffered = transform(to_wgs, transform(to_utm, line).buffer(buffer_km * 1000.0))
    minx, miny, maxx, maxy = buffered.bounds
    min_tx, max_tx = sorted((lon2tile_x(minx, zoom), lon2tile_x(maxx, zoom)))
    min_ty, max_ty = sorted((lat2tile_y(maxy, zoom), lat2tile_y(miny, zoom)))
    out = []
    for x in range(min_tx, max_tx + 1):
        for y in range(min_ty, max_ty + 1):
            # fast bbox intersection in lon/lat tile bounds
            # precise bounds are sufficient for this zoom-level manifest
            out.append({'z': zoom, 'x': x, 'y': y})
    return out
```

- [ ] **Step 4: Tighten implementation with polygon intersection and write JSON output**

Run: `cd app/lancangriver && pytest pipeline/tests/test_tile_manifest.py -q`
Expected: FAIL because current implementation adds all tiles in bbox.

Implement tile polygon intersection before append:

```python
# inside tile loop in tiles_for_buffered_line
west = (x / (2 ** zoom)) * 360.0 - 180.0
east = ((x + 1) / (2 ** zoom)) * 360.0 - 180.0
north = math.degrees(math.atan(math.sinh(math.pi * (1 - (2 * y) / (2 ** zoom)))))
south = math.degrees(math.atan(math.sinh(math.pi * (1 - (2 * (y + 1)) / (2 ** zoom)))))
tile_poly = box(west, south, east, north)
if buffered.intersects(tile_poly):
    out.append({'z': zoom, 'x': x, 'y': y})
```

- [ ] **Step 5: Re-run tests and commit**

Run: `cd app/lancangriver && pytest pipeline/tests/test_tile_manifest.py -q`
Expected: PASS.

```bash
git add app/lancangriver/pipeline/src/ingest/tile_manifest.py app/lancangriver/pipeline/tests/test_tile_manifest.py
git commit -m "feat(pipeline): generate z11 tile manifest from buffered centerline"
```

## Task 5: Add `--manifest` Mode To Prefetch Script (TDD)

**Files:**

- Modify: `app/lancangriver/serve/scripts/prefetch-tiles.js`
- Create: `app/lancangriver/serve/test/prefetch.tiles.manifest.test.js`

- [ ] **Step 1: Write failing argument parser tests**

```js
import { describe, it, expect } from "vitest";
import { parseArgs } from "../scripts/prefetch-tiles.js";

describe("parseArgs manifest mode", () => {
  it("accepts --manifest without --bbox", () => {
    const parsed = parseArgs([
      "node",
      "script",
      "--manifest",
      "pipeline/output/tiles/z11_manifest.json",
    ]);
    expect(parsed.manifestPath).toContain("z11_manifest.json");
  });

  it("rejects --manifest with --bbox", () => {
    expect(() =>
      parseArgs([
        "node",
        "script",
        "--manifest",
        "m.json",
        "--bbox",
        "99,21,101,23",
      ]),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd app/lancangriver/serve && npm test -- prefetch.tiles.manifest.test.js`
Expected: FAIL because `parseArgs` is not exported and no manifest support exists.

- [ ] **Step 3: Implement minimal manifest parsing and loading**

```js
import { readFile } from 'node:fs/promises';

function parseArgs(argv) {
  const result = {
    // existing fields...
    manifestPath: null
  };

  // inside loop
  if (token === '--manifest') {
    result.manifestPath = resolve(argv[index + 1]);
    index += 1;
    continue;
  }

  const hasBbox = Number.isFinite(result.minLon) && Number.isFinite(result.minLat) && Number.isFinite(result.maxLon) && Number.isFinite(result.maxLat);
  if (result.manifestPath && hasBbox) {
    throw new Error('--manifest and --bbox are mutually exclusive');
  }
  if (!result.manifestPath && !hasBbox) {
    throw new Error('Missing --bbox or --manifest');
  }

  return result;
}

async function loadTiles(options) {
  if (!options.manifestPath) {
    return listTilesForBbox(options.minLon, options.minLat, options.maxLon, options.maxLat, options.zoom);
  }
  const raw = await readFile(options.manifestPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Manifest must be an array of {z,x,y}');
  }
  return parsed;
}

export { parseArgs };
```

- [ ] **Step 4: Re-run tests to verify pass**

Run: `cd app/lancangriver/serve && npm test -- prefetch.tiles.manifest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lancangriver/serve/scripts/prefetch-tiles.js app/lancangriver/serve/test/prefetch.tiles.manifest.test.js
git commit -m "feat(serve): support tile prefetch via manifest input"
```

## Task 6: End-to-End Smoke and Artifact Generation

**Files:**

- Create output: `app/lancangriver/pipeline/output/centerline/lancang_main_stem.geojson`
- Create output: `app/lancangriver/pipeline/output/tiles/z11_manifest.json`

- [ ] **Step 1: Run centerline extraction**

Run:

```bash
cd app/lancangriver
python -m pipeline.src.ingest.river_centerline --config pipeline/config/pilot_corridor.json --output-dir pipeline/output/centerline
```

Expected: writes `lancang_main_stem.geojson` and prints segment count + `gap_count`.

- [ ] **Step 2: Run tile manifest generation**

Run:

```bash
cd app/lancangriver
python -m pipeline.src.ingest.tile_manifest --centerline pipeline/output/centerline/lancang_main_stem.geojson --output pipeline/output/tiles/z11_manifest.json --zoom 11 --buffer-km 10
```

Expected: writes manifest and prints tile count in 300-600 range.

- [ ] **Step 3: Run tests**

Run:

```bash
cd app/lancangriver
pytest pipeline/tests/test_corridor_config.py pipeline/tests/test_river_centerline.py pipeline/tests/test_tile_manifest.py -q
cd serve
npm test -- prefetch.tiles.manifest.test.js
```

Expected: all PASS.

- [ ] **Step 4: Prefetch dry-run with manifest**

Run:

```bash
cd app/lancangriver/serve
npm run prefetch:tiles -- --manifest ../pipeline/output/tiles/z11_manifest.json --skip-dem --skip-satellite
```

Expected: parser accepts manifest and prints progress without throwing.

- [ ] **Step 5: Commit generated artifacts (if policy allows tracking outputs)**

```bash
git add app/lancangriver/pipeline/output/centerline/lancang_main_stem.geojson app/lancangriver/pipeline/output/tiles/z11_manifest.json
git commit -m "chore(pipeline): add Lancang centerline and z11 tile manifest artifacts"
```

If output artifacts are not tracked by repository policy, skip this commit and document regeneration commands in the PR description.
