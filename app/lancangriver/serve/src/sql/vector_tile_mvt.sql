WITH tile AS (
  SELECT ST_TileEnvelope($1, $2, $3) AS geom
),
features AS (
  SELECT
    feature_id,
    feature_type,
    tags,
    ST_AsMVTGeom(v.geom, tile.geom, 4096, 64, true) AS geom
  FROM public.vector_features v, tile
  WHERE v.geom && tile.geom
    AND ST_Intersects(v.geom, tile.geom)
)
SELECT COALESCE(ST_AsMVT(features, 'osm', 4096, 'geom'), '\\x'::bytea) AS tile_pbf
FROM features;
