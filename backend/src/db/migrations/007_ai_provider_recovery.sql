ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS knowledge_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS provider_state TEXT NOT NULL DEFAULT 'new';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_runs_provider_state_check'
  ) THEN
    ALTER TABLE ai_runs
      ADD CONSTRAINT ai_runs_provider_state_check
      CHECK (provider_state IN ('new', 'creating', 'active', 'completed', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_runs_provider_state_idx
  ON ai_runs (tenant_id, provider_state, created_at);
