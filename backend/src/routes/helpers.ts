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

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (
    ('code' in error && (error as { code?: string }).code === '23505') ||
    ('causeCode' in error && (error as { causeCode?: string }).causeCode === '23505')
  ));
}
