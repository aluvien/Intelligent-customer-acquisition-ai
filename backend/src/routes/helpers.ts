import express from 'express';
import { AppError } from '../errors';

export function tenantId(req: express.Request): string {
  if (!req.auth?.tenantId) throw new AppError(401, 'AUTH_REQUIRED', '未提供认证令牌');
  return req.auth.tenantId;
}

export function pageParams(req: express.Request): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Math.min(10_000, Number(req.query.page || 1)));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || req.query.pageSize || 20)));
  if (!Number.isInteger(page) || !Number.isInteger(limit)) throw new AppError(400, 'INVALID_PAGINATION', '分页参数无效');
  return { page, limit, offset: (page - 1) * limit };
}

export function requireText(value: unknown, field: string, maxLength = 4000): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new AppError(400, 'INVALID_INPUT', `${field}不能为空且长度不能超过${maxLength}个字符`);
  }
  return value.trim();
}

export function optionalText(value: unknown, maxLength = 4000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maxLength) throw new AppError(400, 'INVALID_INPUT', '文本参数长度无效');
  return value.trim();
}

// Keep the database timestamp text intact. JavaScript Date and node-postgres
// both round PostgreSQL microseconds to milliseconds, which can skip messages
// at a page boundary when the cursor is serialized and queried again.
export type MessageCursor = { createdAt: string; id?: string };

export function parseMessageCursor(raw: string | undefined): MessageCursor | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    // Accept the pre-cursor ISO format so existing clients can migrate without
    // losing access to older history. New responses always use the stable form.
    const legacy = new Date(raw);
    if (!Number.isNaN(legacy.getTime())) return { createdAt: legacy.toISOString() };
    throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  }
  if (!parsed || typeof parsed !== 'object') throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  const value = parsed as { createdAt?: unknown; id?: unknown };
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : '';
  if (!createdAt || Number.isNaN(new Date(createdAt).getTime()) || (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 200))) {
    throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  }
  return { createdAt, id: typeof value.id === 'string' && value.id ? value.id : undefined };
}

export function encodeMessageCursor(createdAt: Date | string, id: string): string {
  const value = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  return Buffer.from(JSON.stringify({ createdAt: value, id }), 'utf8').toString('base64url');
}

export type VisitorMessageCursor =
  | { kind: 'sequence'; sequence: string; id: string }
  | { kind: 'createdAt'; createdAt: string; id?: string };

export function parseVisitorMessageCursor(raw: string | undefined): VisitorMessageCursor | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    const legacy = new Date(raw);
    if (!Number.isNaN(legacy.getTime())) return { kind: 'createdAt', createdAt: legacy.toISOString() };
    throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  }
  if (!parsed || typeof parsed !== 'object') throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  const value = parsed as { sequence?: unknown; createdAt?: unknown; id?: unknown };
  if (typeof value.sequence === 'string' && /^\d{1,19}$/.test(value.sequence) && BigInt(value.sequence) <= 9_223_372_036_854_775_807n && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200) {
    return { kind: 'sequence', sequence: value.sequence, id: value.id };
  }
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : '';
  if (!createdAt || Number.isNaN(new Date(createdAt).getTime()) || (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 200))) {
    throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  }
  return { kind: 'createdAt', createdAt, id: typeof value.id === 'string' && value.id ? value.id : undefined };
}

export function encodeVisitorMessageCursor(sequence: string, id: string): string {
  return Buffer.from(JSON.stringify({ sequence, id }), 'utf8').toString('base64url');
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (
    ('code' in error && (error as { code?: string }).code === '23505') ||
    ('causeCode' in error && (error as { causeCode?: string }).causeCode === '23505')
  ));
}
