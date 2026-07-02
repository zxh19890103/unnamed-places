WITH tile AS (
  SELECT
    ST_TileEnvelope($1, $2, $3) AS geom_3857,
    ST_Transform(ST_TileEnvelope($1, $2, $3), 4326) AS geom_4326
),
features AS (
  SELECT
    feature_id,
    feature_type,
    tags,
    ST_AsMVTGeom(ST_Transform(v.geom, 3857), tile.geom_3857, 4096, 64, true) AS geom
  FROM public.vector_features v, tile
  WHERE v.geom && tile.geom_4326
    AND ST_Intersects(v.geom, tile.geom_4326)
)
SELECT COALESCE(ST_AsMVT(features, 'osm', 4096, 'geom'), '\\x'::bytea) AS tile_pbf
FROM features;
