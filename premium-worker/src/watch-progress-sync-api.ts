import { AccountApiError, readBoundedJson, type AccountD1Database } from "./account-device";

const MAX_PROGRESS_BODY_BYTES = 256 * 1024;
const MAX_PROGRESS_ROWS = 500;
const MAX_KEY_LENGTH = 512;

type ProgressRecord = {
  content_id: string;
  content_type: string;
  video_id: string;
  season: number | null;
  episode: number | null;
  position: number;
  duration: number;
  last_watched: number;
  progress_key: string;
};

function text(value: unknown, field: string, max = MAX_KEY_LENGTH): string {
  if (typeof value !== "string") throw new AccountApiError(400, `Invalid ${field}.`);
  const result = value.trim();
  if (!result || result.length > max) throw new AccountApiError(400, `Invalid ${field}.`);
  return result;
}

function integer(value: unknown, field: string, nullable = false): number | null {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new AccountApiError(400, `Invalid ${field}.`);
  return Number(value);
}

function parseProgress(value: unknown): ProgressRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccountApiError(400, "Invalid progress entry.");
  const row = value as Record<string, unknown>;
  const contentId = text(row.content_id ?? row.contentId, "content_id");
  const contentType = text(row.content_type ?? row.contentType, "content_type", 40).toLowerCase();
  const season = integer(row.season, "season", true);
  const episode = integer(row.episode, "episode", true);
  const progressKey = text(row.progress_key ?? row.progressKey, "progress_key");
  if ((season == null) !== (episode == null)) throw new AccountApiError(400, "Season and episode must both be set or both be null.");
  if (progressKey.length > MAX_KEY_LENGTH) throw new AccountApiError(400, "Invalid progress_key.");
  return {
    content_id: contentId,
    content_type: contentType,
    video_id: text(row.video_id ?? row.videoId, "video_id"),
    season,
    episode,
    position: integer(row.position, "position")!,
    duration: integer(row.duration, "duration")!,
    last_watched: integer(row.last_watched ?? row.lastWatched, "last_watched")!,
    progress_key: progressKey,
  };
}

function parsePage(url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 500);
  const sinceLastWatchedRaw = url.searchParams.get("sinceLastWatched");
  const sinceLastWatched = sinceLastWatchedRaw == null ? null : Number(sinceLastWatchedRaw);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PROGRESS_ROWS) throw new AccountApiError(400, "Invalid progress page limit.");
  if (sinceLastWatched != null && (!Number.isSafeInteger(sinceLastWatched) || sinceLastWatched < 0)) {
    throw new AccountApiError(400, "Invalid progress timestamp cursor.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw new AccountApiError(400, "Invalid progress page offset.");
  }
  return { limit, sinceLastWatched, offset };
}

export async function getProgressSnapshot(
  db: AccountD1Database, uid: string, profile: number, sinceLastWatched: number | null, limit: number, offset = 0,
) {
  const rows = await db.prepare(`
    SELECT payload_json AS payload FROM watch_progress
    WHERE user_id = ?1 AND profile_index = ?2 AND deleted_at IS NULL
      AND (?3 IS NULL OR last_watched_at > ?3)
    ORDER BY last_watched_at ASC, progress_key ASC LIMIT ?4 OFFSET ?5
  `).bind(uid, profile, sinceLastWatched, limit, offset).all<{ payload: string }>();
  return rows.results.map(row => JSON.parse(row.payload));
}

export async function getProgressCursor(db: AccountD1Database, uid: string, profile: number) {
  const row = await db.prepare(`
    SELECT COALESCE(MAX(event_id), 0) AS cursor FROM sync_events
    WHERE user_id = ?1 AND profile_index = ?2 AND resource = 'watch_progress'
  `).bind(uid, profile).first<{ cursor: number }>();
  return Number(row?.cursor ?? 0);
}

