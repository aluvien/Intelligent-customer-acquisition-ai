-- Public visitor history is ordered by visibility, not by the original
-- creation timestamp. This lets a provider-accepted message recovered from a
-- failed/cancelled row appear at the current end of history without changing
-- its audit timestamp.
CREATE SEQUENCE IF NOT EXISTS visitor_message_visibility_seq AS BIGINT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS visitor_visibility_seq BIGINT;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS visibility_seq
    FROM messages
)
UPDATE messages m
   SET visitor_visibility_seq = ordered.visibility_seq
  FROM ordered
 WHERE m.id = ordered.id
   AND m.visitor_visibility_seq IS NULL;

SELECT setval(
  'visitor_message_visibility_seq',
  GREATEST(COALESCE((SELECT MAX(visitor_visibility_seq) FROM messages), 1), 1),
  true
);

ALTER TABLE messages
  ALTER COLUMN visitor_visibility_seq SET DEFAULT nextval('visitor_message_visibility_seq');

ALTER TABLE messages
  ALTER COLUMN visitor_visibility_seq SET NOT NULL;

CREATE INDEX IF NOT EXISTS messages_visitor_visibility_idx
  ON messages (tenant_id, conversation_id, visitor_visibility_seq DESC, id DESC);
