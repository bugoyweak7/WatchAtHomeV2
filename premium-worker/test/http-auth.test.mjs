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
    seedProfile(uid, index = 1) {
      sqlite.prepare("INSERT INTO profiles(user_id, profile_index, profile_id, payload_json, created_at, updated_at) VALUES(?, ?, ?, '{}', 100, 100)").run(uid, index, "profile-" + uid + "-" + index);
    },
    close() { sqlite.close(); },
  };
}

async function idToken(uid, provider = "password", authTime = Math.floor(Date.now() / 1000)) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    auth_time: authTime,
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
  }), env);
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


const pinPepper = base64(crypto.getRandomValues(new Uint8Array(32)));
const dataKey = base64(crypto.getRandomValues(new Uint8Array(32)));
const secureEnv = () => ({
  ...envWithoutD1,
  PIN_PEPPER_KEYS_JSON: JSON.stringify({ 1: pinPepper }),
  PIN_PEPPER_ACTIVE_VERSION: "1",
  DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ 1: dataKey }),
  DATA_ENCRYPTION_ACTIVE_VERSION: "1",
});
function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

test("PIN routes require owned profiles and recent authentication for set and clear", async () => {
  const db = createD1();
  db.seedAccount("pin-owner");
  db.seedProfile("pin-owner", 1);
  const env = { ...secureEnv(), DB: db };
  const fresh = await idToken("pin-owner");
  const setResponse = await worker.fetch(request("/v1/profiles/1/pin?action=set", "POST", fresh, { pin: "2468" }), env);
  assert.equal(setResponse.status, 200);
  const verify = await worker.fetch(request("/v1/profiles/1/pin?action=verify", "POST", fresh, { pin: "2468" }), env);
  assert.equal(verify.status, 200);
  assert.equal((await verify.json()).verified, true);

  const stale = await idToken("pin-owner", "password", Math.floor(Date.now() / 1000) - 301);
  const staleSet = await worker.fetch(request("/v1/profiles/1/pin?action=set", "POST", stale, { pin: "8642" }), env);
  assert.equal(staleSet.status, 401);
  const staleClear = await worker.fetch(request("/v1/profiles/1/pin?action=clear", "POST", stale), env);
  assert.equal(staleClear.status, 401);

  db.seedAccount("another-owner");
  const wrongOwner = await idToken("another-owner");
  const denied = await worker.fetch(request("/v1/profiles/1/pin?action=verify", "POST", wrongOwner, { pin: "2468" }), env);
  assert.equal(denied.status, 404);
  db.close();
});

test("PIN route applies persisted lockout and request-level throttling", async () => {
  const db = createD1();
  db.seedAccount("pin-lock-owner");
  db.seedProfile("pin-lock-owner", 1);
  const env = { ...secureEnv(), DB: db };
  const token = await idToken("pin-lock-owner");
  const setResponse = await worker.fetch(request("/v1/profiles/1/pin?action=set", "POST", token, { pin: "1357" }), env);
  assert.equal(setResponse.status, 200);
  let result;
  for (let i = 0; i < 5; i++) {
    result = await worker.fetch(request("/v1/profiles/1/pin?action=verify", "POST", token, { pin: "0000" }), env);
  }
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.verified, false);
  assert.equal(body.locked, true);
  db.close();
});

test("provider credentials are encrypted, owner-scoped, and require configured key material", async () => {
  const db = createD1();
  db.seedAccount("credential-owner");
  db.seedProfile("credential-owner", 1);
  const env = { ...secureEnv(), DB: db };
  const token = await idToken("credential-owner");
  const put = await worker.fetch(request("/v1/profiles/1/provider-credentials", "PUT", token, {
    provider: "tmdb",
    credential: { apiKey: "private-value" },
  }), env);
  assert.equal(put.status, 200);
  const raw = await db.prepare("SELECT ciphertext FROM provider_credentials WHERE user_id = ?1").bind("credential-owner").first();
  assert.ok(raw?.ciphertext);
  const get = await worker.fetch(new Request("https://worker.test/v1/profiles/1/provider-credentials?provider=tmdb", { headers: { authorization: "Bearer " + token } }), env);
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).credential, { apiKey: "private-value" });
  db.seedAccount("credential-other");
  const other = await idToken("credential-other");
  const denied = await worker.fetch(new Request("https://worker.test/v1/profiles/1/provider-credentials?provider=tmdb", { headers: { authorization: "Bearer " + other } }), env);
  assert.equal(denied.status, 404);
  db.close();
});

