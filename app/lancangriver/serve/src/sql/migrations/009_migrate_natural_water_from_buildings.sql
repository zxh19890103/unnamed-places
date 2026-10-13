-- Migrate existing natural=water records from vector_features (buildings)
-- into vector_features_natural_water to preserve all existing geometries.
INSERT INTO public.vector_features_natural_water (
  feature_id,
  source,
  feature_type,
  tags,
  geom,
  created_at,
  updated_at
)
SELECT
  feature_id,
  source,
  feature_type,
  tags,
  geom,
  created_at,
  updated_at
FROM public.vector_features
WHERE tags->>'natural' = 'water'
ON CONFLICT (source, feature_id) DO UPDATE
SET
  tags = EXCLUDED.tags,
  geom = EXCLUDED.geom,
  updated_at = EXCLUDED.updated_at;

-- Remove the migrated records from vector_features (buildings)
-- while preserving any dual-tagged features that also have a building tag.
DELETE FROM public.vector_features
WHERE tags->>'natural' = 'water'
  AND (tags->>'building') IS NULL;

-- Synchronize completed tile jobs into osm_ingest_jobs_natural_water
-- so existing ingested tiles are tracked without re-fetching.
INSERT INTO public.osm_ingest_jobs_natural_water (
  z12_key,
  status,
  attempt_count,
  queued_at,
  started_at,
  finished_at,
  updated_at
)
SELECT
  z12_key,
  status,
  attempt_count,
  queued_at,
  started_at,
  finished_at,
  updated_at
FROM public.osm_ingest_jobs
WHERE status = 'done'
ON CONFLICT (z12_key) DO NOTHING;
