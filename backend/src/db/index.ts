import fs from 'fs';
import path from 'path';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { AppError } from '../errors';

const poolOptions = {
  connectionString: config.databaseUrl || undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined,
};

export const pool = new Pool({ ...poolOptions, max: Number(process.env.DB_POOL_MAX || 10) });
pool.on('error', (error) => {
  console.error('数据库连接池后台连接错误:', error instanceof Error ? error.message : error);
});

// Advisory locks must not consume a connection from the application pool.
// Otherwise DB_POOL_MAX=1 deadlocks when the lock holder calls query(), and a
// busy tenant can also starve unrelated request transactions.
export const advisoryLockPool = new Pool({ ...poolOptions, max: Number(process.env.DB_ADVISORY_LOCK_POOL_MAX || 10) });
advisoryLockPool.on('error', (error) => {
  console.error('数据库 advisory lock 连接池后台连接错误:', error instanceof Error ? error.message : error);
});

export function assertDatabaseConfigured(): void {
  if (!config.databaseUrl) {
    throw new AppError(503, 'DATABASE_NOT_CONFIGURED', '数据库未配置，核心业务暂不可用');
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  assertDatabaseConfigured();
  try {
    return await pool.query<T>(text, values);
  } catch (error) {
    console.error('数据库操作失败:', error instanceof Error ? error.message : 'unknown error');
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (code === '23505') throw new AppError(409, 'DATABASE_CONSTRAINT', '数据已存在或请求重复', true, code);
    if (code === '23503' || code === '23514' || code === '23502') throw new AppError(409, 'DATABASE_CONSTRAINT', '数据不满足业务约束', true, code);
    throw new AppError(503, 'DATABASE_UNAVAILABLE', '数据库暂时不可用');
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  assertDatabaseConfigured();
  const client = await pool.connect().catch(() => {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', '数据库暂时不可用');
  });
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<boolean> {
  if (!config.databaseUrl) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export function migrationsDirectory(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(__dirname, 'migrations'),
  ].filter(Boolean) as string[];
  const directory = candidates.find((candidate) => fs.existsSync(candidate));
  if (!directory) throw new Error('找不到数据库迁移目录');
  return directory;
}
