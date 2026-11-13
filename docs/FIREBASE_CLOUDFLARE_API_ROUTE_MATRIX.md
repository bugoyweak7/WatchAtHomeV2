# Firebase + Cloudflare API Route Matrix — Draft

Date: 2026-11-13 (Asia/Manila)  
Repository: `bugoyweak7/WatchAtHomeV2`  
Branch: `setup/firebase-cloudflare-zero-cost`  
Status: Proposed route contract only. These routes are not implemented or deployed.

## Shared rules

- Protected routes require `Authorization: Bearer <Firebase ID token>`.
- The Worker verifies signature, issuer, audience, expiry, subject, project, and permitted Firebase sign-in provider.
- The Worker derives `user_id` exclusively from the verified token. Never accept a request-body UID as ownership authority.
- Every profile route validates that the profile index belongs to the authenticated UID before reading or writing.
- Use bounded request bodies, pagination, batch limits, rate limits, idempotency keys for retryable mutations, server timestamps, and sanitized error codes.
- Never log PINs, provider credentials, media-server tokens, Firebase tokens, device codes, user codes, or raw pairing nonces.
- Existing app adapters stay on Supabase until each route has implementation and parity tests.

## 1. Account, authentication, and device lifecycle

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/account/bootstrap` | POST | Firebase ID token | Existing trial initialization plus current account state | Create/verify account metadata idempotently; initialize immutable trial only once |
| `/v1/account` | GET | Firebase ID token | Current AuthRepository account/session state | Return minimal account state and server-derived entitlements; no client UID |
| `/v1/account` | DELETE | Firebase ID token + recent reauth | Supabase Edge Function `delete-account` | Start retryable deletion job; revoke sessions/devices; delete owned D1/R2/Firestore data; delete Firebase Auth identity last |
| `/v1/devices` | POST | Firebase ID token | `register_current_device` | Upsert stable installation ID and client/platform/device metadata |
| `/v1/devices` | GET | Firebase ID token | Device management requirement | List only devices owned by current UID |
| `/v1/devices/:installationId` | DELETE | Firebase ID token | New replacement behavior | Revoke only the caller's device |
| `/v1/device-link/sessions` | POST | TV device challenge, no account session | `start_device_login_session` | Generate high-entropy device code, short user code, nonce binding, expiry, polling interval; persist only hashes |
| `/v1/device-link/sessions/:deviceCode` | GET | TV device challenge | `poll_tv_login_session` | Return pending/approved/expired/consumed state; rate-limit and bind to nonce |
| `/v1/device-link/approve` | POST | Firebase ID token | Browser/account approval replacement | Explicitly approve an existing registered account; derive approved UID from token |
| `/v1/device-link/exchange` | POST | One-time device code + nonce | `tv-logins-exchange` | Atomically consume once and issue narrowly scoped Firebase custom-token session; never create an anonymous account |

Device-link custom-token acceptance must be narrowly constrained. The Worker must reject anonymous users and must only accept the custom-token flow when a server-issued claim proves the session came from a valid, approved, unexpired, one-time device-link exchange.

## 2. Profiles and profile security

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/profiles` | GET | Firebase ID token | `sync_pull_profiles` | Return profiles ordered by profile index |
| `/v1/profiles` | PUT | Firebase ID token | `sync_push_profiles` | Upsert bounded profile payloads; enforce max profile count and UID ownership |
| `/v1/profiles/:profileIndex` | DELETE | Firebase ID token | `sync_delete_profile_data` | Delete one owned profile and its dependent sync data; preserve account data |
| `/v1/profiles/locks` | GET | Firebase ID token | `sync_pull_profile_locks` | Return lock state for caller-owned profiles only |
| `/v1/profiles/:profileIndex/pin/verify` | POST | Firebase ID token | `verify_profile_pin` | Server-side hash verification, throttling, lockout and generic failure response |
| `/v1/profiles/:profileIndex/pin` | PUT | Firebase ID token | `set_profile_pin` | Store verifier material only; verify current PIN where required |
| `/v1/profiles/:profileIndex/pin` | DELETE | Firebase ID token; recent reauth for password recovery | `clear_profile_pin`, `clear_profile_pin_with_account_password` | Support current-PIN and recent Firebase reauthentication paths; never send account password to the Worker |

Legacy PIN hash format and lockout policy are unknown. Define and test a new secure server-side verifier; do not pretend it is byte-for-byte compatible with an unavailable legacy hash.

