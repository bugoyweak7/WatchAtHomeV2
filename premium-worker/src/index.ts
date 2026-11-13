import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  DB?: D1Database;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface VerifiedUser {
  uid: string;
  email?: string;
}

const FIREBASE_SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    },
  });
}

function getServiceAccount(env: Env): ServiceAccount {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Missing service account secret.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  if (
    account.project_id !== env.FIREBASE_PROJECT_ID ||
    !account.client_email ||
    !account.private_key
  ) throw new Error("Service account configuration does not match Firebase project.");
  return account;
}

async function verifyUser(request: Request, env: Env): Promise<VerifiedUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new HttpError(401, "Sign in is required.");

  const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    audience: env.FIREBASE_PROJECT_ID,
  });
  const firebaseClaims = payload.firebase as Record<string, unknown> | undefined;
  if (
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.auth_time !== "number" ||
    payload.auth_time > Math.floor(Date.now() / 1000) + 60 ||
    firebaseClaims?.sign_in_provider !== "password"
  ) {
    throw new HttpError(401, "A registered email/password account is required.");
  }
  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}

async function serviceToken(env: Env): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }

  const account = getServiceAccount(env);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: FIREBASE_SCOPE,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri || TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const tokenResponse = await fetch(account.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Google service authentication failed.");
  const token = await tokenResponse.json() as { access_token: string; expires_in: number };
  cachedAccessToken = {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  return token.access_token;
}

function firestoreRoot(env: Env): string {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

async function firestoreRequest(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await serviceToken(env);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(`${firestoreRoot(env)}/${path}`, { ...init, headers });
}

async function readDocument(env: Env, path: string, transaction?: string): Promise<Record<string, unknown> | null> {
  const suffix = transaction ? `?transaction=${encodeURIComponent(transaction)}` : "";
  const result = await firestoreRequest(env, path + suffix);
  if (result.status === 404) return null;
  if (!result.ok) throw new Error(`Firestore read failed (${result.status}).`);
  return await result.json() as Record<string, unknown>;
}

function fieldsOf(document: Record<string, unknown> | null): Record<string, any> {
  return (document?.fields ?? {}) as Record<string, any>;
}

function stringField(fields: Record<string, any>, name: string): string {
  return fields[name]?.stringValue ?? "";
}

function numberField(fields: Record<string, any>, name: string): number {
  return Number(fields[name]?.integerValue ?? fields[name]?.doubleValue ?? 0);
}

function boolField(fields: Record<string, any>, name: string): boolean {
  return fields[name]?.booleanValue === true;
}

function timestampField(fields: Record<string, any>, name: string): number {
  const value = fields[name]?.timestampValue;
  return typeof value === "string" ? Date.parse(value) : 0;
}

function encodeFields(values: Record<string, string | number | boolean | null>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null) fields[key] = { nullValue: null };
    else if (typeof value === "string") fields[key] = { stringValue: value };
    else if (typeof value === "boolean") fields[key] = { booleanValue: value };
    else fields[key] = { integerValue: String(value) };
  }
  return fields;
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `WAH-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toUpperCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(env: Env, user: VerifiedUser): Promise<void> {
  const doc = await readDocument(env, `admins/${user.uid}`);
  const fields = fieldsOf(doc);
  if (!doc || stringField(fields, "role") !== "admin" || !boolField(fields, "active")) {
    throw new HttpError(403, "Active administrator access is required.");
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function createCodes(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  await requireAdmin(env, user);
  const input = await request.json() as { count?: number; durationDays?: number; durationMinutes?: number; durationLabel?: string };
  const count = Math.min(50, Math.max(1, Math.floor(Number(input.count ?? 1))));
  const durationMinutes = Math.min(525600, Math.max(0, Math.floor(Number(input.durationMinutes ?? 0))));
  const durationDays = durationMinutes > 0 ? 0 : Math.min(3650, Math.max(1, Math.floor(Number(input.durationDays ?? 30))));
  const durationLabel = String(input.durationLabel ?? (durationMinutes > 0 ? `${durationMinutes} Minutes` : durationDays === 30 ? "Monthly" : `${durationDays} Days`)).slice(0, 40);
  const codes: string[] = [];
  const writes: unknown[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const code = randomCode();
    const codeHash = await hashCode(code);
    codes.push(code);
    writes.push({
      update: {
        name: `${firestoreRoot(env)}/premium_codes/${codeHash}`,
        fields: {
          ...encodeFields({
            code,
            durationLabel,
            durationDays,
            durationMinutes,
            status: "AVAILABLE",
            createdBy: user.uid,
            createdAt: new Date(now).toISOString(),
            activatedBy: null,
            activatedAt: null,
            expiresAt: null,
          }),
          createdAt: { timestampValue: new Date(now).toISOString() },
          activationDeadline: { timestampValue: new Date(now + 24 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString() },
        },
      },
      currentDocument: { exists: false },
    });
  }

  const commit = await firestoreRequest(env, ":commit", {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
  if (!commit.ok) throw new Error(`Could not save premium codes (${commit.status}).`);
  return response({ codes, durationDays, durationMinutes, durationLabel, activationWindowMinutes: 1455 });
}

async function redeemCode(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  const input = await request.json() as { code?: string };
  const code = String(input.code ?? "").trim().toUpperCase();
  if (!/^WAH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
    throw new HttpError(400, "Enter a valid premium code.");
  }

  const codeHash = await hashCode(code);
  const transactionResponse = await firestoreRequest(env, ":beginTransaction", {
    method: "POST",
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!transactionResponse.ok) throw new Error("Could not start premium activation.");
  const transaction = await transactionResponse.json() as { transaction: string };

  const codeDoc = await readDocument(env, `premium_codes/${codeHash}`, transaction.transaction);
  if (!codeDoc) throw new HttpError(404, "Premium code not found.");
  const codeFields = fieldsOf(codeDoc);
  const now = Date.now();

  if (stringField(codeFields, "status") !== "AVAILABLE") throw new HttpError(409, "This premium code has already been used or disabled.");
  const activationDeadline = timestampField(codeFields, "activationDeadline");
  if (activationDeadline && now > activationDeadline) {
    throw new HttpError(410, "This premium code has expired.");
  }

  const userDoc = await readDocument(env, `users/${user.uid}`, transaction.transaction);
  const userFields = fieldsOf(userDoc);
  const currentExpiry = timestampField(userFields, "premiumExpiresAt");
  const startAt = Math.max(now, currentExpiry);
  const durationDays = numberField(codeFields, "durationDays");
  const durationMinutes = numberField(codeFields, "durationMinutes");
  const durationMillis = durationMinutes > 0 ? durationMinutes * 60 * 1000 : Math.max(1, durationDays) * 24 * 60 * 60 * 1000;
  const expiresAt = startAt + durationMillis;

  const writes = [
    {
      update: {
        name: `${firestoreRoot(env)}/premium_codes/${codeHash}`,
        fields: {
          ...codeFields,
          status: { stringValue: "REDEEMED" },
          activatedBy: { stringValue: user.uid },
          activatedAt: { timestampValue: new Date(now).toISOString() },
          expiresAt: { timestampValue: new Date(expiresAt).toISOString() },
        },
      },
      currentDocument: { updateTime: codeDoc.updateTime },
    },
    {
      update: {
        name: `${firestoreRoot(env)}/users/${user.uid}`,
        fields: {
          ...userFields,
          premium: { booleanValue: true },
          membershipTier: { stringValue: "SUPPORTER_PLUS" },
          premiumExpiresAt: { timestampValue: new Date(expiresAt).toISOString() },
          premiumExpiresAtEpochMs: { integerValue: String(expiresAt) },
          premiumUpdatedAt: { timestampValue: new Date(now).toISOString() },
        },
      },
      ...(userDoc?.updateTime
        ? { currentDocument: { updateTime: userDoc.updateTime } }
        : { currentDocument: { exists: false } }),
    },
  ];

  const commit = await firestoreRequest(env, ":commit", {
    method: "POST",
    body: JSON.stringify({ transaction: transaction.transaction, writes }),
  });
  if (!commit.ok) {
    if (commit.status === 409 || commit.status === 400) {
      throw new HttpError(409, "This code was just redeemed elsewhere. Please check your premium status.");
    }
    throw new Error(`Premium activation failed (${commit.status}).`);
  }

  return response({ success: true, premium: true, expiresAt: new Date(expiresAt).toISOString() });
}

async function firebaseAccountCreatedAt(
  request: Request,
  env: Env,
  expectedUid: string,
): Promise<number> {
  if (!env.FIREBASE_WEB_API_KEY) {
    throw new HttpError(503, "Trial registration verification is not configured.");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new HttpError(401, "Sign in is required.");
  const lookup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: match[1] }),
    },
  );
  if (!lookup.ok) throw new HttpError(401, "Could not verify account registration.");
  const payload = await lookup.json() as {
    users?: Array<{ localId?: string; createdAt?: string }>;
  };
  const account = payload.users?.[0];
  const createdAt = Number(account?.createdAt);
  if (account?.localId !== expectedUid || !Number.isFinite(createdAt) || createdAt <= 0) {
    throw new HttpError(401, "Firebase account registration could not be verified.");
  }
  return createdAt;
}

async function initializeTrial(env: Env, user: VerifiedUser, registeredAt: number): Promise<Response> {
  const path = `users/${user.uid}`;
  const existing = await readDocument(env, path);
  const fields = fieldsOf(existing);
  let startedAt = timestampField(fields, "trialStartedAt");
  let expiresAt = timestampField(fields, "trialExpiresAt");

  // The app calls this immediately after successful account creation.
  // Create-only write makes the seven-day window immutable on retries.
  if (!startedAt || !expiresAt) {
    startedAt = registeredAt;
    expiresAt = registeredAt + 7 * 24 * 60 * 60 * 1000;
    const write = await firestoreRequest(env, ":commit", {
      method: "POST",
      body: JSON.stringify({
        writes: [{
          update: {
            name: `${firestoreRoot(env)}/${path}`,
            fields: {
              ...fields,
              trialStartedAt: { timestampValue: new Date(startedAt).toISOString() },
              trialExpiresAt: { timestampValue: new Date(expiresAt).toISOString() },
            },
          },
          ...(existing?.updateTime
            ? { currentDocument: { updateTime: existing.updateTime } }
            : { currentDocument: { exists: false } }),
        }],
      }),
    });
    if (!write.ok && write.status !== 409) {
      throw new Error(`Trial initialization failed (${write.status}).`);
    }
    const latest = await readDocument(env, path);
    const latestFields = fieldsOf(latest);
    startedAt = timestampField(latestFields, "trialStartedAt");
    expiresAt = timestampField(latestFields, "trialExpiresAt");
    if (!(startedAt > 0 && expiresAt > startedAt)) {
      throw new Error("Trial initialization could not be confirmed.");
    }
  }

  return response({
    initialized: startedAt > 0 && expiresAt > 0,
    trialStartedAt: startedAt ? new Date(startedAt).toISOString() : null,
    trialExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  });
}

function requireD1(env: Env): D1Database {
  if (!env.DB) throw new HttpError(503, "Account storage is not configured yet.");
  return env.DB;
}

async function readBoundedJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new HttpError(413, "Request body is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, "Request body is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "A valid JSON request body is required.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "A JSON object is required.");
  }
  return parsed as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new HttpError(400, `Invalid ${field}.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new HttpError(400, `Invalid ${field}.`);
  }
  return normalized;
}

