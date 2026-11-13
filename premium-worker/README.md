# WatchAtHome Premium API

This Worker uses the existing Firebase project `watchathome-admin`. Firebase Authentication remains the identity provider and Firestore remains the premium source of truth. Cloudflare only hosts trusted server-side operations.

## Endpoints

- `GET /health` — service health.
- `POST /v1/admin/premium-codes` — active Firebase administrators create codes. JSON: `{"count":5,"durationDays":30}`.
- `POST /v1/premium/redeem` — signed-in user redeems JSON: `{"code":"WAH-XXXX-XXXX-XXXX"}`.
- `GET /v1/premium/status` — signed-in user's current entitlement.

All endpoints except health require a Firebase Authentication ID token in the Authorization Bearer header. Admin code creation additionally checks `admins/{uid}` with `role == "admin"` and `active == true`.

## Firestore documents

- `premium_codes/{sha256(normalizedCode)}` stores code state and the code string for the admin-only code-history screen. Firestore rules must deny all non-admin reads/writes to this collection.
- `users/{uid}` stores `premium`, `premiumExpiresAt`, and `premiumUpdatedAt`.

Codes have a 24-hour-and-15-minute activation window and a duration selected by the admin. Both day-based codes and minute-based test codes are supported. Redeemed codes are single-use. A new code extends an existing active entitlement rather than shortening it.

## Configure and deploy

1. In Google Cloud Console for project `watchathome-admin`, create a dedicated service account for this Worker.
2. Grant only the Firestore permissions needed to read/write `admins`, `premium_codes`, and `users`, and use the project service-account credentials only as a Cloudflare secret. Do not commit the JSON key.
3. From this directory run `npm install`.
4. Run `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` and paste the complete service-account JSON.
5. Run `npm run check`, then `npm run deploy`.

The service account's IAM permissions bypass Firestore Security Rules. The Worker therefore performs its own Firebase ID-token and admin-document checks. Never expose the service-account key to either mobile app. Keep its IAM role limited to the required Firestore data access.

## Client integration

Mobile clients must fetch a fresh Firebase ID token and call the endpoints over HTTPS. The User app must display premium only from the server response or the mirrored user entitlement fields protected by Firestore rules. Do not allow client-side writes to `premium`, `premiumExpiresAt`, or `premium_codes`.

This Worker is not deployed by committing it to GitHub. Configure the secret and deploy it from Cloudflare after reviewing the required IAM permissions.


## Admin app configuration

After the Worker is deployed, set its HTTPS base URL when building the Admin app:

```powershell
./gradlew assembleDebug -Pwatchathome.premiumApiBaseUrl=https://YOUR-WORKER.workers.dev
```

The Admin app now calls `POST /v1/admin/premium-codes` for code creation and reads the admin-only `premium_codes` collection for history. Do not put service-account credentials in the app.


## Account and device bootstrap APIs (not yet enabled)

- `POST /v1/account/bootstrap` — verifies Firebase account creation time, creates the D1 account row idempotently, then initializes the immutable 7-day trial in Firestore.
- `POST /v1/devices` — registers or updates the current installation under the UID from the verified Firebase ID token. JSON fields: `installationId`, `clientName`, `clientVersion`, `platform`, `deviceName`.
- `GET /v1/devices` — lists up to 100 active device registrations owned by the authenticated UID.

These routes require an active D1 account row. They currently return HTTP 503 because `wrangler.toml` has no D1 binding. The D1 schema remains a draft and has not been applied. Device registry metadata is not a remote sign-out mechanism; no device revocation API is exposed.

## Automated checks

- `npm run check` — TypeScript compilation.
- `npm run test:schema` — 9 local SQLite schema tests.
- `npm run test:worker` — 6 SQLite-backed mocked D1 account/device data-access tests.

Latest verified GitHub Actions run: `43376689122` (TypeScript passed; 9 schema tests and 6 mocked D1 tests passed). This does not establish live Cloudflare D1, Firebase, or HTTP/JWT integration.


- `npm run test:http` — 5 Worker HTTP/Firebase-token tests using a generated test key and mocked JWKS.

The CI suite currently runs 20 tests in total (9 schema, 6 mocked D1 data-access, 5 Worker HTTP/auth). Latest passing run: `43377044568`. Tests use local SQLite and test-only signing keys; they are not live Firebase/Firestore/D1 integration tests.


### Versioned data encryption primitive

`src/data-crypto.ts` provides AES-256-GCM helpers for sensitive record values. It expects:

- `DATA_ENCRYPTION_KEYS_JSON`: a JSON object mapping integer key versions to base64-encoded 32-byte keys, for example a shape like `{"1":"BASE64_KEY_MATERIAL"}` (placeholder only; never commit real key material).
- `DATA_ENCRYPTION_ACTIVE_VERSION`: the key version used for new encryption. Keep prior versions in the key ring until all ciphertext using them has been rotated.

Encryption binds AAD to the verified UID, profile index, resource, and record key. The primitive is not yet connected to credential/media-server routes, and no key secret is configured. Do not store secrets in D1 until integration and end-to-end tests are complete.

- `npm run test:crypto` — 5 AES-GCM/key-rotation tests.


### Encrypted credential repository

`src/credential-store.ts` provides D1 data-access helpers that encrypt provider credential JSON and media-server access tokens before storage. Media-server metadata is separate and rejects secret-like field names. These helpers are not yet exposed through authenticated HTTP routes and cannot run in the current deployment because D1 and the encryption key-ring secret are not configured.

- `npm run test:credentials` — 4 SQLite-backed encrypted credential repository tests.

Latest CI run `43377725695`: TypeScript passed; 29 tests passed across schema, account/device, HTTP/auth, crypto, and credential storage.


### Profile PIN verifier primitive

`src/pin-verifier.ts` provides a peppered, versioned HMAC-SHA256 verifier with per-record salt and UID/profile binding. It stores a digest, not the PIN. Configure `PIN_PEPPER_KEYS_JSON` as a version-to-base64-key object (each pepper at least 32 bytes) and `PIN_PEPPER_ACTIVE_VERSION` only through Cloudflare secrets/variables after the route and lockout design is approved. No PIN route or persisted lockout workflow is enabled yet.

- `npm run test:pin` — 4 profile PIN verifier and pepper-rotation tests.


- `npm run test:pin-store` — 4 SQLite-backed tests for persisted profile PIN failed-attempt tracking and lockout. The store helper is not yet connected to a PIN HTTP route.

Latest passing CI run `43378244632`: TypeScript passed and 37 tests passed across schema, account/device, HTTP/auth, encryption, credential storage, PIN verifier, and PIN lockout.


### Profile PIN lifecycle storage helpers

`src/pin-store.ts` now also exposes `setProfilePin` and `clearProfilePin`. Replacing a PIN generates a fresh salt/verifier and resets lockout counters; clearing is scoped to the UID/profile pair. The caller must enforce recent Firebase reauthentication before either mutation. These remain storage helpers only: no HTTP PIN route or pepper secret is configured.

The PIN store test suite now covers create/replace, old-PIN invalidation, lockout reset, and owner/profile isolation.
