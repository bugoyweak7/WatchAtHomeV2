import { AccountApiError, readBoundedJson, type AccountD1Database } from "./account-device";

const MAX_LIBRARY_BODY_BYTES = 256 * 1024;
const MAX_LIBRARY_ROWS = 500;
const MAX_ID_LENGTH = 512;

type LibraryKey = { content_id: string; content_type: string };
type LibraryRecord = LibraryKey & Record<string, unknown>;

function boundedText(value: unknown, field: string, max = MAX_ID_LENGTH): string {
  if (typeof value !== "string") throw new AccountApiError(400, `Invalid ${field}.`);
  const text = value.trim();
  if (!text || text.length > max) throw new AccountApiError(400, `Invalid ${field}.`);
  return text;
}

function parseKey(value: unknown): LibraryKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountApiError(400, "Invalid library key.");
  }
  const row = value as Record<string, unknown>;
  return {
    content_id: boundedText(row.content_id ?? row.contentId, "content_id"),
    content_type: boundedText(row.content_type ?? row.contentType, "content_type", 40).toLowerCase(),
  };
}

function itemKey(key: LibraryKey): string {
  return `${key.content_type}:${key.content_id}`;
}

function parseItems(input: unknown): LibraryRecord[] {
  if (!Array.isArray(input) || input.length > MAX_LIBRARY_ROWS) {
    throw new AccountApiError(400, `items must be an array with no more than ${MAX_LIBRARY_ROWS} entries.`);
  }
  const allowed = new Set([
    "content_id", "content_type", "name", "poster", "poster_shape", "background",
    "logo", "description", "release_info", "imdb_rating", "genres", "addon_base_url", "added_at",
  ]);
  const rows = input.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AccountApiError(400, `Invalid library item at index ${index}.`);
    }
    const source = value as Record<string, unknown>;
    const key = parseKey(source);
    const row: LibraryRecord = { ...key };
    for (const [field, fieldValue] of Object.entries(source)) {
      const normalized = field === "contentId" ? "content_id" : field === "contentType" ? "content_type" : field;
      if (!allowed.has(normalized)) continue;
      if (normalized === "content_id" || normalized === "content_type") continue;
      row[normalized] = fieldValue;
    }
    if (typeof (row.name ?? "") !== "string" || String(row.name ?? "").length > 500) {
      throw new AccountApiError(400, `Invalid library item name at index ${index}.`);
    }
    const genres = row.genres ?? [];\n    if (!Array.isArray(genres) || genres.some((v: unknown) => typeof v !== "string" || v.length > 100)) {
      throw new AccountApiError(400, `Invalid library genres at index ${index}.`);
    }
    if (!Number.isSafeInteger(row.added_at ?? 0) || Number(row.added_at ?? 0) < 0) {
      throw new AccountApiError(400, `Invalid library added_at at index ${index}.`);
    }
    for (const field of ["poster", "poster_shape", "background", "logo", "description", "release_info", "addon_base_url"]) {
      if (row[field] != null && (typeof row[field] !== "string" || String(row[field]).length > 8192)) {
        throw new AccountApiError(400, `Invalid library ${field} at index ${index}.`);
      }
    }
    if (row.imdb_rating != null && (typeof row.imdb_rating !== "number" || !Number.isFinite(row.imdb_rating))) {
      throw new AccountApiError(400, `Invalid library imdb_rating at index ${index}.`);
    }
    return row;
  });
  if (new Set(rows.map(itemKey)).size !== rows.length) throw new AccountApiError(400, "Duplicate library item key.");
  return rows;
}

export async function getLibrarySnapshot(
  db: AccountD1Database, uid: string, profileIndex: number, limit: number, offset: number,
) {
  const rows = await db.prepare(`
    SELECT payload_json AS payload FROM library_items
    WHERE user_id = ?1 AND profile_index = ?2 AND deleted_at IS NULL
    ORDER BY item_key ASC LIMIT ?3 OFFSET ?4
  `).bind(uid, profileIndex, limit, offset).all<{ payload: string }>();
  return rows.results.map(row => JSON.parse(row.payload));
}

export async function getLibraryDeltaCursor(db: AccountD1Database, uid: string, profileIndex: number) {
  const row = await db.prepare(`
    SELECT COALESCE(MAX(event_id), 0) AS cursor FROM sync_events
    WHERE user_id = ?1 AND profile_index = ?2 AND resource = 'library'
  `).bind(uid, profileIndex).first<{ cursor: number }>();
  return Number(row?.cursor ?? 0);
}

