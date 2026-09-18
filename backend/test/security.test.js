const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { decryptSecret, encryptSecret } = require('../dist/security/crypto');

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
