import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  getAddons, getCollections, getHomeCatalogSettings, getPlugins, putAddons, putCollections, putHomeCatalogSettings, putPlugins,
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


test("collection snapshots reject nested secret fields", async () => {
  const db = createDb();
  db.seed("owner");
  await assert.rejects(
    () => putCollections(db, "owner", 1, req({
      collections_json: [{ id: "watchlist", metadata: { access_token: "must-not-be-stored-here" } }],
    })),
    /contains a sensitive field/,
  );
  db.close();
});


test("home catalog settings round-trip by profile and platform with versioned updates", async () => {
  const db = createDb(); db.seed("owner-a", 1); db.raw.prepare("INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at) VALUES(?, ?, ?, '{}', 100, 100)").run("owner-a", 2, "profile-owner-a-2"); db.seed("owner-b", 1);
  const payload = {
    show_catalog_type: false,
    hide_unreleased_content: true,
    items: [
      { addon_id: "addon-a", type: "movie", catalog_id: "popular", enabled: true, order: 0, custom_title: "My Movies", is_collection: false, collection_id: "", key: "addon-a:movie:popular" },
      { addon_id: "", type: "", catalog_id: "", enabled: false, order: 1, custom_title: "Watch Later", is_collection: true, collection_id: "col-1", key: "collection_col-1" },
    ],
    future_option: { retain: true },
  };
  assert.deepEqual(await getHomeCatalogSettings(db, "owner-a", 1, "home_catalog_shared"), []);
  assert.deepEqual(
    await putHomeCatalogSettings(db, "owner-a", 1, "home_catalog_shared", req({ p_settings_json: payload }), 7000),
    { saved: true },
  );
  const rows = await getHomeCatalogSettings(db, "owner-a", 1, "home_catalog_shared");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].profile_id, 1);
  assert.equal(rows[0].platform, "home_catalog_shared");
  assert.equal(rows[0].updated_at, new Date(7000).toISOString());
  assert.deepEqual(rows[0].settings_json, payload);
  await putHomeCatalogSettings(db, "owner-a", 1, "home_catalog_shared", req({ settings_json: { items: [], show_catalog_type: true } }), 8000);
  assert.deepEqual((await getHomeCatalogSettings(db, "owner-a", 1, "home_catalog_shared"))[0].settings_json, { items: [], show_catalog_type: true });
  assert.deepEqual(await getHomeCatalogSettings(db, "owner-a", 2, "home_catalog_shared"), []);
  assert.deepEqual(await getHomeCatalogSettings(db, "owner-b", 1, "home_catalog_shared"), []);
  assert.deepEqual(await getHomeCatalogSettings(db, "owner-a", 1, "mobile"), []);
  db.close();
});

test("home catalog settings reject malformed payloads, oversized bodies and nested secrets", async () => {
  const db = createDb(); db.seed("owner");
  await assert.rejects(
    () => putHomeCatalogSettings(db, "owner", 1, "home_catalog_shared", req({ settings_json: [] })),
    /must be a JSON object/,
  );
  await assert.rejects(
    () => putHomeCatalogSettings(db, "owner", 1, "home_catalog_shared", req({ settings_json: { items: [{ metadata: { refresh_token: "secret" } }] } })),
    /contains a sensitive field/,
  );
  await assert.rejects(
    () => putHomeCatalogSettings(db, "owner", 1, "bad platform", req({ settings_json: {} })),
    /Invalid home catalog platform/,
  );
  const huge = new Request("https://worker.test/sync", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings_json: { payload: "x".repeat(270 * 1024) } }),
  });
  await assert.rejects(
    () => putHomeCatalogSettings(db, "owner", 1, "home_catalog_shared", huge),
    /too large/,
  );
  db.close();
});


test("library snapshot, delta cursor, upsert and delete preserve sync contract", async () => {
  const db = createDb(); db.seed("library-owner");
  const items = [
    { content_id: "tt123", content_type: "movie", name: "Film", poster_shape: "POSTER", genres: ["Drama"], added_at: 1000, logo: "https://img.example/logo.png" },
    { content_id: "series-1", content_type: "series", name: "Series", poster_shape: "LANDSCAPE", genres: [], added_at: 2000 },
  ];
  assert.deepEqual(await getLibraryDeltaCursor(db, "library-owner", 1), 0);
  assert.deepEqual(await pushLibraryItems(db, "library-owner", 1, req({ items })), { saved: 2 });
  assert.deepEqual(await getLibrarySnapshot(db, "library-owner", 1, 1, 0), [items[0]]);
  assert.deepEqual(await getLibrarySnapshot(db, "library-owner", 1, 1, 1), [items[1]]);
  const cursor = await getLibraryDeltaCursor(db, "library-owner", 1);
  assert.equal(cursor, 2);
  const events = await getLibraryDelta(db, "library-owner", 1, 0, 10);
  assert.equal(events.length, 2);
  assert.equal(events[0].operation, "upsert");
  assert.equal(events[0].content_id, "tt123");
  assert.equal(events[0].logo, "https://img.example/logo.png");

  assert.deepEqual(
    await deleteLibraryItems(db, "library-owner", 1, req({ keys: [{ content_id: "tt123", content_type: "movie" }] })),
    { deleted: 1 },
  );
  assert.deepEqual(await getLibrarySnapshot(db, "library-owner", 1, 10, 0), [items[1]]);
  const nextCursor = await getLibraryDeltaCursor(db, "library-owner", 1);
  const delta = await getLibraryDelta(db, "library-owner", 1, cursor, 10);
  assert.equal(nextCursor, 3);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].operation, "delete");
  assert.deepEqual({ content_id: delta[0].content_id, content_type: delta[0].content_type }, { content_id: "tt123", content_type: "movie" });
  db.close();
});

test("library writes reject duplicate keys, malformed fields and oversized batches", async () => {
  const db = createDb(); db.seed("library-validation");
  const duplicate = [
    { content_id: "tt1", content_type: "movie", name: "One" },
    { content_id: "tt1", content_type: "MOVIE", name: "Duplicate" },
  ];
  await assert.rejects(() => pushLibraryItems(db, "library-validation", 1, req({ items: duplicate })), /Duplicate library item key/);
  await assert.rejects(() => pushLibraryItems(db, "library-validation", 1, req({ items: [{ content_id: "", content_type: "movie" }] })), /Invalid content_id/);
  await assert.rejects(() => pushLibraryItems(db, "library-validation", 1, req({ items: Array.from({ length: 501 }, (_, i) => ({ content_id: String(i), content_type: "movie" })) })), /no more than 500/);
  await assert.rejects(() => deleteLibraryItems(db, "library-validation", 1, req({ keys: [{ content_id: "tt1", content_type: "movie" }, { content_id: "tt1", content_type: "MOVIE" }] })), /Duplicate library item key/);
  assert.deepEqual(parseLibraryPageParams(new URL("https://worker.test/?limit=20&offset=40"), "snapshot"), { limit: 20, offset: 40 });
  assert.deepEqual(parseLibraryPageParams(new URL("https://worker.test/?limit=50&since=9"), "delta"), { limit: 50, since: 9 });
  assert.throws(() => parseLibraryPageParams(new URL("https://worker.test/?limit=501"), "snapshot"), /Invalid library page limit/);
  db.close();
});
