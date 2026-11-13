import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { saveProviderCredential, loadProviderCredential, saveMediaServer, loadMediaServerToken } from "./credential-store";
import { setProfilePin, clearProfilePin, verifyProfilePinWithLockout } from "./pin-store";
import { consumeRateLimit } from "./rate-limit";
import { getAddons, getCollections, getHomeCatalogSettings, getPlugins, putAddons, putCollections, putHomeCatalogSettings, putPlugins } from "./profile-sync-api";
import {
  deleteProfile, getProfileSettings, listProfileLocks, listProfiles, putProfileSettings, upsertProfiles,
} from "./profile-api";
import {
  AccountApiError,
  ensureActiveAccount,
  listDevices,
  parseDeviceRegistration,
  registerDevice,
  revokeDevice,
  requireAccountDb,
  readBoundedJson,
  type AccountD1Database,
} from "./account-device";

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  DATA_ENCRYPTION_KEYS_JSON?: string;
  DATA_ENCRYPTION_ACTIVE_VERSION?: string;
  PIN_PEPPER_KEYS_JSON?: string;
  PIN_PEPPER_ACTIVE_VERSION?: string;
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
  authTime: number;
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
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
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
  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined, authTime: payload.auth_time };
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

async function bootstrapAccount(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireAccountDb(env);
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

async function registerDeviceRoute(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireAccountDb(env);
  const input = await parseDeviceRegistration(request);
  const result = await registerDevice(db, user.uid, input);
  return response(result);
}

async function revokeDeviceRoute(request: Request, env: Env, user: VerifiedUser, encodedInstallationId: string): Promise<Response> {
  const db = requireAccountDb(env);
  let installationId: string;
  try {
    installationId = decodeURIComponent(encodedInstallationId);
  } catch {
    throw new AccountApiError(400, "Invalid installation ID.");
  }
  await ensureActiveAccount(db, user.uid);
  await applyRateLimits(request, db, user, "device-revoke");
  return response(await revokeDevice(db, user.uid, installationId));
}

async function listDevicesRoute(env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireAccountDb(env);
  return response(await listDevices(db, user.uid));
}

type PinConfiguredEnv = Env & { PIN_PEPPER_KEYS_JSON: string; PIN_PEPPER_ACTIVE_VERSION: string };
type EncryptionConfiguredEnv = Env & { DATA_ENCRYPTION_KEYS_JSON: string; DATA_ENCRYPTION_ACTIVE_VERSION: string };
function requirePinConfiguration(env: Env): asserts env is PinConfiguredEnv {
  if (!env.PIN_PEPPER_KEYS_JSON || !env.PIN_PEPPER_ACTIVE_VERSION) throw new HttpError(503, "Profile PIN storage is not configured.");
}
function requireEncryptionConfiguration(env: Env): asserts env is EncryptionConfiguredEnv {
  if (!env.DATA_ENCRYPTION_KEYS_JSON || !env.DATA_ENCRYPTION_ACTIVE_VERSION) throw new HttpError(503, "Encrypted credential storage is not configured.");
}
function requireRecentReauthentication(user: VerifiedUser): void {
  const age = Math.floor(Date.now() / 1000) - user.authTime;
  if (age < 0 || age > 300) throw new HttpError(401, "Please reauthenticate and try again.");
}
function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HttpError(400, "Invalid profile data.");
  return value.trim();
}
async function requireOwnedProfile(db: AccountD1Database, uid: string, index: number): Promise<void> {
  await ensureActiveAccount(db, uid);
  const row = await db.prepare("SELECT 1 AS owned FROM profiles WHERE user_id = ?1 AND profile_index = ?2").bind(uid, index).first();
  if (!row) throw new HttpError(404, "Profile not found.");
}
async function applyRateLimits(request: Request, db: AccountD1Database, user: VerifiedUser, route: string, profileIndex?: number): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unavailable";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const ipKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const owner = profileIndex ? user.uid + ":profile:" + profileIndex : user.uid;
  const limit = route === "pin-verify" ? 10 : 30;
  const [a, n] = await Promise.all([
    consumeRateLimit(db, owner, route, "account", limit, 900000),
    consumeRateLimit(db, "ip:" + ipKey, route, "network", limit * 3, 900000),
  ]);
  if (!a.allowed || !n.allowed) throw new HttpError(429, "Too many requests. Please wait before trying again.");
}
async function profileApiRoute(request: Request, env: Env, user: VerifiedUser): Promise<Response> {
  const db = requireAccountDb(env);
  const url = new URL(request.url);
  if (url.pathname === "/v1/profiles" && request.method === "GET") {
    await ensureActiveAccount(db, user.uid);
    await applyRateLimits(request, db, user, "profiles-list");
    return response(await listProfiles(db, user.uid));
  }
  if (url.pathname === "/v1/profiles" && request.method === "PUT") {
    await ensureActiveAccount(db, user.uid);
    await applyRateLimits(request, db, user, "profiles-save");
    return response(await upsertProfiles(db, user.uid, request));
  }
  if (url.pathname === "/v1/profiles/locks" && request.method === "GET") {
    await ensureActiveAccount(db, user.uid);
    await applyRateLimits(request, db, user, "profile-locks");
    return response(await listProfileLocks(db, user.uid));
  }
  const deleteMatch = /^\/v1\/profiles\/([1-9][0-9]*)$/.exec(url.pathname);
  if (deleteMatch && request.method === "DELETE") {
    const index = Number(deleteMatch[1]);
    await requireOwnedProfile(db, user.uid, index);
    await applyRateLimits(request, db, user, "profile-delete", index);
    return response(await deleteProfile(db, user.uid, index));
  }
  const settingsMatch = /^\/v1\/profiles\/([1-9][0-9]*)\/settings$/.exec(url.pathname);
  if (settingsMatch && (request.method === "GET" || request.method === "PUT")) {
    const index = Number(settingsMatch[1]);
    await requireOwnedProfile(db, user.uid, index);
    await applyRateLimits(request, db, user, "profile-settings", index);
    const platform = url.searchParams.get("platform") ?? "mobile";
    if (request.method === "GET") {
      return response(await getProfileSettings(db, user.uid, index, platform));
    }
    return response(await putProfileSettings(db, user.uid, index, platform, request));
  }
  return response({ error: "Not found." }, 404);
}