## 3. Profile settings, add-ons, plugins, and collections

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/profiles/:profileIndex/settings?platform=` | GET/PUT | Firebase ID token | `sync_pull_profile_settings_blob`, `sync_push_profile_settings_blob` | Preserve platform-specific JSON blob, unknown keys, signature/version and sync-origin behavior |
| `/v1/profiles/:profileIndex/provider-credentials` | GET/PUT | Firebase ID token | `sync_pull_provider_credentials`, `sync_push_provider_credentials` | Encrypt at rest; return only to owner; no secret logging |
| `/v1/profiles/:profileIndex/addons` | GET/PUT | Firebase ID token | PostgREST `addons` table, `sync_push_addons` | Preserve manifest URL, name, enabled state and sort order |
| `/v1/profiles/:profileIndex/plugins` | GET/PUT | Firebase ID token | PostgREST `plugins` table, `sync_push_plugins` | Preserve manifest URL ordering and platform gating; scraper code remains locally cached/fetched from its repository |
| `/v1/profiles/:profileIndex/collections` | GET/PUT | Firebase ID token | `sync_pull_collections`, `sync_push_collections` | Preserve full JSON blob and unknown fields; use version/conflict handling |
| `/v1/profiles/:profileIndex/home-catalog?platform=` | GET/PUT | Firebase ID token | `sync_pull_home_catalog_settings`, `sync_push_home_catalog_settings` | Preserve platform scope, JSON merge, ordering, enabled flags, custom titles and collection entries |

The shared admin Firestore `addons/{addonId}` catalogue is separate from profile-installed add-ons and plugin repositories. Do not combine these resources.

## 4. Library and viewing sync

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/profiles/:profileIndex/library` | GET | Firebase ID token | `sync_pull_library` | Bounded snapshot pagination |
| `/v1/profiles/:profileIndex/library/delta?since=` | GET | Firebase ID token | `sync_get_library_delta_cursor`, `sync_pull_library_delta` | Stable event cursor and bounded delta |
| `/v1/profiles/:profileIndex/library` | PUT | Firebase ID token | `sync_push_library_items` | Batched upserts with sync-origin metadata |
| `/v1/profiles/:profileIndex/library/delete` | POST | Firebase ID token | `sync_delete_library_items` | Tombstone/delete by stable item keys |
| `/v1/profiles/:profileIndex/watch-progress` | GET | Firebase ID token | `sync_pull_watch_progress` | Snapshot pagination and optional last-watched filter |
| `/v1/profiles/:profileIndex/watch-progress/delta?since=` | GET | Firebase ID token | `sync_get_watch_progress_delta_cursor`, `sync_pull_watch_progress_delta` | Stable event cursor and bounded delta |
| `/v1/profiles/:profileIndex/watch-progress` | PUT | Firebase ID token | `sync_push_watch_progress` | Batch progress upserts |
| `/v1/profiles/:profileIndex/watch-progress/delete` | POST | Firebase ID token | `sync_delete_watch_progress` | Delete/tombstone by progress keys |
| `/v1/profiles/:profileIndex/watched` | GET | Firebase ID token | `sync_pull_watched_items` | Snapshot pagination |
| `/v1/profiles/:profileIndex/watched/delta?since=` | GET | Firebase ID token | `sync_get_watched_items_delta_cursor`, `sync_pull_watched_items_delta` | Stable event cursor and bounded delta |
| `/v1/profiles/:profileIndex/watched` | PUT | Firebase ID token | `sync_push_watched_items` | Batched watched-state upserts |
| `/v1/profiles/:profileIndex/watched/delete` | POST | Firebase ID token | `sync_delete_watched_items` | Delete/tombstone by content/season/episode identity |

Keep snapshot and delta semantics distinct. Do not reset local cursors or caches during cutover. Delete events must remain visible long enough for offline clients to receive tombstones.

