import { AccountApiError, readBoundedJson, type AccountD1Database } from "./account-device";
import { rejectSensitiveJsonKeys } from "./json-security";

const MAX_SYNC_BODY_BYTES = 256 * 1024;
const MAX_SYNC_ROWS = 200;

type OrderedSelection = {
  url: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
};

function parseRows(input: unknown, resource: "addons" | "plugins"): OrderedSelection[] {
  if (!Array.isArray(input) || input.length > MAX_SYNC_ROWS) {
    throw new AccountApiError(400, `${resource} must be an array with no more than ${MAX_SYNC_ROWS} entries.`);
  }
  const rows = input.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AccountApiError(400, `Invalid ${resource} entry at index ${index}.`);
    }
    const row = value as Record<string, unknown>;
    const url = row.url;
    const name = row.name ?? "";
    const enabled = row.enabled ?? true;
    const sortOrder = row.sort_order ?? row.sortOrder ?? index;
    if (typeof url !== "string" || url.length > 2048 || !/^https?:\/\//i.test(url) || /\s/.test(url)) {
      throw new AccountApiError(400, `Invalid ${resource} URL at index ${index}.`);
    }
    if (typeof name !== "string" || name.length > 160) {
      throw new AccountApiError(400, `Invalid ${resource} name at index ${index}.`);
    }
    if (typeof enabled !== "boolean") {
      throw new AccountApiError(400, `Invalid ${resource} enabled flag at index ${index}.`);
    }
    if (!Number.isSafeInteger(sortOrder) || Number(sortOrder) < 0 || Number(sortOrder) > 100000) {
      throw new AccountApiError(400, `Invalid ${resource} sort order at index ${index}.`);
    }
    return { url, name: name.trim(), enabled, sortOrder: Number(sortOrder) };
  });
  if (new Set(rows.map(row => row.url)).size !== rows.length) {
    throw new AccountApiError(400, `Duplicate ${resource} URL.`);
  }
  return rows;
}

async function replaceSelections(
  db: AccountD1Database,
  uid: string,
  profileIndex: number,
  resource: "addons" | "plugins",
  rows: OrderedSelection[],
  now = Date.now(),
): Promise<{ saved: number }> {
  const table = resource === "addons" ? "profile_addons" : "profile_plugins";
  const serializedRows = JSON.stringify(rows.map(row => ({
    url: row.url, name: row.name, enabled: row.enabled ? 1 : 0, sort_order: row.sortOrder,
  })));

  // One JSON-backed insert/upsert and one stale-row deletion avoid oversized
  // dynamic SQL placeholder lists and preserve whole-snapshot replacement semantics.
  await db.prepare(`
    INSERT INTO ${table}
      (user_id, profile_index, manifest_url, name, enabled, sort_order, updated_at)
    SELECT ?1, ?2,
      json_extract(value, '$.url'),
      json_extract(value, '$.name'),
      json_extract(value, '$.enabled'),
      json_extract(value, '$.sort_order'),
      ?4
    FROM json_each(?3)
    WHERE true
    ON CONFLICT(user_id, profile_index, manifest_url) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `).bind(uid, profileIndex, serializedRows, now).run();

  await db.prepare(`
    DELETE FROM ${table}
    WHERE user_id = ?1 AND profile_index = ?2
      AND NOT EXISTS (
        SELECT 1 FROM json_each(?3) AS incoming
        WHERE json_extract(incoming.value, '$.url') = ${table}.manifest_url
      )
  `).bind(uid, profileIndex, serializedRows).run();
  return { saved: rows.length };
}

async function listSelections(
  db: AccountD1Database, uid: string, profileIndex: number, resource: "addons" | "plugins",
): Promise<Record<string, unknown>[]> {
  const table = resource === "addons" ? "profile_addons" : "profile_plugins";
  const result = await db.prepare(`
    SELECT manifest_url AS url, name, enabled, sort_order
    FROM ${table}
    WHERE user_id = ?1 AND profile_index = ?2
    ORDER BY sort_order ASC, manifest_url ASC
  `).bind(uid, profileIndex).all<Record<string, unknown>>();
  return result.results.map(row => ({
    url: row.url,
    name: row.name,
    enabled: Number(row.enabled) === 1,
    sort_order: Number(row.sort_order),
  }));
}

export async function getAddons(db: AccountD1Database, uid: string, profileIndex: number) {
  return listSelections(db, uid, profileIndex, "addons");
}

export async function putAddons(db: AccountD1Database, uid: string, profileIndex: number, request: Request) {
  const body = await readBoundedJson(request, MAX_SYNC_BODY_BYTES);
  return replaceSelections(db, uid, profileIndex, "addons", parseRows(body.addons ?? body.p_addons, "addons"));
}

export async function getPlugins(db: AccountD1Database, uid: string, profileIndex: number) {
  return listSelections(db, uid, profileIndex, "plugins");
}

export async function putPlugins(db: AccountD1Database, uid: string, profileIndex: number, request: Request) {
  const body = await readBoundedJson(request, MAX_SYNC_BODY_BYTES);
  return replaceSelections(db, uid, profileIndex, "plugins", parseRows(body.plugins ?? body.p_plugins, "plugins"));
}

export async function getCollections(db: AccountD1Database, uid: string, profileIndex: number) {
  const row = await db.prepare(`
    SELECT collections_json, updated_at FROM collections
    WHERE user_id = ?1 AND profile_index = ?2
  `).bind(uid, profileIndex).first<{ collections_json: string; updated_at: number }>();
  if (!row) return [];
  return [{
    profile_id: profileIndex,
    collections_json: JSON.parse(row.collections_json),
    updated_at: new Date(Number(row.updated_at)).toISOString(),
  }];
}

export async function putCollections(db: AccountD1Database, uid: string, profileIndex: number, request: Request, now = Date.now()) {
  const body = await readBoundedJson(request, MAX_SYNC_BODY_BYTES);
  const collections = body.collections_json ?? body.collectionsJson ?? body.p_collections_json ?? [];
  if (!Array.isArray(collections)) {
    throw new AccountApiError(400, "collections_json must be a JSON array.");
  }
  rejectSensitiveJsonKeys(collections, "Collections");
  const encoded = JSON.stringify(collections);
  await db.prepare(`
    INSERT INTO collections (user_id, profile_index, collections_json, version, updated_at)
    VALUES (?1, ?2, ?3, 1, ?4)
    ON CONFLICT(user_id, profile_index) DO UPDATE SET
      collections_json = excluded.collections_json,
      version = collections.version + 1,
      updated_at = excluded.updated_at
  `).bind(uid, profileIndex, encoded, now).run();
  return { saved: true };
}
