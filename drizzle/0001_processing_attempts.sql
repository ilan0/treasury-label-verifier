DO $$ BEGIN CREATE TYPE processing_attempt_status AS ENUM ('running', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS processing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES label_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  idempotency_key text NOT NULL,
  inngest_run_id text,
  status processing_attempt_status NOT NULL DEFAULT 'running',
  replay_count integer NOT NULL DEFAULT 0,
  last_replayed_at timestamptz,
  model text,
  service_tier text,
  model_variant text,
  prompt_version text,
  timing_spans jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_latency_ms integer,
  input_tokens integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  reasoning_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processing_attempts_attempt_number_check CHECK (attempt_number > 0),
  CONSTRAINT processing_attempts_replay_count_check CHECK (replay_count >= 0),
  CONSTRAINT processing_attempts_latency_check CHECK (total_latency_ms IS NULL OR total_latency_ms >= 0),
  CONSTRAINT processing_attempts_token_counts_check CHECK (
    input_tokens >= 0
    AND cached_input_tokens >= 0
    AND output_tokens >= 0
    AND reasoning_tokens >= 0
    AND total_tokens >= 0
    AND cached_input_tokens <= input_tokens
    AND reasoning_tokens <= output_tokens
    AND total_tokens >= input_tokens + output_tokens
  ),
  CONSTRAINT processing_attempts_terminal_state_check CHECK (
    (status = 'running' AND finished_at IS NULL)
    OR (status IN ('completed', 'failed') AND finished_at IS NOT NULL)
  ),
  CONSTRAINT processing_attempts_failure_code_check CHECK (
    status <> 'failed' OR length(trim(coalesce(error_code, ''))) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS processing_attempts_idempotency_uidx ON processing_attempts (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS processing_attempts_job_number_uidx ON processing_attempts (job_id, attempt_number);
CREATE INDEX IF NOT EXISTS processing_attempts_job_started_idx ON processing_attempts (job_id, started_at);
CREATE INDEX IF NOT EXISTS processing_attempts_model_tier_idx ON processing_attempts (model, service_tier, model_variant);

DROP TRIGGER IF EXISTS processing_attempts_set_updated_at ON processing_attempts;
CREATE TRIGGER processing_attempts_set_updated_at BEFORE UPDATE ON processing_attempts FOR EACH ROW EXECUTE FUNCTION proofcheck_set_updated_at();

ALTER TABLE processing_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE processing_attempts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE processing_attempts FROM authenticated;
  END IF;
END;
$$;