## 5. Media servers and membership

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/profiles/:profileIndex/media-servers` | GET/PUT | Firebase ID token | `sync_pull_media_servers`, `sync_push_media_servers` | Preserve server metadata/library selection; encrypt server tokens at rest |
| `/v1/membership/access` | GET | Firebase ID token | `get_my_member_access` | Read authoritative entitlement state from approved Firestore/Worker source |
| `/v1/membership/overview` | GET | Firebase ID token | `get_my_membership_overview` | Return subscription/grant overview from server-controlled data |

The membership source of truth must be reconciled with existing Firestore `users/{uid}` entitlement/trial records. Do not let clients write tier, premium, trial, subscription, or grant fields.

## 6. Profile asset catalogues and R2 delivery

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/assets/avatars` | GET | Firebase ID token or explicitly public standard-catalog policy | `get_avatar_catalog` | Preserve standard avatar catalogue |
| `/v1/assets/member-avatars` | GET | Firebase ID token | `get_member_profile_avatar_catalog` | Verify profile-avatar entitlement |
| `/v1/assets/member-backgrounds` | GET | Firebase ID token | `get_member_profile_background_catalog` | Verify background entitlement and return landscape/portrait metadata |
| `/v1/assets/:type/:assetId` | GET | Firebase ID token | Supabase Storage authenticated download | Authorize asset and issue short-lived R2 URL or proxy bytes |

R2 object keys replace Supabase Storage paths for buckets `membership-profile-avatars` and `membership-profile-backgrounds`. Preserve asset versions, local caches, one-day member-avatar sharing semantics where required, and portrait-to-landscape fallback. Member assets must not be made public as a shortcut.

## 7. Watch Party

| Proposed route | Method | Auth | Legacy source/operation | Required behavior |
|---|---|---|---|---|
| `/v1/party/preview?code=` | GET | Public code preview with strict rate limits | `watch_party_preview` | Reveal only safe preview data |
| `/v1/party` | POST | Firebase ID token | `watch_party_create` | Create authorized room and host membership |
| `/v1/party/join` | POST | Firebase ID token | `watch_party_join` | Validate code, capacity, expiry and membership |
| `/v1/party/:partyId/profile` | PUT | Firebase ID token | `watch_party_link_profile` | Link caller's current profile/member |
| `/v1/party/:partyId/heartbeat` | POST | Firebase ID token | `watch_party_heartbeat` | Update membership/clock state |
| `/v1/party/:partyId/state` | PUT | Firebase ID token | `watch_party_update` | Enforce host/control policy and sequence |
| `/v1/party/:partyId/leave` | POST | Firebase ID token | `watch_party_leave` | Remove caller membership |
| `/v1/party/:partyId/end` | POST | Firebase ID token | `watch_party_end` | Host-only room termination |
| `/v1/party/:partyId/host-only` | PUT | Firebase ID token | `watch_party_set_host_only` | Change room control policy |
| `/v1/party/:partyId/members/:memberId` | DELETE | Firebase ID token | `watch_party_remove_member` | Host-authorized member removal |
| `/v1/party/:partyId/messages` | GET/POST | Firebase ID token | `watch_party_list_messages`, `watch_party_send_message` | Preserve client message ID and ordered history |
| `/v1/party/clock` | GET | Public or authenticated; decide explicitly | `watch_party_clock` | Return server clock |
| `/v1/party/enabled` | GET | Public or authenticated; decide explicitly | `watch_party_enabled` | Return server feature availability |
| `/v1/party/:partyId/connect` | WebSocket | Firebase ID token + room membership | Supabase private Realtime channel | Durable Object presence, heartbeat, reconnect and broadcasts |

The Durable Object must preserve event names: `state`, `state_request`, `status`, `control`, `member_joined`, `member_left`, `ended`, `media`, `stream`, and `chat`. Presence identity is the member ID, but authorization is derived from verified account/session and server membership, never from the client-supplied member ID alone.

## 8. Existing Firestore/Worker routes that remain separate

- Existing Worker premium code creation, redemption, status, trial initialization and health endpoints remain in place during this phase.
- Firestore `admins/{uid}`, `users/{uid}`, `premium_codes/{sha256(code)}`, and shared `addons/{addonId}` remain separate from D1 account sync.
- The Admin App currently writes premium codes directly using raw-code document IDs. It must be changed to call the existing Worker admin endpoint before its history UI can be considered compatible with the Worker redemption model.
- Admin user management, TV pairing approval, and account-deletion screens are not verified as implemented.

## 9. D1 draft mapping and exclusions

The current draft `premium-worker/schema/0001_account_data.draft.sql` defines 18 tables for account/profile ownership, settings, PIN verifier material, installed add-ons/plugins, library, watch progress, watched items, collections, home catalogue settings, encrypted provider credentials, encrypted media-server tokens, devices, device-link sessions, sync events, idempotency keys, and retryable account-deletion jobs.

Not placed in this D1 draft:
- Premium codes, admin roles, trial and entitlement source of truth: Firestore.
- Shared add-on catalogue: Firestore.
- Realtime party room/presence coordination: Durable Objects.
- Uploaded/member avatar and background image bytes: R2.
- Member asset catalogue metadata: storage location still requires a separate reviewed decision.
- Third-party Trakt/Simkl/TMDB/MDBList/debrid service data that is not part of the Supabase account sync contract.

