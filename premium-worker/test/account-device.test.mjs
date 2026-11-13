import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  AccountApiError,
  ensureActiveAccount,
  listDevices,
  parseDeviceRegistration,
  registerDevice,
  requireAccountDb,
} from "../src/account-device.ts";

const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");

function createD1Mock() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(schema);
  const db = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          return sqlite.prepare(query).get(...values) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(query).all(...values) };
        },
        async run() {
          const result = sqlite.prepare(query).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    close() {
      sqlite.close();
    },
    seedAccount(uid, status = "active") {
      sqlite.prepare("INSERT INTO accounts(user_id, status, created_at, updated_at) VALUES(?, ?, 100, 100)")
        .run(uid, status);
    },
    seedRevokedDevice(uid, installationId) {
      sqlite.prepare(`INSERT INTO registered_devices (
        user_id, installation_id, client_name, client_version, platform,
        device_name, created_at, last_seen_at, revoked_at
      ) VALUES (?, ?, 'WatchAtHome', '1.0', 'android', 'Revoked Device', 100, 100, 200)`)
        .run(uid, installationId);
    },
  };
  return db;
}

const deviceInput = {
  installationId: "install-001",
  clientName: "WatchAtHome",
  clientVersion: "2.0.0",
  platform: "android_tv",
  deviceName: "Living Room TV",
};

function deviceRequest(input = deviceInput) {
  return new Request("https://worker.test/v1/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

test("missing D1 binding is reported as a service configuration error", () => {
  assert.throws(() => requireAccountDb({}), (error) =>
    error instanceof AccountApiError && error.status === 503
  );
});

test("account ownership check rejects missing and inactive accounts", async () => {
  const db = createD1Mock();
  await assert.rejects(() => ensureActiveAccount(db, "missing"), (error) =>
    error instanceof AccountApiError && error.status === 409
  );
  db.seedAccount("disabled-user", "deletion_pending");
  await assert.rejects(() => ensureActiveAccount(db, "disabled-user"), (error) =>
    error instanceof AccountApiError && error.status === 403
  );
  db.close();
});

test("device registration creates and idempotently updates a device under the supplied UID", async () => {
  const db = createD1Mock();
  db.seedAccount("uid_a");
  db.seedAccount("uid_b");

  const first = await registerDevice(db, "uid_a", deviceInput, 1000);
  const second = await registerDevice(db, "uid_a", { ...deviceInput, deviceName: "Updated TV" }, 2000);

  assert.deepEqual(first, { registered: true, installationId: "install-001" });
  assert.deepEqual(second, { registered: true, installationId: "install-001" });
  const own = await listDevices(db, "uid_a");
  const other = await listDevices(db, "uid_b");
  assert.equal(own.devices.length, 1);
  assert.equal(own.devices[0].deviceName, "Updated TV");
  assert.equal(other.devices.length, 0);
  db.close();
});

test("device registration refuses to reuse a revoked installation ID", async () => {
  const db = createD1Mock();
  db.seedAccount("uid_a");
  db.seedRevokedDevice("uid_a", "install-revoked");
  await assert.rejects(
    () => registerDevice(db, "uid_a", { ...deviceInput, installationId: "install-revoked" }, 3000),
    (error) => error instanceof AccountApiError && error.status === 409
  );
  db.close();
});

test("device request parser rejects malformed JSON, oversized bodies, and invalid fields", async () => {
  await assert.rejects(
    () => parseDeviceRegistration(new Request("https://worker.test/v1/devices", { method: "POST", body: "{" })),
    (error) => error instanceof AccountApiError && error.status === 400
  );
  await assert.rejects(
    () => parseDeviceRegistration(new Request("https://worker.test/v1/devices", {
      method: "POST", body: JSON.stringify({ ...deviceInput, deviceName: "x".repeat(121) })
    })),
    (error) => error instanceof AccountApiError && error.status === 400
  );
  await assert.rejects(
    () => parseDeviceRegistration(new Request("https://worker.test/v1/devices", {
      method: "POST", body: " ".repeat(9000)
    })),
    (error) => error instanceof AccountApiError && error.status === 413
  );
});

test("device request ignores caller-supplied user IDs because ownership is an explicit verified argument", async () => {
  const db = createD1Mock();
  db.seedAccount("verified_uid");
  db.seedAccount("attacker_uid");
  await registerDevice(db, "verified_uid", { ...deviceInput, userId: "attacker_uid" }, 4000);
  assert.equal((await listDevices(db, "verified_uid")).devices.length, 1);
  assert.equal((await listDevices(db, "attacker_uid")).devices.length, 0);
  db.close();
});
