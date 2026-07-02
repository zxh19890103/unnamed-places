CREATE UNIQUE INDEX IF NOT EXISTS vector_features_source_feature_id_uidx
  ON public.vector_features(source, feature_id);
