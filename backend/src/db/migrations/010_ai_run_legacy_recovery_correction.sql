-- Correct databases that recorded the original 008 migration before its
-- legacy boundary was made conservative. The migration runner skips a file
-- by name, so changing 008 in place cannot repair such an already-recorded
-- database. This migration only touches still-pending rows that existed at
-- the recorded 008 boundary; captured snapshots created after that boundary
-- remain trusted and untouched.
DO $$
DECLARE
  legacy_boundary TIMESTAMPTZ;
BEGIN
  SELECT applied_at
    INTO legacy_boundary
    FROM schema_migrations
   WHERE name = '008_ai_run_legacy_recovery.sql';

  IF legacy_boundary IS NULL THEN
    RAISE EXCEPTION '008_ai_run_legacy_recovery.sql must be recorded before 010 legacy correction';
  END IF;

  UPDATE ai_runs
     SET provider_state = 'unknown',
         knowledge_snapshot_state = 'unknown'
   WHERE created_at < legacy_boundary
     AND knowledge_snapshot_state = 'pending';
END $$;
