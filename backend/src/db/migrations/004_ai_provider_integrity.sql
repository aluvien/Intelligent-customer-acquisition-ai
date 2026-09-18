ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS provider_conversation_id TEXT;

CREATE INDEX IF NOT EXISTS ai_runs_provider_conversation_idx
  ON ai_runs (tenant_id, provider, provider_conversation_id)
  WHERE provider_conversation_id IS NOT NULL;
