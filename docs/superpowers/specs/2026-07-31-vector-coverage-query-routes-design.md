# Vector Coverage Query Routes Design

## Goal

Expose the canonical zoom-12 OSM tiles that have completed ingestion so clients can determine which database-backed vector tiles are ready before requesting the existing `.pbf` endpoint.

## API Contract

### Query One Coverage Tile

`GET /vector/coverage/12/:x/:y`

The route accepts non-negative integer `x` and `y` coordinates. Zoom is fixed to 12 because `public.osm_ingest_jobs` stores canonical coverage as `12/x/y` keys.

Response for a known tile:

```json
{
  "key": "12/3456/1523",
  "status": "done",
  "loaded": true
}
```

A known job may have `queued`, `running`, `done`, or `failed` status. Only `done` sets `loaded` to `true`. An unknown tile returns HTTP 200 with `status: null` and `loaded: false`. Invalid coordinates return HTTP 400 with the existing `INVALID_TILE_COORDS` error shape.

### List Loaded Coverage Tiles

`GET /vector/coverage/loaded?limit=100&offset=0`

Only jobs with `status = 'done'` are included. Results are ordered by `z12_key` for stable pagination.

```json
{
  "tiles": [
    { "key": "12/3456/1523", "z": 12, "x": 3456, "y": 1523 }
  ],
  "limit": 100,
  "offset": 0,
  "total": 1
}
```

`limit` defaults to 100 and is capped at 1000. `offset` defaults to 0. Invalid pagination values return HTTP 400 with an `INVALID_PAGINATION` error.

## Architecture

`createOsmJobsStore` owns SQL access to `public.osm_ingest_jobs`. It gains methods to query one status and list completed jobs with a total count. `createApp` injects these methods into `createVectorTilesRouter`, keeping SQL out of the HTTP route.

The router parses and validates request parameters, converts `x/y` to a `12/x/y` key, and shapes store results into the public response contract. The existing `/vector/tiles/:z/:x/:y.pbf` behavior remains unchanged.

## Data Flow

1. Client queries one coverage tile or requests a page of loaded tiles.
2. The vector tiles router validates parameters.
3. The injected jobs-store function queries `public.osm_ingest_jobs`.
4. The router returns normalized coverage metadata.
5. The client requests `/vector/tiles/:z/:x/:y.pbf` for ready regions; that route continues querying `public.vector_features` through `getVectorTilePbf`.

## Error Handling

Invalid coordinates and pagination return deterministic HTTP 400 JSON errors. Database errors continue through Express error handling rather than being converted into false "not loaded" results.

## Testing

Route tests cover loaded, pending, unknown, invalid-coordinate, paginated-list, and invalid-pagination responses. Jobs-store tests verify parameterized SQL, done-only filtering, stable ordering, and total counts. Existing vector PBF route tests remain unchanged and must continue passing.
