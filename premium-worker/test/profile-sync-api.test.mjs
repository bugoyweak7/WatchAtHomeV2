import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  getAddons, getCollections, getPlugins, putAddons, putCollections, putPlugins,
} from "../src/profile-sync-api.ts";

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
    seed(uid, profileIndex = 1) {
      sqlite.prepare("INSERT INTO accounts(user_id, status, created_at, updated_at) VALUES(?, 'active', 100, 100)").run(uid);
      sqlite.prepare("INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at) VALUES(?, ?, ?, '{}', 100, 100)").run(uid, profileIndex, "profile-" + uid);
    },
    raw: sqlite,
    close() { sqlite.close(); },
  };
}

function req(body) {
  return new Request("https://worker.test/sync", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const addon = (url, sort_order, extra = {}) => ({ url, name: "Addon " + sort_order, enabled: true, sort_order, ...extra });
const plugin = (url, sort_order, extra = {}) => ({ url, name: "Plugin " + sort_order, enabled: true, sort_order, ...extra });

test("add-on snapshot upserts, orders, and removes stale selections", async () => {
  const db = createDb(); db.seed("owner-a"); db.seed("owner-b");
  const a = "https://addons.example/a/manifest.json";
  const b = "https://addons.example/b/manifest.json";
  assert.deepEqual(await putAddons(db, "owner-a", 1, req({ addons: [addon(a, 1), addon(b, 0, { enabled: false })] })), { saved: 2 });
  assert.deepEqual((await getAddons(db, "owner-a", 1)).map(x => x.url), [b, a]);
  await putAddons(db, "owner-a", 1, req({ p_addons: [addon(a, 0, { name: "Renamed" })] }));
  const rows = await getAddons(db, "owner-a", 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Renamed");
  assert.deepEqual(await getAddons(db, "owner-b", 1), []);
  db.close();
});

test("empty add-on snapshot clears only that profile's installed selections", async () => {
  const db = createDb(); db.seed("owner-a", 1);
  db.raw.prepare("INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at) VALUES('owner-a', 2, 'p2', '{}', 100, 100)").run();
  await putAddons(db, "owner-a", 1, req({ addons: [addon("https://a.example/manifest.json", 0)] }));
  await putAddons(db, "owner-a", 2, req({ addons: [addon("https://b.example/manifest.json", 0)] }));
  assert.deepEqual(await putAddons(db, "owner-a", 1, req({ addons: [] })), { saved: 0 });
  assert.deepEqual(await getAddons(db, "owner-a", 1), []);
  assert.equal((await getAddons(db, "owner-a", 2)).length, 1);
  db.close();
});

test("plugin snapshots preserve row fields and remove repositories no longer selected", async () => {
  const db = createDb(); db.seed("plugin-owner");
  const a = "https://plugins.example/a/manifest.json";
  const b = "https://plugins.example/b/manifest.json";
  await putPlugins(db, "plugin-owner", 1, req({ plugins: [plugin(a, 0), plugin(b, 1, { enabled: false })] }));
  const rows = await getPlugins(db, "plugin-owner", 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].enabled, false);
  await putPlugins(db, "plugin-owner", 1, req({ p_plugins: [plugin(b, 0)] }));
  assert.deepEqual((await getPlugins(db, "plugin-owner", 1)).map(x => x.url), [b]);
  db.close();
});

test("add-on and plugin payloads reject duplicate URLs and invalid fields", async () => {
  const db = createDb(); db.seed("owner");
  const duplicate = "https://same.example/manifest.json";
  await assert.rejects(() => putAddons(db, "owner", 1, req({ addons: [addon(duplicate, 0), addon(duplicate, 1)] })), /Duplicate addons URL/);
  await assert.rejects(() => putPlugins(db, "owner", 1, req({ plugins: [plugin("javascript:alert(1)", 0)] })), /Invalid plugins URL/);
  await assert.rejects(() => putAddons(db, "owner", 1, req({ addons: [addon("https://a.example/manifest.json", -1)] })), /Invalid addons sort order/);
  db.close();
});

test("selection payloads enforce bounded item counts", async () => {
  const db = createDb(); db.seed("owner");
  const rows = Array.from({ length: 201 }, (_, i) => addon("https://addons.example/" + i + "/manifest.json", i));
  await assert.rejects(() => putAddons(db, "owner", 1, req({ addons: rows })), /no more than 200/);
  db.close();
});

test("collection blob round-trips full JSON and unknown nested properties", async () => {
  const db = createDb(); db.seed("owner");
  const payload = [
    { id: "movies", title: "Movies", futureFlag: { keep: true }, folders: [{ id: "f1", title: "New", unknown: [1, 2] }] },
  ];
  assert.deepEqual(await getCollections(db, "owner", 1), []);
  assert.deepEqual(await putCollections(db, "owner", 1, req({ p_collections_json: payload }), 5000), { saved: true });
  const rows = await getCollections(db, "owner", 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].profile_id, 1);
  assert.deepEqual(rows[0].collections_json, payload);
  assert.equal(rows[0].updated_at, new Date(5000).toISOString());
  db.close();
});

test("collection empty array replaces prior snapshot and profiles remain isolated", async () => {
  const db = createDb(); db.seed("owner-a", 1); db.seed("owner-b", 1);
  await putCollections(db, "owner-a", 1, req({ collections_json: [{ id: "one" }] }));
  await putCollections(db, "owner-b", 1, req({ collections_json: [{ id: "two" }] }));
  await putCollections(db, "owner-a", 1, req({ collections_json: [] }));
  assert.deepEqual((await getCollections(db, "owner-a", 1))[0].collections_json, []);
  assert.deepEqual((await getCollections(db, "owner-b", 1))[0].collections_json, [{ id: "two" }]);
  db.close();
});

test("collections must be a JSON array", async () => {
  const db = createDb(); db.seed("owner");
  await assert.rejects(() => putCollections(db, "owner", 1, req({ collections_json: { not: "array" } })), /must be a JSON array/);
  db.close();
});
