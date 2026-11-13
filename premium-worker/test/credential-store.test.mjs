import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  loadMediaServerToken,
  loadProviderCredential,
  saveMediaServer,
  saveProviderCredential,
} from "../src/credential-store.ts";

const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encryptionEnv(active = 1, keys = {}) {
  const ring = { ...keys };
  if (!ring[active]) ring[active] = base64(crypto.getRandomValues(new Uint8Array(32)));
  return {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify(ring),
    DATA_ENCRYPTION_ACTIVE_VERSION: String(active),
  };
}

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
      sqlite.prepare("INSERT INTO accounts(user_id, status, created_at, updated_at) VALUES(?, 'active', 100, 100)").run(uid);
      sqlite.prepare(`INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at)
        VALUES(?, ?, ?, '{}', 100, 100)`).run(uid, profileIndex, `profile-${uid}`);
    },
    providerRow(uid, profileIndex, provider) {
      return sqlite.prepare(`SELECT ciphertext, nonce, key_version AS keyVersion
        FROM provider_credentials WHERE user_id=? AND profile_index=? AND provider=?`)
        .get(uid, profileIndex, provider) ?? null;
    },
    mediaRow(uid, profileIndex, serverKey) {
      return sqlite.prepare(`SELECT metadata_json, token_ciphertext, token_nonce, token_key_version
        FROM media_servers WHERE user_id=? AND profile_index=? AND server_key=?`)
        .get(uid, profileIndex, serverKey) ?? null;
    },
    close() { sqlite.close(); },
  };
  return db;
}

test("provider credentials are encrypted at rest and decrypt only in their owner context", async () => {
  const db = createD1();
  db.seed("uid-a");
  db.seed("uid-b");
  const env = encryptionEnv();
  const plaintext = JSON.stringify({ apiKey: "provider-secret-123" });
  await saveProviderCredential(db, env, "uid-a", 1, "tmdb", plaintext, 1000);

  const raw = db.providerRow("uid-a", 1, "tmdb");
  assert.ok(raw.ciphertext instanceof Uint8Array);
  assert.notEqual(Buffer.from(raw.ciphertext).toString("utf8"), plaintext);
  assert.equal(raw.nonce.byteLength, 12);
  assert.equal(raw.keyVersion, 1);
  assert.equal(await loadProviderCredential(db, env, "uid-a", 1, "tmdb"), plaintext);
  assert.equal(await loadProviderCredential(db, env, "uid-b", 1, "tmdb"), null);
  db.close();
});

test("provider credentials are re-encrypted with the active key while old versions remain readable", async () => {
  const db = createD1();
  db.seed("uid-a");
  const key1 = base64(crypto.getRandomValues(new Uint8Array(32)));
  const key2 = base64(crypto.getRandomValues(new Uint8Array(32)));
  const v1 = encryptionEnv(1, { 1: key1 });
  const v2 = encryptionEnv(2, { 1: key1, 2: key2 });
  await saveProviderCredential(db, v1, "uid-a", 1, "mdblist", '{"apiKey":"old"}', 1000);
  assert.equal(await loadProviderCredential(db, v2, "uid-a", 1, "mdblist"), '{"apiKey":"old"}');
  await saveProviderCredential(db, v2, "uid-a", 1, "mdblist", '{"apiKey":"new"}', 2000);
  assert.equal(db.providerRow("uid-a", 1, "mdblist").keyVersion, 2);
  assert.equal(await loadProviderCredential(db, v2, "uid-a", 1, "mdblist"), '{"apiKey":"new"}');
  db.close();
});

test("media-server access tokens are encrypted separately from safe metadata", async () => {
  const db = createD1();
  db.seed("uid-media");
  const env = encryptionEnv();
  await saveMediaServer(db, env, {
    userId: "uid-media",
    profileIndex: 1,
    serverKey: "jellyfin-main",
    providerId: "jellyfin",
    remoteServerId: "server-1",
    remoteUserId: "remote-user-1",
    metadataJson: '{"name":"Home Jellyfin","baseUrl":"https://media.example.test"}',
    accessToken: "media-access-token-secret",
  }, 1000);
  const raw = db.mediaRow("uid-media", 1, "jellyfin-main");
  assert.equal(raw.metadata_json.includes("media-access-token-secret"), false);
  assert.ok(raw.token_ciphertext instanceof Uint8Array);
  assert.equal(raw.token_nonce.byteLength, 12);
  assert.equal(await loadMediaServerToken(db, env, "uid-media", 1, "jellyfin-main"), "media-access-token-secret");
  db.close();
});

test("media-server metadata rejects token/password/secret fields", async () => {
  const db = createD1();
  db.seed("uid-media");
  const env = encryptionEnv();
  await assert.rejects(() => saveMediaServer(db, env, {
    userId: "uid-media",
    profileIndex: 1,
    serverKey: "server",
    providerId: "jellyfin",
    remoteServerId: "server-1",
    remoteUserId: "remote-user-1",
    metadataJson: '{"accessToken":"must-not-be-stored"}',
    accessToken: "token",
  }), /Sensitive field is not allowed/i);
  db.close();
});
