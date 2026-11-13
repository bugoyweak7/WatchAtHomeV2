import { AccountApiError, readBoundedJson, type AccountD1Database } from "./account-device";

const MAX_WATCHED_BODY_BYTES = 256 * 1024;
const MAX_WATCHED_ROWS = 500;
const MAX_ID_LENGTH = 512;

type WatchedKey = { content_id: string; season: number | null; episode: number | null };
type WatchedRecord = WatchedKey & { content_type: string; title: string; watched_at: number };

function boundedText(value: unknown, field: string, max = MAX_ID_LENGTH): string {
  if (typeof value !== "string") throw new AccountApiError(400, `Invalid ${field}.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new AccountApiError(400, `Invalid ${field}.`);
  return normalized;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new AccountApiError(400, `Invalid ${field}.`);
  return Number(value);
}

function itemKey(key: WatchedKey): string {
  return JSON.stringify([key.content_id, key.season, key.episode]);
}

function parseKey(value: unknown): WatchedKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccountApiError(400, "Invalid watched item key.");
  const row = value as Record<string, unknown>;
  const season = optionalNumber(row.season, "season");
  const episode = optionalNumber(row.episode, "episode");
  if ((season == null) !== (episode == null)) throw new AccountApiError(400, "Season and episode must both be set or both be null.");
  return {
    content_id: boundedText(row.content_id ?? row.contentId, "content_id"),
    season,
    episode,
  };
}

function parseItems(input: unknown): WatchedRecord[] {
  if (!Array.isArray(input) || input.length > MAX_WATCHED_ROWS) {
    throw new AccountApiError(400, `items must be an array with no more than ${MAX_WATCHED_ROWS} entries.`);
  }
  const items = input.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AccountApiError(400, `Invalid watched item at index ${index}.`);
    }
    const row = value as Record<string, unknown>;
    const key = parseKey(row);
    const watchedAt = row.watched_at ?? row.watchedAt ?? 0;
    if (!Number.isSafeInteger(watchedAt) || Number(watchedAt) < 0) {
      throw new AccountApiError(400, `Invalid watched_at at index ${index}.`);
    }
    return {
      ...key,
      content_type: boundedText(row.content_type ?? row.contentType, "content_type", 40).toLowerCase(),
      title: typeof (row.title ?? "") === "string" ? String(row.title ?? "").slice(0, 500) : "",
      watched_at: Number(watchedAt),
    };
  });
  if (new Set(items.map(itemKey)).size !== items.length) throw new AccountApiError(400, "Duplicate watched item key.");
  return items;
}

export function parseWatchedPageParams(url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? MAX_WATCHED_ROWS);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_WATCHED_ROWS) throw new AccountApiError(400, "Invalid watched items page limit.");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new AccountApiError(400, "Invalid watched items page offset.");
  return { limit, offset };
}

export async function getWatchedSnapshot(db: AccountD1Database, uid: string, profile: number, limit: number, offset: number) {
  const rows = await db.prepare(`
    SELECT payload_json AS payload FROM watched_items
    WHERE user_id = ?1 AND profile_index = ?2 AND deleted_at IS NULL
    ORDER BY watched_at ASC, item_key ASC LIMIT ?3 OFFSET ?4
  `).bind(uid, profile, limit, offset).all<{ payload: string }>();
  return rows.results.map(row => JSON.parse(row.payload));
}

export async function getWatchedDeltaCursor(db: AccountD1Database, uid: string, profile: number) {
  const row = await db.prepare(`
    SELECT COALESCE(MAX(event_id), 0) AS cursor FROM sync_events
    WHERE user_id = ?1 AND profile_index = ?2 AND resource = 'watched_items'
  `).bind(uid, profile).first<{ cursor: number }>();
  return Number(row?.cursor ?? 0);
}

export async function getWatchedDelta(db: AccountD1Database, uid: string, profile: number, since: number, limit: number) {
  const rows = await db.prepare(`
    SELECT event_id, operation, payload_json FROM sync_events
    WHERE user_id = ?1 AND profile_index = ?2 AND resource = 'watched_items' AND event_id > ?3
    ORDER BY event_id ASC LIMIT ?4
  `).bind(uid, profile, since, limit).all<{ event_id: number; operation: string; payload_json: string | null }>();
  return rows.results.map(row => ({
    event_id: Number(row.event_id),
    operation: row.operation,
    ...(row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : {}),
  }));
}

export async function pushWatchedItems(db: AccountD1Database, uid: string, profile: number, request: Request, now = Date.now()) {
  const body = await readBoundedJson(request, MAX_WATCHED_BODY_BYTES);
  const origin = body.p_origin_client_id == null ? null : boundedText(body.p_origin_client_id, "origin client ID", 96);
  const items = parseItems(body.items ?? body.p_items);
  for (const item of items) {
    const key = itemKey(item);
    const payload = JSON.stringify(item);
    await db.prepare(`
      INSERT INTO watched_items
        (user_id, profile_index, item_key, content_id, content_type, season_number, episode_number, watched_at, payload_json, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)
      ON CONFLICT(user_id, profile_index, item_key) DO UPDATE SET
        content_id = excluded.content_id, content_type = excluded.content_type,
        season_number = excluded.season_number, episode_number = excluded.episode_number,
        watched_at = excluded.watched_at, payload_json = excluded.payload_json,
        updated_at = excluded.updated_at, deleted_at = NULL
    `).bind(uid, profile, key, item.content_id, item.content_type, item.season, item.episode, item.watched_at, payload, now).run();
    await db.prepare(`
      INSERT INTO sync_events (user_id, profile_index, resource, record_key, operation, payload_json, origin_client_id, created_at)
      VALUES (?1, ?2, 'watched_items', ?3, 'upsert', ?4, ?5, ?6)
    `).bind(uid, profile, key, payload, origin, now).run();
  }
  return { saved: items.length };
}

export async function deleteWatchedItems(db: AccountD1Database, uid: string, profile: number, request: Request, now = Date.now()) {
  const body = await readBoundedJson(request, MAX_WATCHED_BODY_BYTES);
  const origin = body.p_origin_client_id == null ? null : boundedText(body.p_origin_client_id, "origin client ID", 96);
  const input = body.keys ?? body.p_keys;
  if (!Array.isArray(input) || input.length > MAX_WATCHED_ROWS) {
    throw new AccountApiError(400, `keys must be an array with no more than ${MAX_WATCHED_ROWS} entries.`);
  }
  const keys = input.map(parseKey);
  if (new Set(keys.map(itemKey)).size !== keys.length) throw new AccountApiError(400, "Duplicate watched item key.");
  let deleted = 0;
  for (const key of keys) {
    const normalized = itemKey(key);
    const existing = await db.prepare(`
      SELECT payload_json AS payload FROM watched_items
      WHERE user_id = ?1 AND profile_index = ?2 AND item_key = ?3 AND deleted_at IS NULL
    `).bind(uid, profile, normalized).first<{ payload: string }>();
    if (!existing) continue;
    const result = await db.prepare(`
      UPDATE watched_items SET deleted_at = ?4, updated_at = ?4
      WHERE user_id = ?1 AND profile_index = ?2 AND item_key = ?3 AND deleted_at IS NULL
    `).bind(uid, profile, normalized, now).run();
    if (result.meta.changes === 0) continue;
    deleted++;
    await db.prepare(`
      INSERT INTO sync_events (user_id, profile_index, resource, record_key, operation, payload_json, origin_client_id, created_at)
      VALUES (?1, ?2, 'watched_items', ?3, 'delete', ?4, ?5, ?6)
    `).bind(uid, profile, normalized, existing.payload, origin, now).run();
  }
  return { deleted };
}
