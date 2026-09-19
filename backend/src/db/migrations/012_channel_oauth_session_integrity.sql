-- Bind each OAuth request to a session owned by the same tenant and user.
-- Abort with a clear error if a database was manually populated with an
-- inconsistent request before this constraint existed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM channel_oauth_requests r
      LEFT JOIN auth_sessions s
        ON s.id = r.auth_session_id
       AND s.tenant_id = r.tenant_id
       AND s.user_id = r.user_id
     WHERE s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'channel_oauth_requests contains an auth session owned by a different tenant or user';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_tenant_user_id_idx
  ON auth_sessions(tenant_id, user_id, id);

ALTER TABLE channel_oauth_requests
  ADD CONSTRAINT channel_oauth_requests_tenant_user_session_fk
  FOREIGN KEY (tenant_id, user_id, auth_session_id)
  REFERENCES auth_sessions(tenant_id, user_id, id)
  ON DELETE CASCADE;
