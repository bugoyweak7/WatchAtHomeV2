export class AccountApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface DeviceRegistrationInput {
  installationId: string;
  clientName: string;
  clientVersion: string;
  platform: string;
  deviceName: string;
}

export interface AccountD1Database {
  prepare(query: string): AccountD1Statement;
}

interface AccountD1Statement {
  bind(...values: unknown[]): AccountD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export function requireAccountDb(env: { DB?: AccountD1Database }): AccountD1Database {
  if (!env.DB) throw new AccountApiError(503, "Account storage is not configured yet.");
  return env.DB;
}

export async function readBoundedJson(
  request: Request,
  maxBytes = 8192,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new AccountApiError(413, "Request body is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new AccountApiError(413, "Request body is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountApiError(400, "A valid JSON request body is required.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AccountApiError(400, "A JSON object is required.");
  }
  return parsed as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new AccountApiError(400, `Invalid ${field}.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new AccountApiError(400, `Invalid ${field}.`);
  }
  return normalized;
}

export async function parseDeviceRegistration(request: Request): Promise<DeviceRegistrationInput> {
  const input = await readBoundedJson(request);
  return {
    installationId: boundedString(input.installationId, "installationId", 128),
    clientName: boundedString(input.clientName, "clientName", 80),
    clientVersion: boundedString(input.clientVersion, "clientVersion", 40),
    platform: boundedString(input.platform, "platform", 40),
    deviceName: boundedString(input.deviceName, "deviceName", 120),
  };
}

export async function ensureActiveAccount(db: AccountD1Database, uid: string): Promise<void> {
  const account = await db.prepare(
    "SELECT status FROM accounts WHERE user_id = ?1"
  ).bind(uid).first<{ status: string }>();
  if (!account) throw new AccountApiError(409, "Account bootstrap is required first.");
  if (account.status !== "active") throw new AccountApiError(403, "This account is not active.");
}

export async function registerDevice(
  db: AccountD1Database,
  uid: string,
  input: DeviceRegistrationInput,
  now = Date.now(),
): Promise<{ registered: true; installationId: string }> {
  await ensureActiveAccount(db, uid);
  const result = await db.prepare(`
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
  `).bind(
    uid, input.installationId, input.clientName, input.clientVersion,
    input.platform, input.deviceName, now,
  ).run();

  if (result.meta.changes === 0) {
    const existing = await db.prepare(
      "SELECT revoked_at FROM registered_devices WHERE user_id = ?1 AND installation_id = ?2"
    ).bind(uid, input.installationId).first<{ revoked_at: number | null }>();
    if (existing?.revoked_at !== null && existing?.revoked_at !== undefined) {
      throw new AccountApiError(409, "This device has been revoked. Register a new installation.");
    }
  }
  return { registered: true, installationId: input.installationId };
}

export async function revokeDevice(
  db: AccountD1Database,
  uid: string,
  installationId: string,
  now = Date.now(),
): Promise<{ revoked: boolean }> {
  await ensureActiveAccount(db, uid);
  const normalized = installationId.trim();
  if (!normalized || normalized.length > 128 || /[\s/]/.test(normalized)) {
    throw new AccountApiError(400, "Invalid installation ID.");
  }
  const result = await db.prepare(`
    UPDATE registered_devices
    SET revoked_at = ?3
    WHERE user_id = ?1 AND installation_id = ?2 AND revoked_at IS NULL
  `).bind(uid, normalized, now).run();
  return { revoked: result.meta.changes > 0 };
}

export async function listDevices(
  db: AccountD1Database,
  uid: string,
): Promise<{ devices: Record<string, unknown>[] }> {
  await ensureActiveAccount(db, uid);
  const result = await db.prepare(`
    SELECT installation_id AS installationId, client_name AS clientName,
      client_version AS clientVersion, platform, device_name AS deviceName,
      created_at AS createdAt, last_seen_at AS lastSeenAt
    FROM registered_devices
    WHERE user_id = ?1 AND revoked_at IS NULL
    ORDER BY last_seen_at DESC
    LIMIT 100
  `).bind(uid).all();
  return { devices: result.results };
}
