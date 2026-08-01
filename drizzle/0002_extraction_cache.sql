ALTER TYPE extraction_source ADD VALUE IF NOT EXISTS 'cached_extraction';

CREATE TABLE IF NOT EXISTS extraction_cache (
  cache_key text PRIMARY KEY,
  scope_id text NOT NULL,
  fields jsonb NOT NULL,
  raw_text text,
  image_quality real,
  confidence real,
  model text NOT NULL,
  prompt_version text NOT NULL,
  strategy_version text NOT NULL,
  service_tier text NOT NULL,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_cache_confidence_check CHECK (
    confidence IS NULL OR confidence BETWEEN 0 AND 1
  ),
  CONSTRAINT extraction_cache_latency_check CHECK (latency_ms >= 0)
);

CREATE INDEX IF NOT EXISTS extraction_cache_scope_expires_idx
  ON extraction_cache (scope_id, expires_at);

ALTER TABLE extraction_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE extraction_cache FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE extraction_cache FROM authenticated;
  END IF;
END;
$$;
