import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
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
      "access-control-allow-methods": "GET,POST,OPTIONS",
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
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.auth_time !== "number" || payload.auth_time > Math.floor(Date.now() / 1000) + 60) {
    throw new HttpError(401, "Invalid Firebase user token.");
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
          createdAt: { timestampValue: new Date(now).toISOString() },\n          activationDeadline: { timestampValue: new Date(now + 24 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString() },
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
  const durationDays = Math.max(1, numberField(codeFields, "durationDays"));
  const expiresAt = startAt + durationDays * 24 * 60 * 60 * 1000;

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
          premiumExpiresAt: { timestampValue: new Date(expiresAt).toISOString() },
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

async function premiumStatus(env: Env, user: VerifiedUser): Promise<Response> {
  const doc = await readDocument(env, `users/${user.uid}`);
  const fields = fieldsOf(doc);
  const expiresAt = timestampField(fields, "premiumExpiresAt");
  const active = boolField(fields, "premium") && expiresAt > Date.now();
  return response({ premium: active, expiresAt: active ? new Date(expiresAt).toISOString() : null });
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
      if (request.method === "POST" && url.pathname === "/v1/admin/premium-codes") {
        return await createCodes(request, env, user);
      }
      if (request.method === "POST" && url.pathname === "/v1/premium/redeem") {
        return await redeemCode(request, env, user);
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
