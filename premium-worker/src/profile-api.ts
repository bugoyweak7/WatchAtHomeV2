import { AccountApiError, readBoundedJson, type AccountD1Database } from "./account-device";
import { rejectSensitiveJsonKeys } from "./json-security";

const MAX_PROFILES = 6;
const MAX_PROFILE_BODY_BYTES = 64 * 1024;
const MAX_SETTINGS_BODY_BYTES = 128 * 1024;

export interface ProfilePayload {
  profileIndex: number;
  name: string;
  avatarColorHex: string;
  usesPrimaryAddons: boolean;
  usesPrimaryPlugins: boolean;
  avatarId: string | null;
  avatarUrl: string | null;
  profileBackgroundId: string | null;
  profileBackgroundUrl: string | null;
}

function optionalText(value: unknown, max: number, field: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new AccountApiError(400, `Invalid ${field}.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if ((field.endsWith("Url")) && (!/^https?:\/\//i.test(normalized) || /\s/.test(normalized))) {
    throw new AccountApiError(400, `Invalid ${field}.`);
  }
  return normalized;
}

function parseProfile(value: unknown): ProfilePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountApiError(400, "Each profile must be a JSON object.");
  }
  const item = value as Record<string, unknown>;
  const profileIndex = Number(item.profile_index ?? item.profileIndex);
  const name = item.name;
  const color = item.avatar_color_hex ?? item.avatarColorHex;
  const usesPrimaryAddons = item.uses_primary_addons ?? item.usesPrimaryAddons ?? false;
  const usesPrimaryPlugins = item.uses_primary_plugins ?? item.usesPrimaryPlugins ?? false;
  if (!Number.isSafeInteger(profileIndex) || profileIndex < 1 || profileIndex > MAX_PROFILES) {
    throw new AccountApiError(400, "Profile index is outside the supported range.");
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    throw new AccountApiError(400, "Invalid profile name.");
  }
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new AccountApiError(400, "Invalid profile avatar color.");
  }
  if (typeof usesPrimaryAddons !== "boolean" || typeof usesPrimaryPlugins !== "boolean") {
    throw new AccountApiError(400, "Invalid profile flags.");
  }
  return {
    profileIndex,
    name: name.trim(),
    avatarColorHex: color.toUpperCase(),
    usesPrimaryAddons,
    usesPrimaryPlugins,
    avatarId: optionalText(item.avatar_id ?? item.avatarId, 160, "avatarId"),
    avatarUrl: optionalText(item.avatar_url ?? item.avatarUrl, 2048, "avatarUrl"),
    profileBackgroundId: optionalText(item.profile_background_id ?? item.profileBackgroundId, 160, "profileBackgroundId"),
    profileBackgroundUrl: optionalText(item.profile_background_url ?? item.profileBackgroundUrl, 2048, "profileBackgroundUrl"),
  };
}

function toStoredPayload(profile: ProfilePayload): string {
  return JSON.stringify({
    name: profile.name,
    avatar_color_hex: profile.avatarColorHex,
    uses_primary_addons: profile.usesPrimaryAddons,
    uses_primary_plugins: profile.usesPrimaryPlugins,
    avatar_id: profile.avatarId,
    avatar_url: profile.avatarUrl,
    profile_background_id: profile.profileBackgroundId,
    profile_background_url: profile.profileBackgroundUrl,
  });
}

export async function listProfiles(db: AccountD1Database, uid: string): Promise<Record<string, unknown>[]> {
  const rows = await db.prepare(`
    SELECT p.profile_id AS id, p.user_id AS user_id, p.profile_index AS profile_index,
      p.payload_json AS payload_json, p.created_at AS created_at, p.updated_at AS updated_at,
      CASE WHEN pin.user_id IS NULL THEN 0 ELSE 1 END AS pin_enabled,
      pin.locked_until AS pin_locked_until
    FROM profiles p
    LEFT JOIN profile_pin_credentials pin
      ON pin.user_id = p.user_id AND pin.profile_index = p.profile_index
    WHERE p.user_id = ?1
    ORDER BY p.profile_index ASC
  `).bind(uid).all<Record<string, unknown>>();
  return rows.results.map(row => ({
      id: row.id,
      user_id: row.user_id,
      profile_index: Number(row.profile_index),
      ...JSON.parse(String(row.payload_json)),
      pin_enabled: Number(row.pin_enabled) === 1,
      pin_locked_until: row.pin_locked_until == null ? null : new Date(Number(row.pin_locked_until)).toISOString(),
      created_at: new Date(Number(row.created_at)).toISOString(),
      updated_at: new Date(Number(row.updated_at)).toISOString(),
    }));
}

export async function upsertProfiles(
  db: AccountD1Database,
  uid: string,
  request: Request,
  now = Date.now(),
): Promise<{ saved: number }> {
  const input = await readBoundedJson(request, MAX_PROFILE_BODY_BYTES);
  const raw = input.profiles;
  if (!Array.isArray(raw) || raw.length > MAX_PROFILES) {
    throw new AccountApiError(400, "Profiles must be an array containing no more than 6 entries.");
  }
  const profiles = raw.map(parseProfile);
  const indices = new Set(profiles.map(profile => profile.profileIndex));
  if (indices.size !== profiles.length) throw new AccountApiError(400, "Duplicate profile index.");
  if (profiles.length === 0) return { saved: 0 };

  const values: unknown[] = [];
  const tuples = profiles.map(profile => {
    const offset = values.length;
    values.push(uid, profile.profileIndex, crypto.randomUUID(), toStoredPayload(profile), now, now);
    return `(?${offset + 1}, ?${offset + 2}, ?${offset + 3}, ?${offset + 4}, ?${offset + 5}, ?${offset + 6})`;
  });
  await db.prepare(`
    INSERT INTO profiles (user_id, profile_index, profile_id, payload_json, created_at, updated_at)
    VALUES ${tuples.join(", ")}
    ON CONFLICT(user_id, profile_index) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(...values).run();
  return { saved: profiles.length };
}

export async function deleteProfile(db: AccountD1Database, uid: string, profileIndex: number): Promise<{ deleted: boolean }> {
  if (!Number.isSafeInteger(profileIndex) || profileIndex < 1 || profileIndex > MAX_PROFILES) {
    throw new AccountApiError(404, "Profile not found.");
  }
  const result = await db.prepare("DELETE FROM profiles WHERE user_id = ?1 AND profile_index = ?2")
    .bind(uid, profileIndex).run();
  return { deleted: result.meta.changes > 0 };
}

export async function listProfileLocks(db: AccountD1Database, uid: string): Promise<Record<string, unknown>[]> {
  const rows = await db.prepare(`
    SELECT p.profile_index AS profile_id,
      CASE WHEN pin.user_id IS NULL THEN 0 ELSE 1 END AS pin_enabled,
      pin.locked_until AS pin_locked_until
    FROM profiles p
    LEFT JOIN profile_pin_credentials pin
      ON pin.user_id = p.user_id AND pin.profile_index = p.profile_index
    WHERE p.user_id = ?1
    ORDER BY p.profile_index ASC
  `).bind(uid).all<Record<string, unknown>>();
  return rows.results.map(row => ({
    profile_id: Number(row.profile_id),
    pin_enabled: Number(row.pin_enabled) === 1,
    pin_locked_until: row.pin_locked_until == null ? null : new Date(Number(row.pin_locked_until)).toISOString(),
  }));
}

export async function getProfileSettings(
  db: AccountD1Database, uid: string, profileIndex: number, platform: string,
): Promise<Record<string, unknown>[]> {
  const row = await db.prepare(`
    SELECT payload_json, updated_at FROM profile_settings
    WHERE user_id = ?1 AND profile_index = ?2 AND platform = ?3
  `).bind(uid, profileIndex, platform).first<{ payload_json: string; updated_at: number }>();
  if (!row) return [];
  const settingsJson = JSON.parse(row.payload_json);
  return [{
    profile_id: profileIndex,
    platform,
    settings_json: settingsJson,
    updated_at: new Date(Number(row.updated_at)).toISOString(),
  }];
}

export async function putProfileSettings(
  db: AccountD1Database, uid: string, profileIndex: number, platform: string, request: Request, now = Date.now(),
): Promise<{ saved: true }> {
  if (!/^[a-z0-9_-]{1,40}$/.test(platform)) throw new AccountApiError(400, "Invalid settings platform.");
  const input = await readBoundedJson(request, MAX_SETTINGS_BODY_BYTES);
  const settings = input.settings_json ?? input.settingsJson;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new AccountApiError(400, "settings_json must be a JSON object.");
  }
  rejectSensitiveJsonKeys(settings, "Profile settings");
  const encoded = JSON.stringify(settings);
  await db.prepare(`
    INSERT INTO profile_settings (user_id, profile_index, platform, payload_json, schema_version, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(user_id, profile_index, platform) DO UPDATE SET
      payload_json = excluded.payload_json,
      schema_version = excluded.schema_version,
      updated_at = excluded.updated_at
  `).bind(uid, profileIndex, platform, encoded, Number.isSafeInteger((settings as Record<string, unknown>).version) ? Number((settings as Record<string, unknown>).version) : 1, now).run();
  return { saved: true };
}
