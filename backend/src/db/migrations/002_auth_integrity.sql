-- Login accepts only a username, so the lookup key must be unique across tenants.
-- Fail the migration rather than silently choosing an arbitrary tenant if legacy data
-- already contains a case-insensitive duplicate that needs manual cleanup.
DO $$
BEGIN
  IF EXISTS (
    SELECT lower(username)
      FROM users
     GROUP BY lower(username)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate usernames must be resolved before applying 002_auth_integrity';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));