async function ensureActiveAccount(db: D1Database, uid: string): Promise<void> {
  const account = await db.prepare(
    "SELECT status FROM accounts WHERE user_id = ?1"
  ).bind(uid).first<{ status: string }>();
  if (!account) throw new HttpError(409, "Account bootstrap is required first.");
  if (account.status !== "active") throw new HttpError(403, "This account is not active.");
}

async function bootstrapAccount(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireD1(env);
  const registeredAt = await firebaseAccountCreatedAt(request, env, user.uid);
  const now = Date.now();
  await db.prepare(`
    INSERT INTO accounts (user_id, status, created_at, updated_at)
    VALUES (?1, 'active', ?2, ?3)
    ON CONFLICT(user_id) DO NOTHING
  `).bind(user.uid, registeredAt, now).run();

  await ensureActiveAccount(db, user.uid);
  // Trial initialization remains create-only in Firestore and is safe to retry.
  const trial = await initializeTrial(env, user, registeredAt);
  return response({ accountReady: true, trial: await trial.json() });
}

async function registerDevice(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireD1(env);
  await ensureActiveAccount(db, user.uid);
  const input = await readBoundedJson(request);
  const installationId = boundedString(input.installationId, "installationId", 128);
  const clientName = boundedString(input.clientName, "clientName", 80);
  const clientVersion = boundedString(input.clientVersion, "clientVersion", 40);
  const platform = boundedString(input.platform, "platform", 40);
  const deviceName = boundedString(input.deviceName, "deviceName", 120);
  const now = Date.now();

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
  `).bind(user.uid, installationId, clientName, clientVersion, platform, deviceName, now).run();

  if (result.meta.changes === 0) {
    const existing = await db.prepare(
      "SELECT revoked_at FROM registered_devices WHERE user_id = ?1 AND installation_id = ?2"
    ).bind(user.uid, installationId).first<{ revoked_at: number | null }>();
    if (existing?.revoked_at !== null && existing?.revoked_at !== undefined) {
      throw new HttpError(409, "This device has been revoked. Register a new installation.");
    }
  }
  return response({ registered: true, installationId });
}

async function listDevices(env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireD1(env);
  await ensureActiveAccount(db, user.uid);
  const result = await db.prepare(`
    SELECT installation_id AS installationId, client_name AS clientName,
      client_version AS clientVersion, platform, device_name AS deviceName,
      created_at AS createdAt, last_seen_at AS lastSeenAt
    FROM registered_devices
    WHERE user_id = ?1 AND revoked_at IS NULL
    ORDER BY last_seen_at DESC
    LIMIT 100
  `).bind(user.uid).all();
  return response({ devices: result.results });
}

async function revokeDevice(request: Request, env: Env, user: VerifiedUser, installationId: string): Promise<Response> {
  const db = requireD1(env);
  await ensureActiveAccount(db, user.uid);
  const result = await db.prepare(`
    UPDATE registered_devices SET revoked_at = ?1
    WHERE user_id = ?2 AND installation_id = ?3 AND revoked_at IS NULL
  `).bind(Date.now(), user.uid, installationId).run();
  if (result.meta.changes === 0) throw new HttpError(404, "Active device not found.");
  return response({ revoked: true });
}

async function premiumStatus(env: Env, user: VerifiedUser): Promise<Response> {
  const doc = await readDocument(env, `users/${user.uid}`);
  const fields = fieldsOf(doc);
  const expiresAt = timestampField(fields, "premiumExpiresAt");
  const now = Date.now();
  const premiumActive = boolField(fields, "premium") && expiresAt > now;
  const trialStartedAt = timestampField(fields, "trialStartedAt");
  const trialExpiresAt = timestampField(fields, "trialExpiresAt");
  const trialActive = trialStartedAt > 0 && trialExpiresAt > now;
  const active = premiumActive;
  const fullAccess = premiumActive || trialActive;
  const tier = active ? stringField(fields, "membershipTier") : "";
  // Cosmetics are permanent for every verified registered account.
  // Premium-code expiry controls full functionality, not cosmetic ownership.
  const entitlements = ["GOLD_THEME","JADE_THEME","ROSE_GOLD_THEME","ARCTIC_BLUE_THEME","GRAPHITE_THEME","PROFILE_BACKGROUNDS","PROFILE_AVATARS"];
  return response({
    premium: premiumActive,
    trialActive,
    fullAccess,
    tier: active && tier === "SUPPORTER_PLUS" ? tier : null,
    entitlements,
    trialStartedAt: trialStartedAt ? new Date(trialStartedAt).toISOString() : null,
    trialExpiresAt: trialExpiresAt ? new Date(trialExpiresAt).toISOString() : null,
    expiresAt: premiumActive ? new Date(expiresAt).toISOString() : null,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return response({}, 204);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return response({ ok: true, service: "watchathome-premium-api" });
    }

    try {
      const user = await verifyUser(request, env);
      if (request.method === "POST" && url.pathname === "/v1/account/bootstrap") {
        return await bootstrapAccount(request, env, user);
      }
      if (request.method === "POST" && url.pathname === "/v1/devices") {
        return await registerDevice(request, env, user);
      }
      if (request.method === "GET" && url.pathname === "/v1/devices") {
        return await listDevices(env, user);
      }
      const revokeDeviceMatch = /^\/v1\/devices\/([^/]+)$/.exec(url.pathname);
      if (request.method === "DELETE" && revokeDeviceMatch) {
        return await revokeDevice(request, env, user, decodeURIComponent(revokeDeviceMatch[1]));
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/premium-codes") {
        return await createCodes(request, env, user);
      }
      if (request.method === "POST" && url.pathname === "/v1/premium/redeem") {
        return await redeemCode(request, env, user);
      }
      if (request.method === "POST" && url.pathname === "/v1/trial/initialize") {
        const registeredAt = await firebaseAccountCreatedAt(request, env, user.uid);
        return await initializeTrial(env, user, registeredAt);
      }
      if (request.method === "GET" && url.pathname === "/v1/premium/status") {
        return await premiumStatus(env, user);
      }
      return response({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof HttpError) return response({ error: error.message }, error.status);
      return response({ error: "The premium service is temporarily unavailable." }, 500);
    }
  },
};
