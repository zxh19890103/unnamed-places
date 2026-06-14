CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.vector_features (
  feature_id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'osm',
  feature_type TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vector_features_geom_gix
  ON public.vector_features
  USING GIST (geom);
