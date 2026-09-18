import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envFiles = [process.env.ENV_FILE, path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')].filter(Boolean) as string[];
const envFile = envFiles.find((candidate) => fs.existsSync(candidate));
if (envFile) dotenv.config({ path: envFile });

import { pool, migrationsDirectory } from '../db';

const MIGRATION_LOCK = '721634180238414127';

async function main(): Promise<void> {
  const directory = migrationsDirectory();
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  const lockClient = await pool.connect();
  try {
    await lockClient.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK]);
    await lockClient.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

    for (const file of files) {
      const existing = await lockClient.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (existing.rowCount) continue;
      const sql = fs.readFileSync(path.join(directory, file), 'utf8');
      await lockClient.query('BEGIN');
      try {
        await lockClient.query(sql);
        await lockClient.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await lockClient.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await lockClient.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK]).catch(() => undefined);
    lockClient.release();
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error('数据库迁移失败:', error instanceof Error ? error.message : error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