test("media-server access tokens are encrypted and restored only to the owning profile", async () => {
  const db = createD1();
  db.seedAccount("media-owner");
  db.seedProfile("media-owner", 1);
  const env = { ...secureEnv(), DB: db };
  const token = await idToken("media-owner");
  const put = await worker.fetch(request("/v1/profiles/1/media-servers", "PUT", token, {
    serverKey: "jellyfin-main",
    providerId: "jellyfin",
    remoteServerId: "server-1",
    remoteUserId: "user-1",
    metadata: { name: "Home Server", url: "https://media.example.test" },
    accessToken: "sensitive-token",
  }), env);
  assert.equal(put.status, 200);
  const raw = await db.prepare("SELECT token_ciphertext FROM media_servers WHERE user_id = ?1").bind("media-owner").first();
  assert.ok(raw?.token_ciphertext);
  const get = await worker.fetch(request("/v1/profiles/1/media-servers", "GET", token), env);
  assert.equal(get.status, 200);
  const body = await get.json();
  assert.equal(body.servers[0].accessToken, "sensitive-token");
  assert.equal(body.servers[0].metadata.name, "Home Server");
  db.close();
});

test("profile CRUD and settings HTTP routes preserve serializer shapes and enforce ownership", async () => {
  const db = createD1();
  db.seedAccount("profile-http-owner");
  db.seedAccount("profile-http-other");
  const env = { ...envWithoutD1, DB: db };
  const token = await idToken("profile-http-owner");
  const otherToken = await idToken("profile-http-other");

  const save = await worker.fetch(request("/v1/profiles", "PUT", token, {
    profiles: [{
      profile_index: 1,
      name: "Main",
      avatar_color_hex: "#1E88E5",
      uses_primary_addons: false,
      uses_primary_plugins: true,
      avatar_id: "avatar-main",
      avatar_url: null,
      profile_background_id: null,
      profile_background_url: null,
    }],
  }), env);
  assert.equal(save.status, 200);
  assert.equal((await save.json()).saved, 1);

  const list = await worker.fetch(request("/v1/profiles", "GET", token), env);
  const profiles = await list.json();
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(profiles));
  assert.equal(profiles[0].name, "Main");
  assert.equal(profiles[0].user_id, "profile-http-owner");

  const settings = {
    version: 4,
    features: { theme_settings: { mode: "dark" }, future_setting: { keep: true } },
  };
  const putSettings = await worker.fetch(request("/v1/profiles/1/settings?platform=mobile", "PUT", token, { settings_json: settings }), env);
  assert.equal(putSettings.status, 200);
  const getSettings = await worker.fetch(request("/v1/profiles/1/settings?platform=mobile", "GET", token), env);
  const settingsRows = await getSettings.json();
  assert.equal(getSettings.status, 200);
  assert.ok(Array.isArray(settingsRows));
  assert.deepEqual(settingsRows[0].settings_json, settings);

  const denied = await worker.fetch(request("/v1/profiles/1/settings?platform=mobile", "GET", otherToken), env);
  assert.equal(denied.status, 404);

  const locks = await worker.fetch(request("/v1/profiles/locks", "GET", token), env);
  assert.deepEqual(await locks.json(), [{ profile_id: 1, pin_enabled: false, pin_locked_until: null }]);

  const remove = await worker.fetch(request("/v1/profiles/1", "DELETE", token), env);
  assert.equal(remove.status, 200);
  assert.deepEqual(await remove.json(), { deleted: true });
  assert.deepEqual(await (await worker.fetch(request("/v1/profiles", "GET", token), env)).json(), []);
  db.close();
});