## 10. Verification gates

Before any mobile adapter switch:
1. Implement route contract tests for UID/profile ownership, cross-account rejection, body bounds, pagination, batch limits, JSON validation and idempotency.
2. Test snapshot/delta cursor ordering, tombstone retention, sync-origin echo prevention and concurrent updates.
3. Test PIN verification lockout, credential encryption/key rotation and media-server token confidentiality.
4. Test device-link nonce binding, brute-force limits, expiry, approval, one-time consumption, replay rejection and Firebase custom-token claims.
5. Test account deletion retries, partial failure recovery, shared-resource preservation and Firebase Auth deletion last.
6. Test Durable Object room membership, presence transitions, heartbeat, reconnect and every event type.
7. Run Worker tests and Android/iOS builds before switching one adapter at a time.
8. Keep the draft SQL unapplied until a separate D1 resource/binding review and explicit deployment approval.



## 11. Membership source-of-truth gap — unresolved

The legacy member-access RPC returns a small tier/entitlement pair, while the legacy membership-overview RPC returns billing-provider, subscription, verified/supporter and grant/lifetime fields. The current Worker only calculates premium-code/trial access from Firestore `users/{uid}` and does not implement the full overview model.

Do not infer a subscription or supporter grant from a premium-code activation. Before implementing these routes, define the authoritative membership record and a trusted update source (verified provider webhook or admin grant workflow). Until then, `GET /v1/membership/overview` must return an explicit unavailable/not-configured result rather than invented values. Client writes to membership, premium, trial, billing or grant fields remain forbidden.


## 12. First Worker account/device endpoints — implemented in source, not enabled

The following handlers are now present in `premium-worker/src/index.ts`:

| Route | Implementation | Notes |
|---|---|---|
| `POST /v1/account/bootstrap` | Implemented | Requires verified Firebase email/password ID token; verifies Firebase account creation time; creates the D1 account row idempotently; rejects non-active account rows; initializes the immutable 7-day trial through the existing create-only Firestore logic |
| `POST /v1/devices` | Implemented | Requires an active D1 account; validates bounded JSON and device metadata; derives owner UID only from verified token; idempotently registers/updates the caller's installation |
| `GET /v1/devices` | Implemented | Returns only active device records belonging to the verified UID, newest activity first, maximum 100 |

### Enablement and security limits

- `Env.DB` is optional in the Worker type so the current deployment remains unchanged. No D1 binding exists in `wrangler.toml`; these new routes return HTTP 503 until a separately reviewed D1 database/binding and schema are provisioned.
- The SQL draft remains outside Wrangler's active migrations directory and has not been applied.
- Device registration is inventory metadata only. No device-revocation endpoint was added because the current authentication middleware does not bind Firebase sessions to installation IDs or invalidate existing refresh tokens. Do not treat this registry as a remote sign-out/security revocation feature.
- Account bootstrap is retry-safe: the account row uses create-only conflict handling, and trial initialization uses the existing immutable create-only Firestore write.
- Existing premium routes and mobile Supabase adapters remain unchanged.


## 13. Account/device data-access test coverage

- Account/device persistence and request validation are isolated in `premium-worker/src/account-device.ts`.
- `premium-worker/test/account-device.test.mjs` exercises the data-access layer using a D1-compatible mock backed by in-memory SQLite.
- Verified cases: missing D1 binding, missing/inactive account, idempotent device registration/update, owner-scoped device listing, revoked installation ID reuse rejection, malformed/oversized/invalid device requests, and ignoring body-supplied UID.
- CI run `43376689122`: TypeScript check passed; 9 schema tests passed; 6 account/device mock tests passed.
- These are unit/contract tests for the data-access module, not full Worker HTTP/JWT or live D1 integration tests. No live database is configured.


## 14. Worker HTTP and Firebase-token test coverage

- Added `premium-worker/test/http-auth.test.mjs`, exercising the actual Worker fetch entry point with generated RS256 test tokens and a mocked Secure Token JWKS response.
- Verified: public health route; missing token rejected; anonymous provider rejected; account/device routes return 503 while D1 is absent; authenticated device registration and owner-scoped listing use the UID from the verified token, not a request-body UID.
- Latest CI run `43377044568`: TypeScript passed; 9 schema tests passed; 6 SQLite-backed D1 data-access tests passed; 5 HTTP/auth tests passed (20 total, 0 failures).
- These tests use test keys and SQLite mocks. They do not replace live Firebase, Firestore, or Cloudflare D1 integration tests.


