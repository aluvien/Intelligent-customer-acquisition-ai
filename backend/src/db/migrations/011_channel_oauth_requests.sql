CREATE TABLE IF NOT EXISTS channel_oauth_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('douyin')),
  state_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'expired')),
  channel_account_id TEXT REFERENCES channel_accounts(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, channel_account_id) REFERENCES channel_accounts(tenant_id, id) ON DELETE SET NULL (channel_account_id)
);

CREATE INDEX IF NOT EXISTS channel_oauth_requests_owner_idx
  ON channel_oauth_requests(tenant_id, user_id, auth_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS channel_oauth_requests_expiry_idx
  ON channel_oauth_requests(status, expires_at);
