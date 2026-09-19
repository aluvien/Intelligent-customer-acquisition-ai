const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { decryptSecret, encryptSecret } = require('../dist/security/crypto');
const { extractCozeText } = require('../dist/services/aiProvider');
const { buildDouyinAuthorizeUrl, parseDouyinScopes, parseDouyinTokenResponse, parseDouyinUserResponse } = require('../dist/services/douyinOAuth');
const { encodeMessageCursor, encodeVisitorMessageCursor, parseExpectedModeVersion, parseMessageCursor, parseVisitorMessageCursor } = require('../dist/routes/helpers');

test('platform credentials are encrypted and decryptable', () => {
  const plaintext = 'provider-secret-value';
  const ciphertext = encryptSecret(plaintext);

  assert.notEqual(ciphertext, plaintext);
  assert.equal(decryptSecret(ciphertext), plaintext);
  assert.notEqual(encryptSecret(plaintext), ciphertext);
});

test('tampered platform credentials are rejected', () => {
  const ciphertext = encryptSecret('provider-secret-value');
  const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('a') ? 'b' : 'a'}`;

  assert.throws(() => decryptSecret(tampered));
});

test('Coze extraction returns only the assistant answer', () => {
  const text = extractCozeText({ data: [
    { role: 'assistant', type: 'verbose', content_type: 'text', content: '{"msg_type":"generate_answer_finish"}' },
    { role: 'assistant', type: 'follow_up', content_type: 'text', content: '你还想了解什么？' },
    { role: 'assistant', type: 'answer', content_type: 'text', content: '这是基于企业知识的回答。' },
    { role: 'assistant', type: 'answer', content_type: 'text', content: '这是回答的第二段。' },
    { role: 'assistant', type: 'answer', content: '缺少 content_type，不应作为回复。' },
  ] });
  assert.equal(text, '这是基于企业知识的回答。\n\n这是回答的第二段。');
});

test('message cursors preserve PostgreSQL microseconds', () => {
  const timestamp = '2026-09-19 04:05:06.123900+00';
  const parsed = parseMessageCursor(encodeMessageCursor(timestamp, 'message-1'));

  assert.equal(parsed.createdAt, timestamp);
  assert.equal(parsed.id, 'message-1');
});

test('visitor cursors use visibility sequence and accept the legacy boundary', () => {
  const sequenceCursor = parseVisitorMessageCursor(encodeVisitorMessageCursor('42', 'message-42'));
  assert.deepEqual(sequenceCursor, { kind: 'sequence', sequence: '42', id: 'message-42' });

  const legacyCursor = parseVisitorMessageCursor(encodeMessageCursor('2026-09-19 04:05:06.123900+00', 'message-1'));
  assert.deepEqual(legacyCursor, { kind: 'createdAt', createdAt: '2026-09-19 04:05:06.123900+00', id: 'message-1' });
  const timestampOnly = Buffer.from(JSON.stringify({ createdAt: '2026-09-19 04:05:06.123900+00' }), 'utf8').toString('base64url');
  assert.deepEqual(parseVisitorMessageCursor(timestampOnly), { kind: 'createdAt', createdAt: '2026-09-19 04:05:06.123900+00', id: undefined });
  assert.throws(() => parseVisitorMessageCursor(encodeVisitorMessageCursor('9999999999999999999', 'message-overflow')));
});

test('conversation mode updates require a typed bounded version', () => {
  assert.equal(parseExpectedModeVersion(1), 1);
  for (const value of [undefined, null, true, false, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER, 2_147_483_648]) {
    assert.throws(
      () => parseExpectedModeVersion(value),
      (error) => error && error.code === 'INVALID_MODE_VERSION',
    );
  }
});

test('Douyin authorization URL contains state and never exposes the client secret', () => {
  const url = new URL(buildDouyinAuthorizeUrl({
    clientKey: 'client-key',
    clientSecret: 'client-secret',
    redirectUri: 'https://admin.example.com/api/channels/douyin/oauth/callback',
    scopes: ['user_info'],
  }, 'single-use-state'));

  assert.equal(url.origin, 'https://open.douyin.com');
  assert.equal(url.pathname, '/platform/oauth/connect/');
  assert.equal(url.searchParams.get('client_key'), 'client-key');
  assert.equal(url.searchParams.get('state'), 'single-use-state');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://admin.example.com/api/channels/douyin/oauth/callback');
  assert.equal(url.toString().includes('client-secret'), false);
});

test('Douyin provider responses are strictly validated before credentials are stored', () => {
  const now = new Date('2026-09-19T00:00:00.000Z');
  const credentials = parseDouyinTokenResponse({ message: 'success', data: {
    error_code: 0,
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    open_id: 'open-id',
    expires_in: 1296000,
    refresh_expires_in: 2592000,
    scope: 'user_info',
  } }, now);
  assert.equal(credentials.openId, 'open-id');
  assert.equal(credentials.accessTokenExpiresAt, '2026-10-04T00:00:00.000Z');
  assert.equal(credentials.refreshTokenExpiresAt, '2026-10-19T00:00:00.000Z');

  const user = parseDouyinUserResponse({ err_no: 0, data: {
    error_code: '0', open_id: 'open-id', union_id: 'union-id', nickname: '授权账号', avatar: 'https://example.com/avatar.png',
  } }, 'open-id');
  assert.equal(user.nickname, '授权账号');
  assert.throws(() => parseDouyinUserResponse({ err_no: 0, data: { error_code: '0', open_id: 'different-id' } }, 'open-id'));
  assert.throws(() => parseDouyinTokenResponse({ message: 'error', data: { error_code: 10007, description: 'code expired' } }, now));
});

test('Douyin scopes always include user_info and reject malformed values', () => {
  assert.deepEqual(parseDouyinScopes('video.list,user_info,video.list'), ['video.list', 'user_info']);
  assert.deepEqual(parseDouyinScopes('message'), ['user_info', 'message']);
  assert.throws(() => parseDouyinScopes('user_info,scope with spaces'));
});