## 15. Security review gate before D1 provisioning

Detailed findings are recorded in `docs/D1_SECURITY_REVIEW.md`. Do not apply the current schema draft or enable D1 routes until provider/media-server encryption, PIN KDF/lockout, device-link nonce/replay/redirect controls, UID/profile ownership checks, deletion orchestration, sync/idempotency retention, rate limits, and generic JSON secret exclusion are addressed. Confirm `FIREBASE_WEB_API_KEY` runtime configuration before account bootstrap is enabled.


## Worker routes implemented in source — 2026-11-13

The existing Worker now exposes the following D1-backed profile routes on the approved setup branch. They remain unavailable at runtime until D1 and the required Worker secrets are provisioned:

| Route | Method | Behavior |
|---|---|---|
| `/v1/profiles/{profileIndex}/pin?action=set` | POST | Set/replace PIN; requires a password-provider Firebase token authenticated within the last 5 minutes |
| `/v1/profiles/{profileIndex}/pin?action=verify` | POST | Verify PIN; persisted 5-failure/15-minute lockout plus account/profile and IP rate limits |
| `/v1/profiles/{profileIndex}/pin?action=clear` | POST | Clear PIN; requires recent Firebase reauthentication |
| `/v1/profiles/{profileIndex}/provider-credentials` | PUT | Save provider credential JSON encrypted with AES-256-GCM |
| `/v1/profiles/{profileIndex}/provider-credentials?provider={provider}` | GET | Decrypt and return only the authenticated owner's selected provider credential |
| `/v1/profiles/{profileIndex}/media-servers` | PUT | Save media-server metadata separately from an AES-256-GCM-encrypted access token |
| `/v1/profiles/{profileIndex}/media-servers` | GET | Return at most 100 owner-scoped media-server records and their decrypted tokens |

Shared controls:
- UID comes only from the verified Firebase ID token. Profile ownership is checked against D1 before access.
- Profile indices are bounded; request bodies are bounded; credential values are never written to application logs.
- PIN set/clear require recent reauthentication. PIN verification uses the persisted lockout plus D1-backed account/profile and IP rate-limit windows.
- D1 rate-limit state is stored in the new `api_rate_limits` draft table. A retention/cleanup task is still required before production operation.
- PIN and data-encryption key rings are separate Worker secrets. Missing configuration fails closed with 503.
- The D1 SQL remains a draft and is not an active Wrangler migration. No D1 database/binding or key secrets have been created, and no mobile adapter has been switched.
- API response shapes are a first implementation contract and still need reconciliation with the exact legacy sync serializer before mobile integration.


## Profile and settings routes — implementation update (2026-11-13)

The following profile routes are implemented in Worker source (not deployed and unavailable until D1 is separately provisioned):

| Route | Method | Contract |
|---|---|---|
| /v1/profiles | GET | Returns a JSON array of the authenticated user's profiles in ascending profile-index order, including profile and PIN-lock metadata |
| /v1/profiles | PUT | Upserts at most six profile payloads using the verified legacy ProfilePushPayload fields |
| /v1/profiles/{profileIndex} | DELETE | Deletes only the authenticated user's selected profile; dependent D1 rows cascade through profile ownership foreign keys |
| /v1/profiles/locks | GET | Returns JSON array of profile PIN-enabled and lock-expiry states |
| /v1/profiles/{profileIndex}/settings?platform=mobile | GET | Returns a serializer-compatible JSON array containing profile_id, platform, settings_json, and updated_at; empty array when absent |
| /v1/profiles/{profileIndex}/settings?platform=mobile | PUT | Stores the complete settings JSON blob without dropping unknown/future keys |

All routes require a verified Firebase email/password token, active D1 account and, for profile-specific operations, an owned profile. Request sizes are bounded and account/profile/IP rate limits apply. Worker CORS now allows GET, POST, PUT, DELETE and OPTIONS. The draft D1 schema remains unapplied. Mobile Supabase adapters remain untouched.


## Profile API verification result — 2026-11-13

- GitHub Actions run 43381569837 passed TypeScript and all 52 Worker tests, including profile/settings HTTP and D1-mock tests.
- Test URL: https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43381569837
- No live D1 database/binding, production secrets, mobile adapter, or deployment was used in this verification.
