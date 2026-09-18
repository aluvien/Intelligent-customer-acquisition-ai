-- Rows that existed before 007 do not have a trustworthy provider or
-- knowledge-history classification. Keep them out of automatic recovery
-- instead of treating an empty snapshot as permission to use today's data.
ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS knowledge_snapshot_state TEXT NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_runs_knowledge_snapshot_state_check'
  ) THEN
    ALTER TABLE ai_runs
      ADD CONSTRAINT ai_runs_knowledge_snapshot_state_check
      CHECK (knowledge_snapshot_state IN ('pending', 'captured', 'unknown'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = '007_ai_provider_recovery.sql'
  ) THEN
    RAISE EXCEPTION '007_ai_provider_recovery.sql must be recorded before 008 legacy classification';
  END IF;
END $$;

-- The table lock held by this migration makes the classification a boundary:
-- every row present now is legacy/ambiguous, while rows inserted after commit
-- receive the pending default below. This is deliberately conservative even
-- for rows created after 007 but before the service was upgraded.
UPDATE ai_runs
   SET provider_state = 'unknown',
       knowledge_snapshot_state = 'unknown';

ALTER TABLE ai_runs
  ALTER COLUMN knowledge_snapshot_state SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS ai_runs_knowledge_snapshot_state_idx
  ON ai_runs (tenant_id, knowledge_snapshot_state, created_at);
