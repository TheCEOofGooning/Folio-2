import assert from 'node:assert/strict';
import test from 'node:test';

import { fromBase64Url, hmacSha256Base64Url, sha256Hex, timingSafeEqual, toBase64Url } from '@/lib/auth/crypto';
import { hashPassword, isPasswordHash, verifyPassword, PBKDF2_ITERATIONS } from '@/lib/auth/password';
import { generateSessionToken, hashToken, openToken, sealToken } from '@/lib/auth/token';
import {
  displayNameFromEmail,
  normalizeEmail,
  normalizeUsername,
  usernameFromEmail,
  validatePassword,
  validateUsername,
} from '@/lib/auth/validators';

test('base64url round-trips every byte length that matters', () => {
  for (const length of [1, 2, 3, 4, 16, 32, 33]) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    const encoded = toBase64Url(bytes);
    assert.ok(!encoded.includes('='), 'must be unpadded');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(encoded), 'must be url safe');
    assert.deepEqual(fromBase64Url(encoded), bytes);
  }
});

test('sha256 matches the known FIPS test vector', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('timingSafeEqual rejects length mismatches and different bytes', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
});

test('passwords hash to the documented format and verify', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.ok(isPasswordHash(hash));
  const parts = hash.split('$');
  assert.equal(parts[0], 'pbkdf2');
  assert.equal(parts[1], 'sha256');
  assert.equal(Number(parts[2]), PBKDF2_ITERATIONS);
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('every hash uses a fresh salt', async () => {
  const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('same', a), true);
  assert.equal(await verifyPassword('same', b), true);
});

test('malformed hashes fail closed instead of throwing', async () => {
  for (const bad of ['', 'nope', 'pbkdf2$sha256$x$y', 'bcrypt$12$aaa$bbb']) {
    assert.equal(await verifyPassword('anything', bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test('session cookies are sealed and reject tampering', async () => {
  const token = generateSessionToken();
  assert.ok(token.length >= 40, 'token must carry 256 bits of entropy');

  const sealed = await sealToken(token);
  assert.equal(await openToken(sealed), token);
  assert.equal(await openToken(undefined), null);
  assert.equal(await openToken('garbage'), null);
  assert.equal(await openToken(`${token}.AAAA`), null, 'bad signature must be rejected');

  const forged = `${generateSessionToken()}.${sealed.split('.')[1]}`;
  assert.equal(await openToken(forged), null, 'signature must be bound to the token');
});

test('token hashes are stable and distinct', async () => {
  const token = generateSessionToken();
  assert.equal(await hashToken(token), await hashToken(token));
  assert.notEqual(await hashToken(token), await hashToken(generateSessionToken()));
  assert.equal((await hashToken(token)).length, 64);
});

test('hmac output is deterministic per secret', async () => {
  const a = await hmacSha256Base64Url('secret-one', 'payload');
  const b = await hmacSha256Base64Url('secret-one', 'payload');
  const c = await hmacSha256Base64Url('secret-two', 'payload');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('signup validators enforce the documented rules', () => {
  assert.equal(validateUsername('ada'), null);
  // Invalid characters are stripped by normalisation rather than rejected.
  assert.equal(normalizeUsername('Ada Lovelace'), 'adalovelace');
  assert.equal(validateUsername('Ada Lovelace'), null);
  assert.equal(validateUsername('a!'), 'Usernames need at least 3 characters.');
  assert.equal(validateUsername('ab'), 'Usernames need at least 3 characters.');
  assert.equal(validateUsername('write'), 'That username is reserved.');
  assert.equal(validateUsername('1234'), 'Usernames cannot be only numbers.');

  assert.equal(validatePassword('12345678'), null);
  assert.equal(validatePassword('short'), 'Passwords need at least 8 characters.');

  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
  assert.equal(displayNameFromEmail('ada.lovelace@example.com'), 'Ada Lovelace');
  assert.equal(usernameFromEmail('ada.lovelace@example.com'), 'adalovelace');
});
