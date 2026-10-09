CREATE TABLE IF NOT EXISTS public.vector_features_places (
  feature_id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'osm',
  feature_type TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vector_features_places_geom_gix
  ON public.vector_features_places
  USING GIST (geom);

CREATE UNIQUE INDEX IF NOT EXISTS vector_features_places_source_feature_id_uidx
  ON public.vector_features_places(source, feature_id);

CREATE TABLE IF NOT EXISTS public.osm_ingest_jobs_places (
  z12_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS osm_ingest_jobs_places_status_idx
  ON public.osm_ingest_jobs_places(status);