test("add-on, plugin and collection HTTP sync routes enforce Firebase profile ownership", async () => {
  const db = createD1();
  db.seedAccount("sync-http-owner");
  db.seedProfile("sync-http-owner", 1);
  db.seedAccount("sync-http-other");
  const env = { ...envWithoutD1, DB: db };
  const token = await idToken("sync-http-owner");
  const otherToken = await idToken("sync-http-other");

  const addonUrl = "https://addons.example.test/manifest.json";
  const putAddons = await worker.fetch(request("/v1/profiles/1/addons", "PUT", token, {
    addons: [{ url: addonUrl, name: "Example Addon", enabled: true, sort_order: 0 }],
  }), env);
  assert.equal(putAddons.status, 200);
  assert.deepEqual(await (await worker.fetch(request("/v1/profiles/1/addons", "GET", token), env)).json(), [
    { url: addonUrl, name: "Example Addon", enabled: true, sort_order: 0 },
  ]);

  const pluginUrl = "https://plugins.example.test/manifest.json";
  const putPlugins = await worker.fetch(request("/v1/profiles/1/plugins", "PUT", token, {
    plugins: [{ url: pluginUrl, name: "Example Plugin", enabled: true, sort_order: 0 }],
  }), env);
  assert.equal(putPlugins.status, 200);
  assert.equal((await (await worker.fetch(request("/v1/profiles/1/plugins", "GET", token), env)).json())[0].url, pluginUrl);

  const collections = [{ id: "watchlist", title: "Watchlist", futureProperty: { preserve: true } }];
  const putCollections = await worker.fetch(request("/v1/profiles/1/collections", "PUT", token, {
    collections_json: collections,
  }), env);
  assert.equal(putCollections.status, 200);
  const pulledCollections = await worker.fetch(request("/v1/profiles/1/collections", "GET", token), env);
  const collectionRows = await pulledCollections.json();
  assert.equal(pulledCollections.status, 200);
  assert.deepEqual(collectionRows[0].collections_json, collections);

  const denied = await worker.fetch(request("/v1/profiles/1/addons", "GET", otherToken), env);
  assert.equal(denied.status, 404);
  db.close();
});

after(() => {
  globalThis.fetch = originalFetch;
});


test("device DELETE revokes only the authenticated owner's registry entry", async () => {
  const db = createD1();
  db.seedAccount("device-owner-a");
  db.seedAccount("device-owner-b");
  const env = { ...envWithoutD1, DB: db };
  const tokenA = await idToken("device-owner-a");
  const tokenB = await idToken("device-owner-b");

  for (const [token, installationId] of [[tokenA, "tv-a"], [tokenB, "tv-b"]]) {
    const created = await worker.fetch(request("/v1/devices", "POST", token, {
      installationId,
      clientName: "WatchAtHome",
      clientVersion: "2.0",
      platform: "android_tv",
      deviceName: installationId,
    }), env);
    assert.equal(created.status, 200);
  }

  const revoked = await worker.fetch(request("/v1/devices/tv-a", "DELETE", tokenA), env);
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { revoked: true });

  const ownerList = await worker.fetch(request("/v1/devices", "GET", tokenA), env);
  assert.deepEqual((await ownerList.json()).devices, []);

  const otherList = await worker.fetch(request("/v1/devices", "GET", tokenB), env);
  assert.equal((await otherList.json()).devices.length, 1);

  const wrongOwner = await worker.fetch(request("/v1/devices/tv-b", "DELETE", tokenA), env);
  assert.equal(wrongOwner.status, 200);
  assert.deepEqual(await wrongOwner.json(), { revoked: false });
  db.close();
});


test("library HTTP routes authenticate and enforce profile ownership across snapshot and delta sync", async () => {
  const db = createD1();
  db.seedAccount("library-http-owner");
  db.seedAccount("library-http-other");
  db.seedProfile("library-http-owner", 1);
  const env = { ...envWithoutD1, DB: db };
  const token = await idToken("library-http-owner");
  const otherToken = await idToken("library-http-other");

  const put = await worker.fetch(request("/v1/profiles/1/library", "PUT", token, {
    items: [{ content_id: "tt900", content_type: "movie", name: "HTTP Movie", poster_shape: "POSTER", genres: [], added_at: 1234 }],
  }), env);
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { saved: 1 });

  const cursorResponse = await worker.fetch(request("/v1/profiles/1/library/cursor", "GET", token), env);
  assert.equal(cursorResponse.status, 200);
  const cursor = await cursorResponse.json();
  assert.equal(cursor, 1);

  const snapshot = await worker.fetch(request("/v1/profiles/1/library?limit=10&offset=0", "GET", token), env);
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json())[0].content_id, "tt900");

  const delta = await worker.fetch(request("/v1/profiles/1/library/delta?since=0&limit=10", "GET", token), env);
  assert.equal(delta.status, 200);
  assert.equal((await delta.json())[0].operation, "upsert");

  const denied = await worker.fetch(request("/v1/profiles/1/library", "GET", otherToken), env);
  assert.equal(denied.status, 404);
  db.close();
});


