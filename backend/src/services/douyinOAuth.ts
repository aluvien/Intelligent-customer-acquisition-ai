import axios from 'axios';
import { config, getEncryptionKey } from '../config';
import { AppError } from '../errors';

const AUTHORIZE_URL = 'https://open.douyin.com/platform/oauth/connect/';
const ACCESS_TOKEN_URL = 'https://open.douyin.com/oauth/access_token/';
const USER_INFO_URL = 'https://open.douyin.com/oauth/userinfo/';

export type DouyinOAuthConfig = {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type DouyinCredentials = {
  version: 1;
  openId: string;
  unionId?: string;
  accessToken: string;
  refreshToken: string;
  scope: string[];
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  authorizedAt: string;
};

export type DouyinAuthorizedAccount = {
  openId: string;
  unionId?: string;
  nickname: string;
  avatar?: string;
  credentials: DouyinCredentials;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveSeconds(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function errorCode(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

export function parseDouyinScopes(raw: string): string[] {
  const scopes = [...new Set(raw.split(',').map((scope) => scope.trim()).filter(Boolean))];
  if (!scopes.includes('user_info')) scopes.unshift('user_info');
  if (scopes.some((scope) => !/^[A-Za-z0-9._-]{1,100}$/.test(scope))) {
    throw new AppError(503, 'DOUYIN_CONFIG_INVALID', 'DOUYIN_SCOPES 包含无效权限名称');
  }
  return scopes;
}

export function getDouyinOAuthConfig(): DouyinOAuthConfig {
  if (!config.douyinClientKey || !config.douyinClientSecret || !config.douyinRedirectUri) {
    throw new AppError(503, 'DOUYIN_NOT_CONFIGURED', '请先在服务端配置抖音开放平台 Client Key、Client Secret 和 HTTPS 回调地址');
  }
  let redirect: URL;
  try {
    redirect = new URL(config.douyinRedirectUri);
  } catch {
    throw new AppError(503, 'DOUYIN_CONFIG_INVALID', 'DOUYIN_REDIRECT_URI 不是有效 URL');
  }
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search) {
    throw new AppError(503, 'DOUYIN_CONFIG_INVALID', '抖音授权回调必须是无账号信息、查询参数和片段的 HTTPS URL');
  }
  try {
    getEncryptionKey();
  } catch {
    throw new AppError(503, 'DOUYIN_CONFIG_INVALID', 'ENCRYPTION_KEY 未配置或不是 base64 编码的 32 字节密钥');
  }
  return {
    clientKey: config.douyinClientKey,
    clientSecret: config.douyinClientSecret,
    redirectUri: redirect.toString(),
    scopes: parseDouyinScopes(config.douyinScopes),
  };
}

export function douyinOAuthConfigStatus(): { configured: boolean; redirectUri?: string; scopes: string[]; error?: string } {
  try {
    const value = getDouyinOAuthConfig();
    return { configured: true, redirectUri: value.redirectUri, scopes: value.scopes };
  } catch (error) {
    let scopes: string[] = [];
    try { scopes = parseDouyinScopes(config.douyinScopes); } catch { scopes = []; }
    return {
      configured: false,
      scopes,
      error: error instanceof Error ? error.message : '抖音开放平台配置无效',
    };
  }
}

export function buildDouyinAuthorizeUrl(oauth: DouyinOAuthConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_key', oauth.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', oauth.scopes.join(','));
  url.searchParams.set('redirect_uri', oauth.redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

export function parseDouyinTokenResponse(value: unknown, now = new Date()): DouyinCredentials {
  const root = record(value);
  const data = record(root.data);
  const providerCode = errorCode(data.error_code);
  const accessToken = text(data.access_token);
  const refreshToken = text(data.refresh_token);
  const openId = text(data.open_id);
  const accessSeconds = positiveSeconds(data.expires_in);
  const refreshSeconds = positiveSeconds(data.refresh_expires_in);
  if (providerCode !== 0 || !accessToken || !refreshToken || !openId || !accessSeconds || !refreshSeconds) {
    const description = text(data.description) || text(root.message) || '抖音授权码换取凭据失败';
    throw new AppError(502, 'DOUYIN_TOKEN_EXCHANGE_FAILED', description.slice(0, 300));
  }
  const authorizedAt = now.toISOString();
  return {
    version: 1,
    openId,
    accessToken,
    refreshToken,
    scope: text(data.scope).split(',').map((scope) => scope.trim()).filter(Boolean),
    accessTokenExpiresAt: new Date(now.getTime() + accessSeconds * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(now.getTime() + refreshSeconds * 1000).toISOString(),
    authorizedAt,
  };
}

export function parseDouyinUserResponse(value: unknown, expectedOpenId: string): { openId: string; unionId?: string; nickname: string; avatar?: string } {
  const root = record(value);
  const data = record(root.data);
  const topLevelCode = errorCode(root.err_no);
  const nestedCode = errorCode(data.error_code);
  const openId = text(data.open_id);
  if (topLevelCode !== 0 || nestedCode !== 0 || !openId || openId !== expectedOpenId) {
    const description = text(root.err_msg) || text(data.description) || '获取抖音账号信息失败';
    throw new AppError(502, 'DOUYIN_USER_INFO_FAILED', description.slice(0, 300));
  }
  return {
    openId,
    unionId: text(data.union_id) || undefined,
    nickname: text(data.nickname) || `抖音账号 ${openId.slice(0, 8)}`,
    avatar: text(data.avatar) || undefined,
  };
}

export async function authorizeDouyinAccount(code: string): Promise<DouyinAuthorizedAccount> {
  const oauth = getDouyinOAuthConfig();
  try {
    const tokenBody = new URLSearchParams({
      client_key: oauth.clientKey,
      client_secret: oauth.clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    const tokenResponse = await axios.post(ACCESS_TOKEN_URL, tokenBody.toString(), {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });
    if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
      throw new AppError(502, 'DOUYIN_TOKEN_EXCHANGE_FAILED', '抖音开放平台暂时无法完成授权');
    }
    const credentials = parseDouyinTokenResponse(tokenResponse.data);
    const userBody = new URLSearchParams({ access_token: credentials.accessToken, open_id: credentials.openId });
    const userResponse = await axios.post(USER_INFO_URL, userBody.toString(), {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });
    if (userResponse.status < 200 || userResponse.status >= 300) {
      throw new AppError(502, 'DOUYIN_USER_INFO_FAILED', '抖音开放平台暂时无法读取账号信息');
    }
    const user = parseDouyinUserResponse(userResponse.data, credentials.openId);
    return {
      ...user,
      credentials: { ...credentials, unionId: user.unionId },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'DOUYIN_OAUTH_UNAVAILABLE', '抖音开放平台连接失败，请稍后重新扫码');
  }
}
