import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createPinVerifier } from "../src/pin-verifier.ts";
import {
  PIN_LOCKOUT_DURATION_MS,
  PIN_MAX_FAILED_ATTEMPTS,
  verifyProfilePinWithLockout,
} from "../src/pin-store.ts";

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const env = {
  PIN_PEPPER_KEYS_JSON: JSON.stringify({ 1: base64(crypto.getRandomValues(new Uint8Array(32))) }),
  PIN_PEPPER_ACTIVE_VERSION: "1",
};
const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(schema);
  const db = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() { return sqlite.prepare(query).get(...values) ?? null; },
        async run() {
          const result = sqlite.prepare(query).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    seed(uid, profileIndex = 1) {
      sqlite.prepare("INSERT OR IGNORE INTO accounts(user_id, status, created_at, updated_at) VALUES(?, 'active', 1, 1)").run(uid);
      sqlite.prepare(`INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at)
        VALUES(?, ?, ?, '{}', 1, 1)`).run(uid, profileIndex, `profile-${uid}-${profileIndex}`);
    },
    insertPin(uid, profileIndex, record) {
      sqlite.prepare(`INSERT INTO profile_pin_credentials (
        user_id, profile_index, pin_hash, pin_salt, hash_algorithm,
        hash_parameters_json, failed_attempts, locked_until, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 1)`).run(
        uid, profileIndex, record.pinHash, record.pinSalt,
        record.hashAlgorithm, record.hashParametersJson,
      );
    },
    state(uid, profileIndex) {
      return sqlite.prepare("SELECT failed_attempts AS failedAttempts, locked_until AS lockedUntil FROM profile_pin_credentials WHERE user_id=? AND profile_index=?")
        .get(uid, profileIndex);
    },
    close() { sqlite.close(); },
  };
  return db;
}

test("PIN lockout increments failed attempts and locks after the configured threshold", async () => {
  const db = createD1();
  db.seed("uid-pin");
  db.insertPin("uid-pin", 1, await createPinVerifier(env, "uid-pin", 1, "2468"));
  const start = 100000;
  let result;
  for (let attempt = 1; attempt <= PIN_MAX_FAILED_ATTEMPTS; attempt++) {
    result = await verifyProfilePinWithLockout(db, env, "uid-pin", 1, "0000", start + attempt);
  }
  assert.equal(result.verified, false);
  assert.equal(result.locked, true);
  assert.equal(result.retryAfterMs, PIN_LOCKOUT_DURATION_MS);
  assert.equal(db.state("uid-pin", 1).failedAttempts, PIN_MAX_FAILED_ATTEMPTS);
  db.close();
});

test("PIN cannot be verified during lockout and a valid PIN clears lockout after expiry", async () => {
  const db = createD1();
  db.seed("uid-pin");
  db.insertPin("uid-pin", 1, await createPinVerifier(env, "uid-pin", 1, "2468"));
  const start = 200000;
  for (let attempt = 1; attempt <= PIN_MAX_FAILED_ATTEMPTS; attempt++) {
    await verifyProfilePinWithLockout(db, env, "uid-pin", 1, "0000", start + attempt);
  }
  const lockedAttempt = await verifyProfilePinWithLockout(db, env, "uid-pin", 1, "2468", start + 1000);
  assert.equal(lockedAttempt.verified, false);
  assert.equal(lockedAttempt.locked, true);

  const afterExpiry = start + PIN_MAX_FAILED_ATTEMPTS + PIN_LOCKOUT_DURATION_MS + 10;
  const success = await verifyProfilePinWithLockout(db, env, "uid-pin", 1, "2468", afterExpiry);
  assert.deepEqual(success, { verified: true, locked: false, retryAfterMs: 0 });
  const cleared = db.state("uid-pin", 1);
  assert.equal(cleared.failedAttempts, 0);
  assert.equal(cleared.lockedUntil, null);
  db.close();
});

test("PIN attempts are isolated by UID and profile and missing PIN records fail generically", async () => {
  const db = createD1();
  db.seed("uid-a", 1);
  db.seed("uid-a", 2);
  db.seed("uid-b", 1);
  db.insertPin("uid-a", 1, await createPinVerifier(env, "uid-a", 1, "1357"));
  const missing = await verifyProfilePinWithLockout(db, env, "uid-b", 1, "1357", 5000);
  assert.deepEqual(missing, { verified: false, locked: false, retryAfterMs: 0 });
  const wrongProfile = await verifyProfilePinWithLockout(db, env, "uid-a", 2, "1357", 5000);
  assert.deepEqual(wrongProfile, { verified: false, locked: false, retryAfterMs: 0 });
  assert.equal(db.state("uid-a", 1).failedAttempts, 0);
  db.close();
});

test("failed attempt after cooldown re-applies lockout until the correct PIN is supplied", async () => {
  const db = createD1();
  db.seed("uid-pin");
  db.insertPin("uid-pin", 1, await createPinVerifier(env, "uid-pin", 1, "8642"));
  const start = 300000;
  for (let attempt = 1; attempt <= PIN_MAX_FAILED_ATTEMPTS; attempt++) {
    await verifyProfilePinWithLockout(db, env, "uid-pin", 1, "0000", start + attempt);
  }
  const afterExpiry = start + PIN_MAX_FAILED_ATTEMPTS + PIN_LOCKOUT_DURATION_MS + 10;
  const failedAgain = await verifyProfilePinWithLockout(db, env, "uid-pin", 1, "0000", afterExpiry);
  assert.equal(failedAgain.locked, true);
  assert.equal(failedAgain.retryAfterMs, PIN_LOCKOUT_DURATION_MS);
  db.close();
});
