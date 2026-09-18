const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { decryptSecret, encryptSecret } = require('../dist/security/crypto');
const { extractCozeText } = require('../dist/services/aiProvider');

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
