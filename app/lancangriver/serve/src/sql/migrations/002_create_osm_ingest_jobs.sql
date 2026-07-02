CREATE TABLE IF NOT EXISTS public.osm_ingest_jobs (
  z12_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS osm_ingest_jobs_status_idx
  ON public.osm_ingest_jobs(status);
