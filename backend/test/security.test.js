const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { decryptSecret, encryptSecret } = require('../dist/security/crypto');
const { extractCozeText } = require('../dist/services/aiProvider');
const { encodeMessageCursor, encodeVisitorMessageCursor, parseMessageCursor, parseVisitorMessageCursor } = require('../dist/routes/helpers');

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
  assert.deepEqual(parseVisitorMessageCursor(timestampOnly), { kind: 'createdAt', createdAt: '2026-09-19 04:05:06.123900+00' });
  assert.throws(() => parseVisitorMessageCursor(encodeVisitorMessageCursor('9999999999999999999', 'message-overflow')));
});
