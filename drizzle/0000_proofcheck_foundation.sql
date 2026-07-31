CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE batch_mode AS ENUM ('single', 'batch', 'demo', 'benchmark'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE batch_status AS ENUM ('draft', 'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled', 'expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE regulatory_profile AS ENUM ('faa_distilled_spirits', 'faa_wine', 'faa_malt_beverage', 'irc_wine_under_7', 'irc_beer_non_faa', 'classification_review'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE origin_type AS ENUM ('domestic', 'imported', 'unknown'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_status AS ENUM ('none', 'queued', 'extracting', 'draft', 'confirmed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE job_status AS ENUM ('draft', 'queued', 'validating', 'extracting', 'verifying', 'completed', 'review_required', 'correction_needed', 'rejected', 'failed', 'cancelled', 'expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE job_outcome AS ENUM ('precheck_passed', 'human_review_required', 'correction_needed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE artifact_purpose AS ENUM ('label_artwork', 'application_document'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE label_panel AS ENUM ('brand', 'front', 'back', 'side', 'strip', 'neck', 'collarette', 'keg', 'container_marking', 'carton', 'closure', 'bottom', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE extraction_source AS ENUM ('openai', 'cached_demo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rule_status AS ENUM ('pass', 'fail', 'review', 'not_applicable', 'not_assessed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rule_severity AS ENUM ('information', 'warning', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE review_decision AS ENUM ('confirmed_clear', 'accepted_with_override', 'return_for_correction'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE outbox_status AS ENUM ('pending', 'sending', 'sent', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  idempotency_key text,
  name text NOT NULL,
  mode batch_mode NOT NULL,
  status batch_status NOT NULL DEFAULT 'draft',
  total_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batches_total_count_check CHECK (total_count BETWEEN 0 AND 300)
);

CREATE INDEX IF NOT EXISTS batches_session_created_idx ON batches (session_id, created_at);
CREATE INDEX IF NOT EXISTS batches_status_idx ON batches (status);
CREATE INDEX IF NOT EXISTS batches_expires_idx ON batches (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS batches_session_idempotency_uidx ON batches (session_id, idempotency_key);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  regulatory_profile regulatory_profile NOT NULL,
  origin_type origin_type NOT NULL DEFAULT 'unknown',
  submitted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_path text,
  document_status document_status NOT NULL DEFAULT 'none',
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS applications_batch_external_uidx ON applications (batch_id, external_id);
CREATE INDEX IF NOT EXISTS applications_batch_idx ON applications (batch_id);

CREATE TABLE IF NOT EXISTS label_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'draft',
  outcome job_outcome,
  attempt_count integer NOT NULL DEFAULT 0,
  confidence real,
  latency_ms integer,
  model text,
  prompt_version text,
  ruleset_version text,
  error_code text,
  error_message text,
  review_version integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT label_jobs_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT label_jobs_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT label_jobs_review_version_check CHECK (review_version >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS label_jobs_application_uidx ON label_jobs (application_id);
CREATE INDEX IF NOT EXISTS label_jobs_batch_status_idx ON label_jobs (batch_id, status);
CREATE INDEX IF NOT EXISTS label_jobs_status_created_idx ON label_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS label_jobs_expires_idx ON label_jobs (expires_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  job_id uuid REFERENCES label_jobs(id) ON DELETE CASCADE,
  purpose artifact_purpose NOT NULL,
  panel_type label_panel,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  width integer,
  height integer,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artifacts_size_bytes_check CHECK (size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT artifacts_dimensions_check CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
  CONSTRAINT artifacts_panel_purpose_check CHECK (
    (purpose = 'label_artwork' AND panel_type IS NOT NULL)
    OR (purpose = 'application_document' AND panel_type IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_storage_path_uidx ON artifacts (storage_path);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_application_hash_panel_uidx ON artifacts (application_id, sha256, panel_type);
CREATE INDEX IF NOT EXISTS artifacts_job_idx ON artifacts (job_id);
CREATE INDEX IF NOT EXISTS artifacts_expires_idx ON artifacts (expires_at);

CREATE TABLE IF NOT EXISTS extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES label_jobs(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  source extraction_source NOT NULL DEFAULT 'openai',
  raw_text text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_quality real,
  confidence real,
  model text NOT NULL,
  prompt_version text NOT NULL,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extractions_owner_check CHECK (num_nonnulls(job_id, application_id) = 1),
  CONSTRAINT extractions_image_quality_check CHECK (image_quality IS NULL OR image_quality BETWEEN 0 AND 1),
  CONSTRAINT extractions_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT extractions_latency_check CHECK (latency_ms >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS extractions_job_uidx ON extractions (job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS extractions_application_uidx ON extractions (application_id) WHERE application_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rule_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES label_jobs(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  status rule_status NOT NULL,
  severity rule_severity NOT NULL,
  expected_value jsonb,
  observed_value jsonb,
  confidence real,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_citation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_results_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS rule_results_job_rule_uidx ON rule_results (job_id, rule_id);
CREATE INDEX IF NOT EXISTS rule_results_job_status_idx ON rule_results (job_id, status);

CREATE TABLE IF NOT EXISTS review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES label_jobs(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  decision review_decision NOT NULL,
  notes text,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_decisions_version_check CHECK (review_version > 0),
  CONSTRAINT review_decisions_notes_check CHECK (
    decision = 'confirmed_clear' OR length(trim(coalesce(notes, ''))) >= 10
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS review_decisions_job_version_uidx ON review_decisions (job_id, review_version);
CREATE INDEX IF NOT EXISTS review_decisions_job_created_idx ON review_decisions (job_id, created_at);

CREATE TABLE IF NOT EXISTS status_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES label_jobs(id) ON DELETE CASCADE,
  from_status job_status,
  to_status job_status NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_events_job_created_idx ON status_events (job_id, created_at);

CREATE TABLE IF NOT EXISTS queue_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES label_jobs(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_outbox_attempt_check CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_outbox_event_uidx ON queue_outbox (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS queue_outbox_job_event_uidx ON queue_outbox (job_id, event_name);
CREATE INDEX IF NOT EXISTS queue_outbox_dispatch_idx ON queue_outbox (status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text NOT NULL,
  ip_hash text NOT NULL,
  kind text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  ledger_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_ledger_units_check CHECK (units > 0)
);

CREATE INDEX IF NOT EXISTS usage_ledger_session_date_idx ON usage_ledger (session_id, ledger_date, kind);
CREATE INDEX IF NOT EXISTS usage_ledger_ip_date_idx ON usage_ledger (ip_hash, ledger_date, kind);
CREATE INDEX IF NOT EXISTS usage_ledger_global_date_idx ON usage_ledger (ledger_date, kind);

CREATE OR REPLACE FUNCTION proofcheck_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS batches_set_updated_at ON batches;
CREATE TRIGGER batches_set_updated_at BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION proofcheck_set_updated_at();
DROP TRIGGER IF EXISTS applications_set_updated_at ON applications;
CREATE TRIGGER applications_set_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION proofcheck_set_updated_at();
DROP TRIGGER IF EXISTS label_jobs_set_updated_at ON label_jobs;
CREATE TRIGGER label_jobs_set_updated_at BEFORE UPDATE ON label_jobs FOR EACH ROW EXECUTE FUNCTION proofcheck_set_updated_at();
DROP TRIGGER IF EXISTS queue_outbox_set_updated_at ON queue_outbox;
CREATE TRIGGER queue_outbox_set_updated_at BEFORE UPDATE ON queue_outbox FOR EACH ROW EXECUTE FUNCTION proofcheck_set_updated_at();

CREATE OR REPLACE FUNCTION proofcheck_forbid_review_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'review decisions are immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS review_decisions_immutable ON review_decisions;
CREATE TRIGGER review_decisions_immutable BEFORE UPDATE ON review_decisions FOR EACH ROW EXECUTE FUNCTION proofcheck_forbid_review_update();

CREATE OR REPLACE FUNCTION proofcheck_consume_usage_quota(
  p_session_id text,
  p_ip_hash text,
  p_kind text,
  p_units integer,
  p_session_limit integer,
  p_ip_limit integer,
  p_global_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_units bigint;
  v_ip_units bigint;
  v_global_units bigint;
BEGIN
  IF p_units <= 0 OR p_session_limit < 0 OR p_ip_limit < 0 OR p_global_limit < 0 THEN
    RAISE EXCEPTION 'invalid quota arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('proofcheck-quota:' || current_date::text || ':' || p_kind));

  SELECT coalesce(sum(units), 0) INTO v_session_units
  FROM usage_ledger
  WHERE ledger_date = current_date AND kind = p_kind AND session_id = p_session_id;

  SELECT coalesce(sum(units), 0) INTO v_ip_units
  FROM usage_ledger
  WHERE ledger_date = current_date AND kind = p_kind AND ip_hash = p_ip_hash;

  SELECT coalesce(sum(units), 0) INTO v_global_units
  FROM usage_ledger
  WHERE ledger_date = current_date AND kind = p_kind;

  IF v_session_units + p_units > p_session_limit
    OR v_ip_units + p_units > p_ip_limit
    OR v_global_units + p_units > p_global_limit THEN
    RETURN false;
  END IF;

  INSERT INTO usage_ledger (session_id, ip_hash, kind, units)
  VALUES (p_session_id, p_ip_hash, p_kind, p_units);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION proofcheck_consume_usage_quota(text, text, text, integer, integer, integer, integer) FROM PUBLIC;

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE label_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE batches, applications, label_jobs, artifacts, extractions, rule_results, review_decisions, status_events, queue_outbox, usage_ledger FROM anon;
    REVOKE ALL ON SEQUENCE status_events_id_seq, usage_ledger_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE batches, applications, label_jobs, artifacts, extractions, rule_results, review_decisions, status_events, queue_outbox, usage_ledger FROM authenticated;
    REVOKE ALL ON SEQUENCE status_events_id_seq, usage_ledger_id_seq FROM authenticated;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $bucket$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'label-artifacts',
        'label-artifacts',
        false,
        10485760,
        ARRAY[
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
          'application/msword',
          'text/plain',
          'text/csv',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]::text[]
      )
      ON CONFLICT (id) DO UPDATE SET
        public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $bucket$;
  END IF;
END;
$$;
