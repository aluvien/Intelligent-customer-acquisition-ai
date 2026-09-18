ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS family_id TEXT;

UPDATE auth_sessions
   SET family_id = id
 WHERE family_id IS NULL;

ALTER TABLE auth_sessions
  ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_family_idx
  ON auth_sessions (user_id, family_id, revoked_at);