async function homeCatalogSettingsRoute(
  request: Request,
  env: Env,
  user: VerifiedUser,
  index: number,
): Promise<Response> {
  const db = requireAccountDb(env);
  await requireOwnedProfile(db, user.uid, index);
  await applyRateLimits(request, db, user, "home-catalog-settings", index);
  const platform = new URL(request.url).searchParams.get("platform") ?? "home_catalog_shared";
  if (request.method === "GET") {
    return response(await getHomeCatalogSettings(db, user.uid, index, platform));
  }
  if (request.method === "PUT") {
    return response(await putHomeCatalogSettings(db, user.uid, index, platform, request));
  }
  return response({ error: "Method not allowed." }, 405);
}

async function profileSyncRoute(request: Request, env: Env, user: VerifiedUser, index: number, resource: "addons" | "plugins" | "collections"): Promise<Response> {
  const db = requireAccountDb(env);
  await requireOwnedProfile(db, user.uid, index);
  await applyRateLimits(request, db, user, "profile-sync-" + resource, index);
  if (resource === "addons") {
    if (request.method === "GET") return response(await getAddons(db, user.uid, index));
    if (request.method === "PUT") return response(await putAddons(db, user.uid, index, request));
  }
  if (resource === "plugins") {
    if (request.method === "GET") return response(await getPlugins(db, user.uid, index));
    if (request.method === "PUT") return response(await putPlugins(db, user.uid, index, request));
  }
  if (resource === "collections") {
    if (request.method === "GET") return response(await getCollections(db, user.uid, index));
    if (request.method === "PUT") return response(await putCollections(db, user.uid, index, request));
  }
  return response({ error: "Method not allowed." }, 405);
}