export async function getLibraryDelta(
  db: AccountD1Database, uid: string, profileIndex: number, since: number, limit: number,
) {
  const rows = await db.prepare(`
    SELECT event_id, operation, payload_json
    FROM sync_events
    WHERE user_id = ?1 AND profile_index = ?2 AND resource = 'library' AND event_id > ?3
    ORDER BY event_id ASC LIMIT ?4
  `).bind(uid, profileIndex, since, limit).all<{ event_id: number; operation: string; payload_json: string | null }>();
  return rows.results.map(row => {
    const payload = row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : {};
    return { event_id: Number(row.event_id), operation: row.operation, ...payload };
  });
}

export async function pushLibraryItems(
  db: AccountD1Database, uid: string, profileIndex: number, request: Request, originClientId: string | null = null, now = Date.now(),
) {
  const body = await readBoundedJson(request, MAX_LIBRARY_BODY_BYTES);
  const items = parseItems(body.items ?? body.p_items);
  for (const item of items) {
    const key = itemKey(item);
    const encoded = JSON.stringify(item);
    await db.prepare(`
      INSERT INTO library_items
        (user_id, profile_index, item_key, content_id, content_type, payload_json, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)
      ON CONFLICT(user_id, profile_index, item_key) DO UPDATE SET
        content_id = excluded.content_id, content_type = excluded.content_type,
        payload_json = excluded.payload_json, updated_at = excluded.updated_at, deleted_at = NULL
    `).bind(uid, profileIndex, key, item.content_id, item.content_type, encoded, now).run();
    await db.prepare(`
      INSERT INTO sync_events
        (user_id, profile_index, resource, record_key, operation, payload_json, origin_client_id, created_at)
      VALUES (?1, ?2, 'library', ?3, 'upsert', ?4, ?5, ?6)
    `).bind(uid, profileIndex, key, encoded, originClientId, now).run();
  }
  return { saved: items.length };
}

export async function deleteLibraryItems(
  db: AccountD1Database, uid: string, profileIndex: number, request: Request, originClientId: string | null = null, now = Date.now(),
) {
  const body = await readBoundedJson(request, MAX_LIBRARY_BODY_BYTES);
  const input = body.keys ?? body.p_keys;
  if (!Array.isArray(input) || input.length > MAX_LIBRARY_ROWS) {
    throw new AccountApiError(400, `keys must be an array with no more than ${MAX_LIBRARY_ROWS} entries.`);
  }
  const keys = input.map(parseKey);
  if (new Set(keys.map(itemKey)).size !== keys.length) throw new AccountApiError(400, "Duplicate library item key.");
  let deleted = 0;
  for (const key of keys) {
    const normalized = itemKey(key);
    const result = await db.prepare(`
      UPDATE library_items SET deleted_at = ?4, updated_at = ?4
      WHERE user_id = ?1 AND profile_index = ?2 AND item_key = ?3 AND deleted_at IS NULL
    `).bind(uid, profileIndex, normalized, now).run();
    if (result.meta.changes === 0) continue;
    deleted++;
    await db.prepare(`
      INSERT INTO sync_events
        (user_id, profile_index, resource, record_key, operation, payload_json, origin_client_id, created_at)
      VALUES (?1, ?2, 'library', ?3, 'delete', ?4, ?5, ?6)
    `).bind(uid, profileIndex, normalized, JSON.stringify(key), originClientId, now).run();
  }
  return { deleted };
}

export function parseLibraryPageParams(url: URL, mode: "snapshot" | "delta") {
  const limitRaw = Number(url.searchParams.get("limit") ?? 500);
  if (!Number.isSafeInteger(limitRaw) || limitRaw < 1 || limitRaw > MAX_LIBRARY_ROWS) {
    throw new AccountApiError(400, "Invalid library page limit.");
  }
  if (mode === "snapshot") {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
      throw new AccountApiError(400, "Invalid library page offset.");
    }
    return { limit: limitRaw, offset };
  }
  const since = Number(url.searchParams.get("since") ?? 0);
  if (!Number.isSafeInteger(since) || since < 0) throw new AccountApiError(400, "Invalid library delta cursor.");
  return { limit: limitRaw, since };
}
