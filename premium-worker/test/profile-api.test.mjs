import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  deleteProfile, getProfileSettings, listProfileLocks, listProfiles, putProfileSettings, upsertProfiles,
} from "../src/profile-api.ts";

const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(schema);
  return {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() { return sqlite.prepare(query).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(query).all(...values) }; },
        async run() {
          const result = sqlite.prepare(query).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    seed(uid) {
      sqlite.prepare("INSERT INTO accounts(user_id, status, created_at, updated_at) VALUES(?, 'active', 100, 100)").run(uid);
    },
    raw: sqlite,
    close() { sqlite.close(); },
  };
}

function profile(index, name = "Profile " + index) {
  return {
    profile_index: index,
    name,
    avatar_color_hex: "#1E88E5",
    uses_primary_addons: false,
    uses_primary_plugins: true,
    avatar_id: "avatar-" + index,
    avatar_url: null,
    profile_background_id: null,
    profile_background_url: null,
  };
}

function request(body) {
  return new Request("https://worker.test/v1/profiles", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("profile upsert is bounded, stable-ID, and owner-scoped", async () => {
  const db = createDb();
  db.seed("user-a");
  db.seed("user-b");
  assert.deepEqual(await upsertProfiles(db, "user-a", request({ profiles: [profile(1), profile(3)] }), 1000), { saved: 2 });
  const first = (await listProfiles(db, "user-a"));
  assert.equal(first.length, 2);
  assert.equal(first[0].profile_index, 1);
  assert.equal(first[0].user_id, "user-a");
  assert.equal(first[0].uses_primary_plugins, true);
  const id = first[0].id;

  await upsertProfiles(db, "user-a", request({ profiles: [profile(1, "Renamed")] }), 2000);
  const updated = (await listProfiles(db, "user-a"));
  assert.equal(updated.length, 2);
  assert.equal(updated[0].id, id);
  assert.equal(updated[0].name, "Renamed");
  assert.equal((await listProfiles(db, "user-b")).length, 0);
  db.close();
});

test("profile payload rejects duplicate indexes, invalid fields, and more than six profiles", async () => {
  const db = createDb();
  db.seed("user-a");
  await assert.rejects(() => upsertProfiles(db, "user-a", request({ profiles: [profile(1), profile(1)] })), /Duplicate profile index/);
  await assert.rejects(() => upsertProfiles(db, "user-a", request({ profiles: Array.from({ length: 7 }, (_, i) => profile(i + 1)) })), /no more than 6/);
  await assert.rejects(() => upsertProfiles(db, "user-a", request({ profiles: [profile(7)] })), /outside the supported range/);
  db.close();
});

test("profile deletion cascades dependent settings and PIN data only for the owner", async () => {
  const db = createDb();
  db.seed("user-a");
  db.seed("user-b");
  await upsertProfiles(db, "user-a", request({ profiles: [profile(1)] }));
  await upsertProfiles(db, "user-b", request({ profiles: [profile(1)] }));
  await putProfileSettings(db, "user-a", 1, "mobile", new Request("https://worker.test/settings", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings_json: { version: 4 } }),
  }));
  assert.deepEqual(await deleteProfile(db, "user-a", 1), { deleted: true });
  assert.equal((await listProfiles(db, "user-a")).length, 0);
  assert.equal((await listProfiles(db, "user-b")).length, 1);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM profile_settings WHERE user_id='user-a'").get().n, 0);
  db.close();
});

test("profile settings round-trip preserves unknown nested JSON fields", async () => {
  const db = createDb();
  db.seed("user-a");
  await upsertProfiles(db, "user-a", request({ profiles: [profile(1)] }));
  const payload = {
    version: 4,
    features: {
      theme_settings: { selected: "dark", future_option: { enabled: true } },
      future_feature: { untouched: [1, 2, 3] },
    },
  };
  const put = new Request("https://worker.test/settings", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings_json: payload }),
  });
  assert.deepEqual(await putProfileSettings(db, "user-a", 1, "mobile", put, 5000), { saved: true });
  const result = await getProfileSettings(db, "user-a", 1, "mobile");
  assert.deepEqual(result[0].settings_json, payload);
  assert.equal(result[0].profile_id, 1);
  assert.equal(result[0].updated_at, new Date(5000).toISOString());
  assert.deepEqual(await getProfileSettings(db, "user-a", 1, "tv"), []);
  db.close();
});

test("profile locks reflect only configured PIN records", async () => {
  const db = createDb();
  db.seed("user-a");
  await upsertProfiles(db, "user-a", request({ profiles: [profile(1), profile(2)] }));
  db.raw.prepare(`INSERT INTO profile_pin_credentials(user_id, profile_index, pin_hash, pin_salt, hash_algorithm, hash_parameters_json, locked_until, updated_at)
    VALUES('user-a', 2, ?, ?, 'hmac-sha256', '{}', 9000, 100)`).run(Buffer.alloc(32), Buffer.alloc(16));
  const locks = await listProfileLocks(db, "user-a");
  assert.deepEqual(locks.map(x => x.pin_enabled), [false, true]);
  assert.equal(locks[1].pin_locked_until, new Date(9000).toISOString());
  db.close();
});

test("settings payload must be a JSON object and platform must be bounded", async () => {
  const db = createDb();
  db.seed("user-a");
  await upsertProfiles(db, "user-a", request({ profiles: [profile(1)] }));
  const invalid = new Request("https://worker.test/settings", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings_json: [] }),
  });
  await assert.rejects(() => putProfileSettings(db, "user-a", 1, "mobile", invalid), /must be a JSON object/);
  const valid = new Request("https://worker.test/settings", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings_json: {} }),
  });
  await assert.rejects(() => putProfileSettings(db, "user-a", 1, "../invalid", valid), /Invalid settings platform/);
  db.close();
});
