WITH bbox AS (
  SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS geom
),
features AS (
  SELECT
    jsonb_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(v.geom)::jsonb,
      'properties', COALESCE(to_jsonb(v) - 'geom', '{}'::jsonb)
    ) AS feature
  FROM vector_features v
  JOIN bbox b ON ST_Intersects(v.geom, b.geom)
)
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
) AS feature_collection
FROM features;