async function pinRoute(request: Request, env: Env, user: VerifiedUser, action: "set" | "verify" | "clear"): Promise<Response> {
  const db = requireAccountDb(env);
  const index = Number(/^\/v1\/profiles\/([1-9][0-9]*)\/pin$/.exec(new URL(request.url).pathname)?.[1]);
  if (!Number.isSafeInteger(index) || index < 1 || index > 100) throw new HttpError(404, "Profile route not found.");
  await requireOwnedProfile(db, user.uid, index);
  await applyRateLimits(request, db, user, "pin-" + action, index);
  if (action !== "verify") requireRecentReauthentication(user);
  requirePinConfiguration(env);
  if (action === "clear") return response({ success: true, removed: await clearProfilePin(db, user.uid, index) });
  const input = await readBoundedJson(request, 2048);
  if (typeof input.pin !== "string" || input.pin.length < 4 || input.pin.length > 64) throw new HttpError(400, "Invalid PIN request.");
  if (action === "set") { await setProfilePin(db, env, user.uid, index, input.pin); return response({ success: true }); }
  const result = await verifyProfilePinWithLockout(db, env, user.uid, index, input.pin);
  return response({ verified: result.verified, locked: result.locked, retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000) });
}
async function providerCredentialRoute(request: Request, env: Env, user: VerifiedUser, index: number): Promise<Response> {
  const db = requireAccountDb(env); await requireOwnedProfile(db, user.uid, index); await applyRateLimits(request, db, user, "provider-credentials", index); requireEncryptionConfiguration(env);
  if (request.method === "GET") {
    const provider = boundedText(new URL(request.url).searchParams.get("provider"), 160);
    const value = await loadProviderCredential(db, env, user.uid, index, provider);
    return response({ provider, credential: value === null ? null : JSON.parse(value) });
  }
  const input = await readBoundedJson(request, 32768);
  const provider = boundedText(input.provider, 160);
  if (!input.credential || typeof input.credential !== "object" || Array.isArray(input.credential)) throw new HttpError(400, "Invalid credential payload.");
  await saveProviderCredential(db, env, user.uid, index, provider, JSON.stringify(input.credential));
  return response({ success: true, provider });
}
async function mediaServersRoute(request: Request, env: Env, user: VerifiedUser, index: number): Promise<Response> {
  const db = requireAccountDb(env); await requireOwnedProfile(db, user.uid, index); await applyRateLimits(request, db, user, "media-servers", index); requireEncryptionConfiguration(env);
  if (request.method === "PUT") {
    const input = await readBoundedJson(request, 32768); const metadata = input.metadata ?? {};
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new HttpError(400, "Invalid media-server metadata.");
    await saveMediaServer(db, env, { userId: user.uid, profileIndex: index, serverKey: boundedText(input.serverKey, 160), providerId: boundedText(input.providerId, 120), remoteServerId: boundedText(input.remoteServerId, 200), remoteUserId: boundedText(input.remoteUserId, 200), metadataJson: JSON.stringify(metadata), accessToken: input.accessToken == null ? null : boundedText(input.accessToken, 8192) });
    return response({ success: true });
  }
  const rows = await db.prepare("SELECT server_key AS serverKey, provider_id AS providerId, remote_server_id AS remoteServerId, remote_user_id AS remoteUserId, metadata_json AS metadata FROM media_servers WHERE user_id = ?1 AND profile_index = ?2 ORDER BY server_key LIMIT 100").bind(user.uid, index).all();
  const servers = await Promise.all(rows.results.map(async (row: Record<string, unknown>) => ({ serverKey: row.serverKey, providerId: row.providerId, remoteServerId: row.remoteServerId, remoteUserId: row.remoteUserId, metadata: JSON.parse(String(row.metadata)), accessToken: await loadMediaServerToken(db, env, user.uid, index, String(row.serverKey)) })));
  return response({ servers });
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
      if (url.pathname === "/v1/profiles" || url.pathname === "/v1/profiles/locks" ||
          /^\/v1\/profiles\/([1-9][0-9]*)(?:\/settings)?$/.test(url.pathname)) {
        const profileResponse = await profileApiRoute(request, env, user);
        if (profileResponse.status !== 404) return profileResponse;
      }
      const profileSyncMatch = /^\/v1\/profiles\/([1-9][0-9]*)\/(addons|plugins|collections)$/.exec(url.pathname);
      const homeCatalogMatch = /^\/v1\/profiles\/([1-9][0-9]*)\/home-catalog$/.exec(url.pathname);
      if (homeCatalogMatch && (request.method === "GET" || request.method === "PUT")) {
        return await homeCatalogSettingsRoute(request, env, user, Number(homeCatalogMatch[1]));
      }
      if (profileSyncMatch && (request.method === "GET" || request.method === "PUT")) {
        return await profileSyncRoute(request, env, user, Number(profileSyncMatch[1]), profileSyncMatch[2] as "addons" | "plugins" | "collections");
      }
      const pinMatch = /^\/v1\/profiles\/([1-9][0-9]*)\/pin$/.exec(url.pathname);
      if (pinMatch && request.method === "POST") { const action = url.searchParams.get("action"); if (action === "set" || action === "verify" || action === "clear") return await pinRoute(request, env, user, action); }
      const providerMatch = /^\/v1\/profiles\/([1-9][0-9]*)\/provider-credentials$/.exec(url.pathname);
      if (providerMatch && (request.method === "GET" || request.method === "PUT")) return await providerCredentialRoute(request, env, user, Number(providerMatch[1]));
      const mediaMatch = /^\/v1\/profiles\/([1-9][0-9]*)\/media-servers$/.exec(url.pathname);
      if (mediaMatch && (request.method === "GET" || request.method === "PUT")) return await mediaServersRoute(request, env, user, Number(mediaMatch[1]));
      if (request.method === "POST" && url.pathname === "/v1/account/bootstrap") {
        return await bootstrapAccount(request, env, user);
      }
      if (request.method === "POST" && url.pathname === "/v1/devices") {
        return await registerDeviceRoute(request, env, user);
      }
      const revokeDeviceMatch = /^\\/v1\\/devices\\/([^/]+)$/.exec(url.pathname);
      if (revokeDeviceMatch && request.method === "DELETE") {
        return await revokeDeviceRoute(request, env, user, revokeDeviceMatch[1]);
      }
      if (request.method === "GET" && url.pathname === "/v1/devices") {
        return await listDevicesRoute(env, user);
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
      if (!(error instanceof HttpError) && !(error instanceof AccountApiError)) {
        console.error("Unhandled Worker request error", error);
      }
      if (error instanceof HttpError || error instanceof AccountApiError) return response({ error: error.message }, error.status);
      return response({ error: "The premium service is temporarily unavailable." }, 500);
    }
  },
};
