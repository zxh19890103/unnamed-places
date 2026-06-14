# Lancang River Centerline Extraction & Tile Manifest Design

**Date:** 2026-06-14  
**Status:** Approved

## 1. Goal

Derive the exact Lancang River main stem path from OSM and produce a deterministic list of z=11 Web Mercator tile keys covering a 10 km corridor on each side of the river. This tile manifest drives DEM and satellite prefetch — replacing the previous manual bbox-per-segment approach.

## 2. Decisions

| Decision            | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| River               | Lancang main stem only (no tributaries)               |
| Path source         | OSM (`waterway=river`, Lancang names only, no Mekong) |
| Name filter         | `澜沧江`, `Lancang Jiang`, `Lancang River`            |
| Corridor buffer     | 10 km each side                                       |
| Origin              | lon=97.17658060985056, lat=31.13551645138972          |
| End                 | lon=101.12626731734983, lat=21.773330764859452        |
| Tile zoom           | z=11                                                  |
| Tile count estimate | ~300–500                                              |

## 3. Architecture

Two new Python scripts added to the pipeline, feeding the existing `prefetch-tiles.js`:

```
corridor.json (origin, end, bbox)
        │
        ▼
river_centerline.py  ──→  output/centerline/lancang_main_stem.geojson
        │
        ▼
tile_manifest.py     ──→  output/tiles/z11_manifest.json
        │
        ▼
prefetch-tiles.js --manifest output/tiles/z11_manifest.json
                     ──→  .tiles/{z}/{x}/{y}/satellite.jpeg
                     ──→  .tiles/{z}/{x}/{y}/dem.gtiff + dem.png
```

## 4. Script: `river_centerline.py`

**Location:** `pipeline/src/ingest/river_centerline.py`

**Inputs:**

- `--config pipeline/config/corridor.json` (reads `origin`, `end`, and derives overall `bbox`)
- `--output-dir pipeline/output/centerline` (default)

**corridor.json additions:**

```json
{
  "origin": [97.17658060985056, 31.13551645138972],
  "end": [101.12626731734983, 21.773330764859452]
}
```

The overall query bbox is derived automatically: `[minLon, minLat, maxLon, maxLat]` = `[97.177, 21.773, 101.126, 31.136]`.

**Overpass query:**

- Feature type: `way[waterway=river]` within overall bbox
- Name filter: `name` tag must match one of `澜沧江`, `Lancang Jiang`, `Lancang River` (case-insensitive). Applied client-side after fetch to avoid Overpass regex complexity.

**Stitching algorithm:**

1. Build a node adjacency graph from all returned ways (each way is an ordered list of lon/lat nodes; adjacent ways share endpoint node IDs).
2. Find the endpoint node nearest to `origin` coord. Walk connected edges greedily, always moving to the unvisited neighbour, until no further connected node exists or the node nearest `end` is reached.
3. This produces a single ordered list of coordinates — the main stem polyline.
4. Clip: drop coordinates before the nearest point to `origin`, and after the nearest point to `end`, using cumulative distance along the line.

**Output:** `output/centerline/lancang_main_stem.geojson`

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[lon, lat], ...] },
  "properties": {
    "source": "osm",
    "origin": [97.17658060985056, 31.13551645138972],
    "end": [101.12626731734983, 21.773330764859452],
    "total_km": <computed>,
    "gap_count": <number of stitching gaps, 0 if fully connected>
  }
}
```

**Ambiguity resolution — disconnected graph:** If OSM returns segments that form multiple disconnected components, the algorithm selects the longest connected chain that includes the node nearest `origin`. Remaining components are discarded and counted as gaps.

**Error handling:**

- 0 matching ways from Overpass → fail loudly, do not write output.
- Stitching produces disconnected segments → write the longest connected chain containing origin, emit a warning with gap count. Do not hard-fail.

**New dependency:** `shapely` (geometry ops for stitching and distance).

## 5. Script: `tile_manifest.py`

**Location:** `pipeline/src/ingest/tile_manifest.py`

**Inputs:**

- `--centerline pipeline/output/centerline/lancang_main_stem.geojson` (default)
- `--output pipeline/output/tiles/z11_manifest.json` (default)
- `--zoom 11` (default)
- `--buffer-km 10` (default)

**Algorithm:**

1. Load centerline GeoJSON, extract LineString coordinates.
2. Reproject to UTM zone 47N (EPSG:32647) using `pyproj`.
3. Apply 10,000 m buffer with Shapely → buffered polygon.
4. Reproject polygon back to WGS84.
5. Compute tile index range from polygon's bounding box at z=11 using the same Mercator math as `prefetch-tiles.js` (`lon2tileX`, `lat2tileY`).
6. For each tile in the range, check if tile's WGS84 bounds intersect the buffered polygon using Shapely `.intersects()`.
7. Collect passing tiles.

**Output:** `output/tiles/z11_manifest.json`

```json
[
  {"z": 11, "x": 1634, "y": 801},
  {"z": 11, "x": 1634, "y": 802},
  ...
]
```

**Error handling:**

- Missing or empty centerline file → fail loudly.
- 0 intersecting tiles → fail loudly (indicates a geometry or projection bug).

**New dependencies:** `shapely`, `pyproj`.

## 6. Change: `prefetch-tiles.js` — `--manifest` flag

Add a `--manifest <path>` argument to `prefetch-tiles.js` as an alternative to `--bbox`.

Behaviour:

- If `--manifest` is provided, read the JSON array of `{z, x, y}` objects from the file upfront. Fail immediately if file is missing or malformed.
- Existing `--bbox` flow is unchanged.
- `--manifest` and `--bbox` are mutually exclusive; error if both are given.

Usage:

```bash
npm run prefetch:tiles -- --manifest pipeline/output/tiles/z11_manifest.json --concurrency 6
```

## 7. Config Changes

`pipeline/config/corridor.json` gains two top-level keys:

```json
{
  "origin": [97.17658060985056, 31.13551645138972],
  "end":    [101.12626731734983, 21.773330764859452],
  "corridor": [...]
}
```

`pipeline/common/config.py` `load_corridor()` updated to parse and return `origin` and `end`.

## 8. Output Artifacts

Both outputs are checked into the repo (small enough):

| File                                                   | Purpose                      |
| ------------------------------------------------------ | ---------------------------- |
| `pipeline/output/centerline/lancang_main_stem.geojson` | Authoritative river path     |
| `pipeline/output/tiles/z11_manifest.json`              | Authoritative z=11 tile list |

Both are regenerable by re-running the two scripts in order.

## 9. Dependencies

Add to `pipeline/requirements.txt`:

```
shapely>=2.0
pyproj>=3.6
```

## 10. Testing

| Test                    | Location                                  | What it checks                                                                         |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Stitching unit test     | `pipeline/tests/test_river_centerline.py` | Given disordered way segments with shared nodes, output is one ordered polyline        |
| Tile math unit test     | `pipeline/tests/test_tile_manifest.py`    | Given a simple buffer polygon, returns expected set of z/x/y keys                      |
| Smoke test (centerline) | `pipeline/tests/test_river_centerline.py` | Run against a small synthetic Overpass payload, verify valid GeoJSON LineString output |

## 11. Success Criteria

1. `river_centerline.py` runs without error and produces a valid GeoJSON LineString from origin to end.
2. `gap_count` in output properties is 0 or a known small number (OSM quality).
3. `tile_manifest.py` produces a JSON array with 300–600 entries.
4. `prefetch-tiles.js --manifest z11_manifest.json` downloads tiles without error.
5. All unit tests pass.
