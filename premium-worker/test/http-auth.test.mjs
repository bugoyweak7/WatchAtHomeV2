import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const originalFetch = globalThis.fetch;
const projectId = "watchathome-admin";
const issuer = `https://securetoken.google.com/${projectId}`;
const jwksUrl = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "watchathome-ci-key";
jwk.alg = "RS256";
jwk.use = "sig";

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === jwksUrl) return Response.json({ keys: [jwk] });
  return originalFetch(input, init);
};

const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");
const workerModule = await import("../src/index.ts");
const worker = workerModule.default;

function createD1() {
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
    seedAccount(uid) {
      sqlite.prepare("INSERT INTO accounts(user_id, status, created_at, updated_at) VALUES(?, 'active', 100, 100)").run(uid);
    },
    close() { sqlite.close(); },
  };
}

async function idToken(uid, provider = "password") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    auth_time: now,
    firebase: { sign_in_provider: provider },
    email: `${uid}@example.test`,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(projectId)
    .setSubject(uid)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
}

function request(path, method = "GET", token, body) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://worker.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const envWithoutD1 = {
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_WEB_API_KEY: "test-api-key",
  FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
};

test("health endpoint is public and does not require Firebase authentication", async () => {
  const response = await worker.fetch(request("/health"), envWithoutD1);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("protected routes reject missing Firebase ID tokens", async () => {
  const response = await worker.fetch(request("/v1/devices"), envWithoutD1);
  assert.equal(response.status, 401);
});

test("protected routes reject anonymous Firebase sign-in tokens", async () => {
  const token = await idToken("anonymous-user", "anonymous");
  const response = await worker.fetch(request("/v1/devices", "GET", token), envWithoutD1);
  assert.equal(response.status, 401);
});

test("authenticated account and device routes fail closed while D1 is not configured", async () => {
  const token = await idToken("registered-user");
  for (const [path, method, body] of [
    ["/v1/account/bootstrap", "POST", {}],
    ["/v1/devices", "POST", {
      installationId: "install-1",
      clientName: "WatchAtHome",
      clientVersion: "1.0",
      platform: "android_tv",
      deviceName: "TV",
    }],
    ["/v1/devices", "GET", undefined],
  ]) {
    const response = await worker.fetch(request(path, method, token, body), envWithoutD1);
    assert.equal(response.status, 503);
  }
});

test("authenticated device endpoints use verified UID and return only the owner's devices", async () => {
  const db = createD1();
  db.seedAccount("owner-a");
  db.seedAccount("owner-b");
  const env = { ...envWithoutD1, DB: db };
  const tokenA = await idToken("owner-a");
  const tokenB = await idToken("owner-b");

  const createResponse = await worker.fetch(request("/v1/devices", "POST", tokenA, {
    installationId: "install-a",
    clientName: "WatchAtHome",
    clientVersion: "2.0",
    platform: "android_tv",
    deviceName: "Living Room TV",
    userId: "owner-b",
  }));
  assert.equal(createResponse.status, 200);
  assert.deepEqual(await createResponse.json(), { registered: true, installationId: "install-a" });

  const ownerResponse = await worker.fetch(request("/v1/devices", "GET", tokenA), env);
  const ownerBody = await ownerResponse.json();
  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerBody.devices.length, 1);
  assert.equal(ownerBody.devices[0].deviceName, "Living Room TV");

  const otherResponse = await worker.fetch(request("/v1/devices", "GET", tokenB), env);
  const otherBody = await otherResponse.json();
  assert.equal(otherResponse.status, 200);
  assert.deepEqual(otherBody.devices, []);
  db.close();
});

after(() => {
  globalThis.fetch = originalFetch;
});
