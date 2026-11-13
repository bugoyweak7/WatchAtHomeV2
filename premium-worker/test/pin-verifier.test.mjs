import assert from "node:assert/strict";
import { test } from "node:test";
import { createPinVerifier, verifyPin } from "../src/pin-verifier.ts";

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pepperEnv(active = 1, keys = {}) {
  const ring = { ...keys };
  if (!ring[active]) ring[active] = base64(crypto.getRandomValues(new Uint8Array(32)));
  return {
    PIN_PEPPER_KEYS_JSON: JSON.stringify(ring),
    PIN_PEPPER_ACTIVE_VERSION: String(active),
  };
}

test("PIN verifier stores only salted keyed digest metadata, never the PIN", async () => {
  const env = pepperEnv();
  const pin = "1234";
  const record = await createPinVerifier(env, "uid-pin", 1, pin);
  assert.equal(record.hashAlgorithm, "HMAC-SHA256-PEPPERED-PIN-V1");
  assert.equal(record.pinHash.byteLength, 32);
  assert.equal(record.pinSalt.byteLength, 16);
  assert.equal(record.hashParametersJson, '{"pepperVersion":1}');
  assert.equal(JSON.stringify(record).includes(pin), false);
  assert.equal(await verifyPin(env, "uid-pin", 1, pin, record), true);
  assert.equal(await verifyPin(env, "uid-pin", 1, "9999", record), false);
});

test("PIN verifier is bound to the owning Firebase UID and profile", async () => {
  const env = pepperEnv();
  const record = await createPinVerifier(env, "uid-a", 1, "2468");
  assert.equal(await verifyPin(env, "uid-b", 1, "2468", record), false);
  assert.equal(await verifyPin(env, "uid-a", 2, "2468", record), false);
});

test("pepper rotation preserves verification of old PIN records", async () => {
  const pepper1 = base64(crypto.getRandomValues(new Uint8Array(32)));
  const pepper2 = base64(crypto.getRandomValues(new Uint8Array(32)));
  const oldEnv = pepperEnv(1, { 1: pepper1 });
  const oldRecord = await createPinVerifier(oldEnv, "uid-a", 1, "1357");
  const rotatedEnv = pepperEnv(2, { 1: pepper1, 2: pepper2 });
  const newRecord = await createPinVerifier(rotatedEnv, "uid-a", 1, "1357");
  assert.equal(JSON.parse(oldRecord.hashParametersJson).pepperVersion, 1);
  assert.equal(JSON.parse(newRecord.hashParametersJson).pepperVersion, 2);
  assert.equal(await verifyPin(rotatedEnv, "uid-a", 1, "1357", oldRecord), true);
  assert.equal(await verifyPin(rotatedEnv, "uid-a", 1, "1357", newRecord), true);
});

test("invalid PIN lengths and missing historical pepper versions are rejected", async () => {
  const env = pepperEnv();
  await assert.rejects(() => createPinVerifier(env, "uid-a", 1, "123"), /4 and 64/i);
  await assert.rejects(() => createPinVerifier(env, "uid-a", 1, "x".repeat(65)), /4 and 64/i);
  const record = await createPinVerifier(env, "uid-a", 1, "1234");
  const noOldPepper = pepperEnv(2);
  await assert.rejects(() => verifyPin(noOldPepper, "uid-a", 1, "1234", record), /pepper version is unavailable/i);
});
