import { Response } from 'express';
import { config } from '../config';

export const REFRESH_COOKIE = 'xinglian_refresh';

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const index = part.indexOf('=');
      if (index < 0) return [part.trim(), ''];
      const key = part.slice(0, index).trim();
      const rawValue = part.slice(index + 1).trim();
      try { return [key, decodeURIComponent(rawValue)]; }
      catch { return [key, '']; }
    }).filter(([key]) => Boolean(key)),
  );
}

export function setRefreshCookie(res: Response, value: string): void {
  const maxAge = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  res.setHeader('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/api/auth; HttpOnly; SameSite=${config.cookieSameSite}${config.cookieSecure ? '; Secure' : ''}`);
}

export function clearRefreshCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${REFRESH_COOKIE}=; Max-Age=0; Path=/api/auth; HttpOnly; SameSite=${config.cookieSameSite}${config.cookieSecure ? '; Secure' : ''}`);
}

export function checkOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return config.corsOrigin.split(',').map((item) => item.trim()).includes(origin);
}
