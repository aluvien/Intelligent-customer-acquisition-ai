import fs from 'fs';
import path from 'path';
import { pool, migrationsDirectory } from '../db';

async function main(): Promise<void> {
  const directory = migrationsDirectory();
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  for (const file of files) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (existing.rowCount) continue;
    const sql = fs.readFileSync(path.join(directory, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error('数据库迁移失败:', error instanceof Error ? error.message : error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