test("watch progress HTTP routes authenticate and isolate profile data", async () => {
  const db = createD1();
  db.seedAccount("progress-http-owner");
  db.seedAccount("progress-http-other");
  db.seedProfile("progress-http-owner", 1);
  const env = { ...envWithoutD1, DB: db };
  const token = await idToken("progress-http-owner");
  const otherToken = await idToken("progress-http-other");
  const entry = {
    content_id: "show-http",
    content_type: "series",
    video_id: "episode-http",
    season: 2,
    episode: 4,
    position: 45000,
    duration: 180000,
    last_watched: 1700000000000,
    progress_key: "show-http_s2e4",
  };

  const pushed = await worker.fetch(request("/v1/profiles/1/watch-progress", "PUT", token, {
    p_entries: [entry],
    p_origin_client_id: "nuvio-mobile-http",
  }), env);
  assert.equal(pushed.status, 200);
  assert.deepEqual(await pushed.json(), { saved: 1 });

  const snapshot = await worker.fetch(request("/v1/profiles/1/watch-progress?limit=10", "GET", token), env);
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json())[0].progress_key, entry.progress_key);

  const offsetSnapshot = await worker.fetch(request("/v1/profiles/1/watch-progress?limit=10&offset=1", "GET", token), env);
  assert.equal(offsetSnapshot.status, 200);
  assert.deepEqual(await offsetSnapshot.json(), []);

  const cursorResponse = await worker.fetch(request("/v1/profiles/1/watch-progress/cursor", "GET", token), env);
  assert.equal(cursorResponse.status, 200);
  const cursor = await cursorResponse.json();
  assert.equal(cursor, 1);

  const delta = await worker.fetch(request("/v1/profiles/1/watch-progress/delta?since=0&limit=10", "GET", token), env);
  assert.equal(delta.status, 200);
  assert.equal((await delta.json())[0].operation, "upsert");

  const denied = await worker.fetch(request("/v1/profiles/1/watch-progress", "GET", otherToken), env);
  assert.equal(denied.status, 404);
  db.close();
});


test("watched-items HTTP routes authenticate, preserve deltas and enforce profile ownership", async () => {
  const db = createD1();
  db.seedAccount("watched-http-owner");
  db.seedAccount("watched-http-other");
  db.seedProfile("watched-http-owner", 1);
  const env = { ...envWithoutD1, DB: db };
  const token = await idToken("watched-http-owner");
  const otherToken = await idToken("watched-http-other");
  const item = {
    content_id: "watched-http-movie",
    content_type: "movie",
    title: "HTTP Watched Film",
    season: null,
    episode: null,
    watched_at: 1700000000000,
  };

  const pushed = await worker.fetch(request("/v1/profiles/1/watched-items", "PUT", token, {
    p_items: [item],
    p_origin_client_id: "watchathome-http-test",
  }), env);
  assert.equal(pushed.status, 200);
  assert.deepEqual(await pushed.json(), { saved: 1 });

  const snapshot = await worker.fetch(request("/v1/profiles/1/watched-items?limit=10&offset=0", "GET", token), env);
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json())[0].content_id, item.content_id);

  const cursor = await worker.fetch(request("/v1/profiles/1/watched-items/cursor", "GET", token), env);
  assert.equal(await cursor.json(), 1);

  const delta = await worker.fetch(request("/v1/profiles/1/watched-items/delta?since=0&limit=10", "GET", token), env);
  assert.equal(delta.status, 200);
  assert.equal((await delta.json())[0].operation, "upsert");

  const removed = await worker.fetch(request("/v1/profiles/1/watched-items/delete", "POST", token, {
    p_keys: [{ content_id: item.content_id, season: null, episode: null }],
  }), env);
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { deleted: 1 });

  const deleteDelta = await worker.fetch(request("/v1/profiles/1/watched-items/delta?since=1&limit=10", "GET", token), env);
  assert.equal((await deleteDelta.json())[0].operation, "delete");

  const denied = await worker.fetch(request("/v1/profiles/1/watched-items", "GET", otherToken), env);
  assert.equal(denied.status, 404);
  db.close();
});
