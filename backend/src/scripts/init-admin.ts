import bcrypt from 'bcryptjs';
import { query, withTransaction, pool } from '../db';
import { randomId } from '../config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 未配置`);
  return value;
}

async function main(): Promise<void> {
  const username = required('ADMIN_USERNAME');
  const email = required('ADMIN_EMAIL').toLowerCase();
  const password = required('ADMIN_PASSWORD');
  const tenantName = required('TENANT_NAME');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD 至少需要 8 个字符');

  const existing = await query<{ id: string }>('SELECT id FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2) LIMIT 1', [username, email]);
  if (existing.rowCount) {
    console.log('管理员已存在，未覆盖现有密码。');
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await withTransaction(async (client) => {
    const tenantId = randomId();
    await client.query(`INSERT INTO tenants(id, name, plan) VALUES ($1, $2, 'pro')`, [tenantId, tenantName]);
    await client.query(`INSERT INTO users(id, tenant_id, username, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, 'admin')`, [randomId(), tenantId, username, email, passwordHash]);
  });
  console.log('管理员初始化完成。');
  await pool.end();
}

main().catch(async (error) => {
  console.error('管理员初始化失败:', error instanceof Error ? error.message : error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
