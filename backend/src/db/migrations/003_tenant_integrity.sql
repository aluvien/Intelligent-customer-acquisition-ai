-- Keep tenant-scoped references from pointing at a row belonging to another tenant.
-- The original single-column foreign keys remain in place for delete semantics;
-- these composite keys add the missing tenant boundary.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_users_scope_idx ON users (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_channel_accounts_scope_idx ON channel_accounts (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_widgets_scope_idx ON widgets (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_visitor_sessions_scope_idx ON visitor_sessions (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_conversations_scope_idx ON conversations (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_messages_scope_idx ON messages (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_leads_scope_idx ON leads (tenant_id, id);

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_tenant_user_fk
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE visitor_sessions
  ADD CONSTRAINT visitor_sessions_tenant_widget_fk
  FOREIGN KEY (tenant_id, widget_id) REFERENCES widgets (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE inbound_events
  ADD CONSTRAINT inbound_events_tenant_channel_fk
  FOREIGN KEY (tenant_id, channel_account_id) REFERENCES channel_accounts (tenant_id, id)
  ON DELETE SET NULL (channel_account_id);

ALTER TABLE conversations
  ADD CONSTRAINT conversations_tenant_channel_fk
  FOREIGN KEY (tenant_id, channel_account_id) REFERENCES channel_accounts (tenant_id, id)
  ON DELETE SET NULL (channel_account_id),
  ADD CONSTRAINT conversations_tenant_widget_fk
  FOREIGN KEY (tenant_id, widget_id) REFERENCES widgets (tenant_id, id)
  ON DELETE SET NULL (widget_id),
  ADD CONSTRAINT conversations_tenant_visitor_session_fk
  FOREIGN KEY (tenant_id, visitor_session_id) REFERENCES visitor_sessions (tenant_id, id)
  ON DELETE SET NULL (visitor_session_id),
  ADD CONSTRAINT conversations_tenant_assignee_fk
  FOREIGN KEY (tenant_id, assigned_to) REFERENCES users (tenant_id, id)
  ON DELETE SET NULL (assigned_to);

ALTER TABLE messages
  ADD CONSTRAINT messages_tenant_conversation_fk
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id)
  ON DELETE CASCADE;

ALTER TABLE leads
  ADD CONSTRAINT leads_tenant_conversation_fk
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id)
  ON DELETE CASCADE,
  ADD CONSTRAINT leads_tenant_channel_fk
  FOREIGN KEY (tenant_id, channel_account_id) REFERENCES channel_accounts (tenant_id, id)
  ON DELETE SET NULL (channel_account_id),
  ADD CONSTRAINT leads_tenant_assignee_fk
  FOREIGN KEY (tenant_id, assigned_to) REFERENCES users (tenant_id, id)
  ON DELETE SET NULL (assigned_to);

ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_tenant_conversation_fk
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id)
  ON DELETE SET NULL (conversation_id),
  ADD CONSTRAINT ai_runs_tenant_message_fk
  FOREIGN KEY (tenant_id, message_id) REFERENCES messages (tenant_id, id)
  ON DELETE SET NULL (message_id);

ALTER TABLE lead_followups
  ADD CONSTRAINT lead_followups_tenant_lead_fk
  FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id)
  ON DELETE CASCADE,
  ADD CONSTRAINT lead_followups_tenant_user_fk
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
  ON DELETE RESTRICT;

ALTER TABLE knowledge_documents
  ADD CONSTRAINT knowledge_tenant_author_fk
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
  ON DELETE SET NULL (created_by);

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_tenant_user_fk
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
  ON DELETE SET NULL (user_id);
