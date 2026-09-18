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

export type MessageCursor = { createdAt: Date; id?: string };

export function parseMessageCursor(raw: string | undefined): MessageCursor | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    // Accept the pre-cursor ISO format so existing clients can migrate without
    // losing access to older history. New responses always use the stable form.
    const legacy = new Date(raw);
    if (!Number.isNaN(legacy.getTime())) return { createdAt: legacy };
    throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  }
  if (!parsed || typeof parsed !== 'object') throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  const value = parsed as { createdAt?: unknown; id?: unknown };
  const createdAt = typeof value.createdAt === 'string' ? new Date(value.createdAt) : new Date(NaN);
  if (Number.isNaN(createdAt.getTime()) || (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 200))) {
    throw new AppError(400, 'INVALID_CURSOR', '消息游标无效');
  }
  return { createdAt, id: typeof value.id === 'string' && value.id ? value.id : undefined };
}

export function encodeMessageCursor(createdAt: Date | string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: new Date(createdAt).toISOString(), id }), 'utf8').toString('base64url');
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (
    ('code' in error && (error as { code?: string }).code === '23505') ||
    ('causeCode' in error && (error as { causeCode?: string }).causeCode === '23505')
  ));
}