export async function getProgressDelta(db: AccountD1Database, uid: string, profile: number, since: number, limit: number) {
  const rows = await db.prepare(`
    SELECT event_id, operation, payload_json, record_key
    FROM sync_events
    WHERE user_id = ?1 AND profile_index = ?2 AND resource = 'watch_progress' AND event_id > ?3
    ORDER BY event_id ASC LIMIT ?4
  `).bind(uid, profile, since, limit).all<{ event_id: number; operation: string; payload_json: string | null; record_key: string }>();
  return rows.results.map(row => {
    const payload = row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : {};
    return { event_id: Number(row.event_id), operation: row.operation, progress_key: row.record_key, ...payload };
  });
}

export async function pushProgress(
  db: AccountD1Database, uid: string, profile: number, request: Request, now = Date.now(),
) {
  const body = await readBoundedJson(request, MAX_PROGRESS_BODY_BYTES);
  const origin = body.p_origin_client_id == null ? null : text(body.p_origin_client_id, "origin client ID", 96);
  const input = body.entries ?? body.p_entries;
  if (!Array.isArray(input) || input.length > MAX_PROGRESS_ROWS) throw new AccountApiError(400, `entries must be an array with no more than ${MAX_PROGRESS_ROWS} entries.`);
  const entries = input.map(parseProgress);
  if (new Set(entries.map(x => x.progress_key)).size !== entries.length) throw new AccountApiError(400, "Duplicate progress key.");
  for (const entry of entries) {
    const payload = JSON.stringify(entry);
    await db.prepare(`
      INSERT INTO watch_progress
        (user_id, profile_index, progress_key, content_id, content_type, video_id, payload_json, last_watched_at, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)
      ON CONFLICT(user_id, profile_index, progress_key) DO UPDATE SET
        content_id = excluded.content_id, content_type = excluded.content_type,
        video_id = excluded.video_id, payload_json = excluded.payload_json,
        last_watched_at = excluded.last_watched_at, updated_at = excluded.updated_at, deleted_at = NULL
    `).bind(uid, profile, entry.progress_key, entry.content_id, entry.content_type, entry.video_id, payload, entry.last_watched, now).run();
    await db.prepare(`
      INSERT INTO sync_events (user_id, profile_index, resource, record_key, operation, payload_json, origin_client_id, created_at)
      VALUES (?1, ?2, 'watch_progress', ?3, 'upsert', ?4, ?5, ?6)
    `).bind(uid, profile, entry.progress_key, payload, origin, now).run();
  }
  return { saved: entries.length };
}

export async function deleteProgress(
  db: AccountD1Database, uid: string, profile: number, request: Request, now = Date.now(),
) {
  const body = await readBoundedJson(request, MAX_PROGRESS_BODY_BYTES);
  const origin = body.p_origin_client_id == null ? null : text(body.p_origin_client_id, "origin client ID", 96);
  const keys = body.keys ?? body.p_keys;
  if (!Array.isArray(keys) || keys.length > MAX_PROGRESS_ROWS) throw new AccountApiError(400, `keys must be an array with no more than ${MAX_PROGRESS_ROWS} entries.`);
  const normalized = keys.map(key => text(key, "progress key"));
  if (new Set(normalized).size !== normalized.length) throw new AccountApiError(400, "Duplicate progress key.");
  let deleted = 0;
  for (const key of normalized) {
    const result = await db.prepare(`
      UPDATE watch_progress SET deleted_at = ?4, updated_at = ?4
      WHERE user_id = ?1 AND profile_index = ?2 AND progress_key = ?3 AND deleted_at IS NULL
    `).bind(uid, profile, key, now).run();
    if (result.meta.changes === 0) continue;
    deleted++;
    await db.prepare(`
      INSERT INTO sync_events (user_id, profile_index, resource, record_key, operation, payload_json, origin_client_id, created_at)
      VALUES (?1, ?2, 'watch_progress', ?3, 'delete', NULL, ?4, ?5)
    `).bind(uid, profile, key, origin, now).run();
  }
  return { deleted };
}
