CREATE TABLE IF NOT EXISTS public.z12geoinfo (
  z12_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  raw_data JSONB NOT NULL
);