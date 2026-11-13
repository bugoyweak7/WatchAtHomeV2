import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  // Local SQLite mirrors D1's default foreign-key enforcement.
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schema);
  return db;
}

function seedAccount(db, userId = "uid_test") {
  db.prepare("INSERT INTO accounts(user_id, created_at, updated_at) VALUES(?, ?, ?)").run(userId, 100, 100);
  db.prepare(`INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at)
    VALUES(?, 1, ?, '{}', 100, 100)`).run(userId, `profile-${userId}`);
}

test("draft creates the expected application tables and indexes", () => {
  const db = createDatabase();
  const tables = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n;
  const indexes = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").get().n;
  assert.equal(tables, 18);
  assert.equal(indexes, 9);
  db.close();
});

test("profile rows cannot reference a missing account", () => {
  const db = createDatabase();
  assert.throws(() => db.prepare(`INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at)
    VALUES('missing', 1, 'p', '{}', 1, 1)`).run(), /FOREIGN KEY constraint failed/i);
  db.close();
});

test("JSON payload columns reject invalid JSON", () => {
  const db = createDatabase();
  seedAccount(db);
  assert.throws(() => db.prepare(`INSERT INTO profile_settings(user_id, profile_index, platform, payload_json, updated_at)
    VALUES('uid_test', 1, 'android', '{bad-json', 101)`).run(), /CHECK constraint failed/i);
  db.close();
});

test("profile add-on key is unique within its owner and profile", () => {
  const db = createDatabase();
  seedAccount(db);
  const insert = db.prepare("INSERT INTO profile_addons(user_id, profile_index, manifest_url, updated_at) VALUES(?, 1, ?, 100)");
  insert.run("uid_test", "https://example.test/manifest.json");
  assert.throws(() => insert.run("uid_test", "https://example.test/manifest.json"), /UNIQUE constraint failed/i);
  db.close();
});

test("media-server token fields must be fully populated encrypted tuples", () => {
  const db = createDatabase();
  seedAccount(db);
  assert.throws(() => db.prepare(`INSERT INTO media_servers(
      user_id, profile_index, server_key, provider_id, remote_server_id, remote_user_id,
      metadata_json, token_ciphertext, token_nonce, updated_at
    ) VALUES('uid_test', 1, 'key', 'jellyfin', 'server', 'user', '{}', x'01', x'02', 100)`).run(), /CHECK constraint failed/i);
  db.close();
});

test("account deletion cascades owned rows but retains the retryable deletion job", () => {
  const db = createDatabase();
  seedAccount(db);
  db.prepare("INSERT INTO profile_addons(user_id, profile_index, manifest_url, updated_at) VALUES('uid_test', 1, 'https://example.test/manifest.json', 100)").run();
  db.prepare(`INSERT INTO registered_devices(user_id, installation_id, client_name, client_version, platform, device_name, created_at, last_seen_at)
    VALUES('uid_test', 'install-1', 'WatchAtHome', '1.0', 'android', 'TV', 100, 100)`).run();
  db.prepare(`INSERT INTO device_link_sessions(session_id, device_code_hash, user_code_hash, nonce_hash, status,
    approved_uid, device_name, device_type, expires_at, poll_interval_seconds, created_at)
    VALUES('session-1', 'device-hash', 'user-hash', 'nonce-hash', 'approved', 'uid_test', 'TV', 'android_tv', 500, 5, 100)`).run();
  db.prepare(`INSERT INTO account_deletion_jobs(user_id, status, current_step, created_at, updated_at)
    VALUES('uid_test', 'pending', 'disable_access', 100, 100)`).run();

  db.prepare("DELETE FROM accounts WHERE user_id = 'uid_test'").run();
  assert.equal(db.prepare("SELECT count(*) AS n FROM profile_addons").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM registered_devices").get().n, 0);
  assert.equal(db.prepare("SELECT approved_uid FROM device_link_sessions WHERE session_id='session-1'").get().approved_uid, null);
  assert.equal(db.prepare("SELECT count(*) AS n FROM account_deletion_jobs").get().n, 1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("sync event IDs provide an increasing cursor per appended event", () => {
  const db = createDatabase();
  seedAccount(db);
  const insert = db.prepare(`INSERT INTO sync_events(user_id, profile_index, resource, record_key, operation, created_at)
    VALUES('uid_test', 1, 'library', ?, 'delete', ?)`);
  insert.run("item-1", 100);
  insert.run("item-2", 101);
  const ids = db.prepare("SELECT event_id FROM sync_events WHERE user_id='uid_test' ORDER BY event_id").all().map(row => row.event_id);
  assert.equal(ids.length, 2);
  assert.ok(ids[1] > ids[0]);
  db.close();
});


test("account bootstrap is idempotent and preserves the original registration time", () => {
  const db = createDatabase();
  const insert = db.prepare(`
    INSERT INTO accounts (user_id, status, created_at, updated_at)
    VALUES (?1, 'active', ?2, ?3)
    ON CONFLICT(user_id) DO NOTHING
  `);
  insert.run("uid_bootstrap", 100, 100);
  insert.run("uid_bootstrap", 200, 200);
  const account = db.prepare("SELECT status, created_at FROM accounts WHERE user_id = ?1").get("uid_bootstrap");
  assert.equal(account.status, "active");
  assert.equal(account.created_at, 100);
  db.close();
});

test("device registration is idempotent and device listing is owner-scoped", () => {
  const db = createDatabase();
  seedAccount(db, "uid_a");
  seedAccount(db, "uid_b");
  const upsert = db.prepare(`
    INSERT INTO registered_devices (
      user_id, installation_id, client_name, client_version, platform,
      device_name, created_at, last_seen_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
    ON CONFLICT(user_id, installation_id) DO UPDATE SET
      client_name = excluded.client_name,
      client_version = excluded.client_version,
      platform = excluded.platform,
      device_name = excluded.device_name,
      last_seen_at = excluded.last_seen_at
    WHERE registered_devices.revoked_at IS NULL
  `);
  upsert.run("uid_a", "install-1", "WatchAtHome", "1.0", "android", "Phone", 100);
  upsert.run("uid_a", "install-1", "WatchAtHome", "1.1", "android", "Updated Phone", 200);
  upsert.run("uid_b", "install-1", "WatchAtHome", "1.0", "android", "Other User Phone", 100);
  const rows = db.prepare(`
    SELECT installation_id, device_name FROM registered_devices
    WHERE user_id = ?1 AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 100
  `).all("uid_a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].device_name, "Updated Phone");
  assert.equal(db.prepare("SELECT count(*) AS n FROM registered_devices WHERE user_id='uid_b'").get().n, 1);
  db.close();
});
