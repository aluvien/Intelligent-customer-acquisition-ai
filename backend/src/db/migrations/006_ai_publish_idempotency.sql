CREATE UNIQUE INDEX IF NOT EXISTS messages_ai_run_publish_idx
  ON messages (tenant_id, (COALESCE(metadata->>'aiRunId', metadata->>'approvedAiRunId')))
  WHERE direction = 'outbound'
    AND (metadata ? 'aiRunId' OR metadata ? 'approvedAiRunId');

CREATE UNIQUE INDEX IF NOT EXISTS ai_runs_active_message_idx
  ON ai_runs (tenant_id, message_id)
  WHERE message_id IS NOT NULL
    AND status IN ('queued', 'running', 'succeeded');
