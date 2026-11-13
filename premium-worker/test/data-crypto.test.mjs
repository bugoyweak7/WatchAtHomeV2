import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptRecord,
  encodeEncryptedValue,
  encryptRecord,
} from "../src/data-crypto.ts";

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function makeEnv(version = 1, keys = {}) {
  const normalized = { ...keys };
  if (!normalized[version]) normalized[version] = base64(crypto.getRandomValues(new Uint8Array(32)));
  return {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify(normalized),
    DATA_ENCRYPTION_ACTIVE_VERSION: String(version),
  };
}

const context = {
  userId: "firebase-uid-1",
  profileIndex: 1,
  resource: "provider-credentials",
  recordKey: "tmdb",
};

test("AES-GCM encrypt/decrypt round trip uses versioned 256-bit key", async () => {
  const env = makeEnv(1);
  const encrypted = await encryptRecord(env, context, "secret-provider-token");
  assert.equal(encrypted.keyVersion, 1);
  assert.equal(encrypted.nonce.byteLength, 12);
  assert.ok(encrypted.ciphertext.byteLength >= 16);
  assert.equal(await decryptRecord(env, context, encrypted), "secret-provider-token");
  const encoded = encodeEncryptedValue(encrypted);
  assert.equal(typeof encoded.ciphertext, "string");
  assert.equal(typeof encoded.nonce, "string");
});

test("AES-GCM additional data prevents cross-user, cross-profile, and cross-record substitution", async () => {
  const env = makeEnv(1);
  const encrypted = await encryptRecord(env, context, "private-token");
  await assert.rejects(() => decryptRecord(env, { ...context, userId: "another-user" }, encrypted));
  await assert.rejects(() => decryptRecord(env, { ...context, profileIndex: 2 }, encrypted));
  await assert.rejects(() => decryptRecord(env, { ...context, recordKey: "other-provider" }, encrypted));
});

test("AES-GCM authentication tag rejects ciphertext tampering", async () => {
  const env = makeEnv(1);
  const encrypted = await encryptRecord(env, context, "private-token");
  const altered = new Uint8Array(encrypted.ciphertext);
  altered[0] ^= 0x01;
  await assert.rejects(() => decryptRecord(env, context, { ...encrypted, ciphertext: altered }));
});

test("key rotation encrypts with the active key and still decrypts retained older versions", async () => {
  const key1 = base64(crypto.getRandomValues(new Uint8Array(32)));
  const key2 = base64(crypto.getRandomValues(new Uint8Array(32)));
  const oldEnv = makeEnv(1, { 1: key1 });
  const oldRecord = await encryptRecord(oldEnv, context, "legacy-encrypted-token");
  const rotatedEnv = makeEnv(2, { 1: key1, 2: key2 });
  const newRecord = await encryptRecord(rotatedEnv, context, "new-encrypted-token");
  assert.equal(oldRecord.keyVersion, 1);
  assert.equal(newRecord.keyVersion, 2);
  assert.equal(await decryptRecord(rotatedEnv, context, oldRecord), "legacy-encrypted-token");
  assert.equal(await decryptRecord(rotatedEnv, context, newRecord), "new-encrypted-token");
});

test("invalid key size and missing historical key version are rejected", async () => {
  const badEnv = {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ 1: base64(new Uint8Array(16)) }),
    DATA_ENCRYPTION_ACTIVE_VERSION: "1",
  };
  await assert.rejects(() => encryptRecord(badEnv, context, "x"), /exactly 32 bytes/i);

  const env = makeEnv(1);
  const encrypted = await encryptRecord(env, context, "x");
  const missingKeyEnv = makeEnv(2);
  await assert.rejects(() => decryptRecord(missingKeyEnv, context, encrypted), /unavailable key version/i);
});
