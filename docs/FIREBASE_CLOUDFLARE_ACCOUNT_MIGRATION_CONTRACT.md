# Firebase + Cloudflare Account Migration Contract (Draft)

Last reviewed: 2026-11-13 (Asia/Manila)
Repository: `bugoyweak7/WatchAtHomeV2`
Branch: `setup/firebase-cloudflare-zero-cost`
Status: Design contract only — not deployed and not yet an implementation specification for production.

## 1. Purpose and non-negotiable rules

Move account identity to Firebase Authentication and application-owned account data/APIs to Cloudflare while preserving the current app experience. Firebase Auth is the identity provider. Cloudflare Worker is the trusted API boundary. D1 is the proposed store for high-volume, user-owned application records. Firestore remains for the existing admin/add-on/premium documents unless a separately reviewed migration changes that decision. R2 is only for actual uploaded file/image objects; do not put video/movie binaries in Firestore or D1. Durable Objects remain the intended option for Watch Party realtime coordination.

Rules:
- Email/password registration and sign-in only for normal account creation. No anonymous/guest account creation.
- Device-link sign-in is permitted only as a server-issued session for an existing registered email/password account that explicitly approved the pairing. It must not create an independent anonymous user.
- The client never chooses the authoritative user ID. Derive ownership from a verified Firebase ID token.
- Never expose service-account credentials, signing keys, or privileged D1/Firestore access to mobile clients.
- Preserve existing local data and sync behavior during migration. Do not delete or reset local account data on a failed sign-in, token exchange, or backend request.
- Keep the current Supabase adapters until each replacement endpoint is implemented, tested, and switched over independently.
- No production deployment, Firebase Console change, Cloudflare resource creation, or data migration is authorized by this document.

## 2. Verified current app dependencies

The current User App source contains these backend dependencies:

| Feature | Verified current integration |
|---|---|
| Email/password auth and session | Supabase Auth in `AuthRepository` |
| Account deletion | Supabase Edge Function `delete-account` |
| Device-link start/poll | PostgREST RPCs `start_device_login_session`, `poll_tv_login_session` |
| Device-link exchange | Supabase Edge Function `tv-logins-exchange`, imports Supabase access/refresh session |
| Profiles | RPCs `sync_pull_profiles`, `sync_push_profiles` |
| Profile data deletion | RPC `sync_delete_profile_data` |
| Profile PIN | RPCs `verify_profile_pin`, `set_profile_pin`, `clear_profile_pin`, `clear_profile_pin_with_account_password` |
| Profile locks | RPC `sync_pull_profile_locks` |
| Add-ons | PostgREST table `addons`; RPC `sync_push_addons` |
| Library | RPCs `sync_pull_library`, `sync_get_library_delta_cursor`, `sync_pull_library_delta`, `sync_push_library_items`, `sync_delete_library_items` |
| Watch progress | RPCs `sync_get_watch_progress_delta_cursor`, `sync_pull_watch_progress_delta`, `sync_pull_watch_progress`, `sync_push_watch_progress`, `sync_delete_watch_progress` |
| Watched items | RPCs `sync_get_watched_items_delta_cursor`, `sync_pull_watched_items_delta`, `sync_pull_watched_items`, `sync_push_watched_items`, `sync_delete_watched_items` |
| Membership | RPCs `get_my_member_access`, `get_my_membership_overview` |
| Watch Party | RPCs including `watch_party_preview`, `watch_party_send_message`, `watch_party_list_messages`, `watch_party_clock`, `watch_party_enabled`; Party repository also imports Supabase Realtime Presence |

The app's ordered profile sync also coordinates profile settings, provider credentials, add-ons, plugins, library, active watch source, collections, home-catalog settings, and media servers. Their full serialization and mutation contracts still need to be inventoried before writing production D1 migrations.

## 3. Proposed Worker API contract

All authenticated endpoints require:
`Authorization: Bearer <Firebase ID token>`
The Worker validates signature, issuer, audience, expiry, subject, and Firebase project. It must reject anonymous identities and derive `uid` from the verified token. Request bodies must not accept a caller-supplied owner UID.

Common response envelope:
- Success: JSON response with explicit resource/result fields.
- Error: `{ "error": { "code": "STABLE_MACHINE_CODE", "message": "Safe user-facing message", "requestId": "..." } }`
- No-store cache policy for account and entitlement responses.
- Enforce JSON content type, body-size limits, rate limits, and strict input validation.

### Account lifecycle

| Method and route | Auth | Purpose |
|---|---|---|
| `POST /v1/account/bootstrap` | Firebase user | Idempotently create/verify the user's D1 account root and required initial metadata after successful email/password registration. Must not reset an existing trial or overwrite existing user data. |
| `GET /v1/account` | Firebase user | Return only the caller's account metadata and lifecycle state. |
| `POST /v1/account/export` | Firebase user | Start an authenticated export job if/when export is implemented; not required for first auth cutover but must be designed before deletion launch. |
| `DELETE /v1/account` | Firebase user + recent-authentication check | Start an idempotent, auditable deletion workflow. Return a deletion job/status; do not claim deletion complete until all required stores are confirmed. |
| `GET /v1/account/deletion/{jobId}` | Firebase user | Return status for the caller's own deletion job only. |

Account deletion must use the verified token UID, require recent authentication / reauthentication for sensitive deletion, and execute server-side cleanup in a retryable state machine. The workflow must inventory and remove or legally retain: D1 account/profile/settings/sync rows, Firestore user-owned documents, R2 objects owned by that UID, device registrations and pairing sessions, membership/premium references as appropriate, and Firebase Auth identity. Shared catalogue/add-on records and other users' data must never be deleted. Keep a minimal deletion audit record without retaining unnecessary personal data. Local app cleanup happens only after the server confirms the deletion request has safely entered its accepted state; local cleanup failure must be recoverable and must not recreate the account.

### Device-link flow

Pairing must bind one TV/device session to one already-registered account. Use cryptographically secure random identifiers/secrets, short expiry, one-time exchange, rate-limited code attempts, nonce binding, and explicit user approval. Never place a Firebase ID token in a QR code or user-visible pairing URL.

| Method and route | Auth | Purpose |
|---|---|---|
| `POST /v1/device-link/sessions` | Device bootstrap secret / constrained unauthenticated rate-limited request | Create a pending session; accept device metadata and a client-generated nonce; return short user code, verification URL, poll interval, expiry, and opaque device-session secret. |
| `POST /v1/device-link/sessions/{id}/approve` | Existing registered Firebase user | Approve the pending session after the user signs in in a browser/app and confirms the device. Server binds the session to the verified Firebase UID. |
| `GET /v1/device-link/sessions/{id}` | Opaque device-session secret + nonce | Poll pending/approved/expired state. Do not expose account email or UID to the unapproved device. |
| `POST /v1/device-link/sessions/{id}/exchange` | Opaque device-session secret + nonce; approved session | Atomically consume the approved session and return a short-lived Firebase custom token for the already-approved UID. A session can be exchanged exactly once. |

The Worker must mint the custom token using its server-held service-account signing key, only after verifying the approved session. The app signs in using Firebase custom-token authentication. The Worker ID-token validator must explicitly support this narrowly scoped device-link custom-auth token while still rejecting anonymous users; it must validate a trusted server-issued claim or equivalent server-side session record. Do not simply allow every `sign_in_provider=custom` token. The custom token must resolve to the existing registered user's UID and must never create an arbitrary new identity. Revoke/expire outstanding sessions on cancellation, timeout, account deletion, or security events.

### User data API and sync

Use versioned endpoints grouped by bounded resource and cursor-based sync. The initial API contract must cover the existing operations without changing app semantics:

- `/v1/profiles`: pull/push profile records; profile deletion; PIN verification/set/clear; account-password confirmation for the existing sensitive PIN-clear operation; profile-lock state.
- `/v1/profiles/{profileId}/addons`: pull and push installed add-on settings (the shared admin-published catalogue remains a separate shared resource).
- `/v1/profiles/{profileId}/library`: paginated pull, delta cursor, delta pull, batch upsert, batch delete.
- `/v1/profiles/{profileId}/watch-progress`: current pull, delta cursor, delta pull, batch upsert, batch delete.
- `/v1/profiles/{profileId}/watched-items`: paginated pull, delta cursor, delta pull, batch upsert, batch delete.
- `/v1/membership/access` and `/v1/membership/overview`: server-calculated membership/entitlement response; client cannot write entitlement fields.
- `/v1/party/*`: preview, create/join/leave, message history/send, playback clock and feature availability; realtime presence/messages use the separately configured realtime service/ Durable Object after the current Supabase Realtime contract is fully mapped.

All profile-scoped endpoints must verify that the profile belongs to the authenticated UID. Use bounded pagination, max batch sizes, stable sort keys, delta event IDs/cursors, idempotency keys for retryable mutations, and server timestamps. Never trust `profileId` alone as authorization. Preserve sync-origin client IDs where needed to prevent echo loops. Return conflict/version information where concurrent edits can occur.

### Other profile-sync resources requiring a follow-up inventory

Before implementing their adapters, inspect the actual model serialization and all current read/write call sites for:
- profile settings and preferences;
- provider credentials (must be encrypted at rest with server-managed key material; never log plaintext);
- plugins and user plugin configuration;
- collections and collection folders;
- home-catalog settings;
- media-server metadata;
- any remaining sync events/cursors and device registrations.

Do not migrate Trakt, Simkl, MDBList, TMDB, debrid providers, or other third-party provider APIs as if they were Supabase account storage; distinguish external provider integrations from user-owned app sync records.

## 4. Proposed D1 logical ownership model (not yet a SQL migration)

Every user-owned table must contain `user_id` as a non-null owner key and use composite indexes/constraints that include it. Profile-scoped rows must also include `profile_id`. Proposed logical groups:

- `accounts`: Firebase UID primary key, created/updated timestamps, lifecycle/deletion status.
- `profiles`: profile ID, owner UID, profile index, profile metadata and version.
- `profile_settings`: profile-scoped setting key/value or validated structured payload, with schema version.
- `profile_pin_credentials`: profile-owned PIN verifier material; never store raw PINs. Use a dedicated password-hashing scheme and rate-limit verification.
- `profile_addons`: profile-owned manifest URL/name/enabled/sort order; distinct from shared catalogue.
- `profile_plugins`: profile-owned plugin configuration and enabled state.
- `library_items`: profile-owned library records and sync metadata.
- `watch_progress`: profile-owned progress records keyed by stable progress key.
- `watched_items`: profile-owned watched records keyed by content/season/episode identity.
- `collections` and `collection_items`: profile-owned collection metadata and membership.
- `home_catalog_settings`: profile-owned catalogue layout/settings.
- `provider_credentials`: profile-owned encrypted third-party credentials; key version and encryption metadata required.
- `media_servers`: profile-owned server metadata; secrets must be encrypted or stored in a separate protected secret store.
- `sync_events` and resource cursors: owner/profile-scoped ordered delta history with retention policy.
- `registered_devices`: owner UID, device identity/metadata, last-seen/revocation state.
- `device_link_sessions`: hashed session secret/code, nonce hash, status, approved UID, expiry, consumed timestamp, attempt counters. Store only hashes of bearer secrets and pairing codes where feasible.
- `account_deletion_jobs`: owner UID, state, step cursor, retry count, timestamps and sanitized failure code.

Final columns, types, uniqueness constraints, indexes, retention, encryption approach, and migration SQL must be derived from actual model serializers and existing Supabase schema/migrations before applying a D1 migration. This is a logical inventory, not a claim that these tables already exist.

## 5. Firestore boundary

Keep the currently documented Firestore responsibilities until separately reviewed:
- `admins/{uid}`: active admin role, server-checked.
- `users/{uid}`: existing premium/trial mirror fields and approved account metadata.
- `premium_codes/{hash}`: Worker-managed premium code documents; mobile clients must not write these.
- `addons/{addonId}`: shared published catalogue, not per-user copies.

Firestore rules must deny client writes to premium/trial/role fields and premium-code documents. Admin app access remains subject to Firebase Auth and active-admin checks; privileged operations must be checked again by the Worker. The current admin app's direct add-on catalogue workflow must be reviewed before changing its Firestore access pattern.

## 6. Migration sequence and gates

1. Complete source/schema inventory: read every remaining Supabase RPC, Edge Function, Realtime channel, table, storage bucket and RLS policy contract. The app repository currently does not contain the Supabase database migration/Edge Function source, so obtain an authorized schema export before writing compatibility migrations.
2. Freeze and document API request/response schemas, ownership checks, error codes, limits, retention, and encryption decisions.
3. Create D1 schema and local Worker tests only after schema source is available. Add migration rollback/backup/export procedure.
4. Implement account bootstrap and Firebase token verification; test password and custom-token sessions, expiry, wrong-project tokens, anonymous rejection, cross-user access rejection, and account deletion retry behavior.
5. Implement device-link flow and browser approval UI; test nonce mismatch, brute-force rate limits, expiry, replay, cancellation, double exchange, wrong UID, and revoked session.
6. Implement feature APIs and contract tests one resource at a time. Keep Supabase adapters active until parity is proven.
7. Dual-read/compare or controlled migration as appropriate; never dual-write without idempotency and reconciliation design.
8. Switch mobile repositories incrementally, preserving local cache and sync cursors.
9. Run Android and iOS builds, unit/integration tests, device-link tests, and account lifecycle tests.
10. Remove Supabase Auth/data/Realtime/Functions dependencies only after a verified zero-use inventory and a separate final approval. No production deployment without explicit approval.

## 7. Current blockers / required evidence

- The app repository does not contain the Supabase SQL migrations, RLS policies, Edge Function source, or a complete export of the current schema. These are required to guarantee exact behavior and safe data migration.
- Cloudflare account resources/bindings and Firebase Console state have not been verified in this source-only workflow.
- The current Worker has premium-code and trial endpoints only; it does not yet implement account bootstrap, device-link, user-data sync, or account deletion.
- The current Worker token verifier currently expects Firebase password sign-in provider. Device-link custom-token sessions require the narrowly scoped verifier extension described above.
- No D1 account schema has been created or applied.
- No code build/test or deployment is claimed by this document.

## 8. Acceptance criteria before Supabase removal

- All normal sign-ins are Firebase email/password; no anonymous/local UUID account path remains.
- Device-link authenticates only an existing registered account and uses one-time, expiring, nonce-bound exchange.
- Every protected API derives UID from verified token and enforces ownership at query/write level.
- All currently supported profile settings, profiles, add-ons, plugins, library, collections, watch progress, watched items, media servers, provider credentials, membership, and Watch Party behavior have tested replacements.
- Account deletion covers all owned data and Firebase Auth identity, is retryable/idempotent, and never deletes shared/other-user data.
- Android/iOS builds and automated integration tests pass.
- Production data backup/export, rollback, and cutover plan are approved.


## 9. Supabase ownership clarification (user-confirmed)

The user confirmed they do not own or have a Supabase account for this integration. Treat Supabase as the legacy/default backend inherited from the upstream Nuvio source, not as a user-managed Supabase project. Do not block the project on the user creating a Supabase account or supplying credentials they do not have.

Implications:
- The app source already contains the Supabase client configuration and calls, so the replacement can be reverse-engineered from the client contracts, serializers, sync adapters, and feature behavior.
- The absence of an owner Supabase account means we cannot inspect or administer the upstream project's dashboard, SQL schema, RLS policies, logs, backups, or Edge Function source through the user's account.
- Do not claim that exact server-side behavior or existing remote user data can be exported from source code alone.
- Build the replacement backend from verified client request/response models and explicit product requirements; record any server behavior that cannot be inferred as an open compatibility question and test against the running legacy service only if the existing app's configured endpoint remains reachable and access is permitted.
- Existing user data migration is a separate issue from backend code migration. If the legacy service is reachable by a signed-in user, investigate a client-side, per-user export/import bridge using that user's own existing session and only data their existing authorization allows them to read. Never use a shared anon key as authorization to read other users' data, bypass RLS, or scrape the upstream database.
- If a user cannot authenticate to the old service or the old service is unavailable, do not promise automatic transfer of remote data. Preserve local data and provide an explicit export/import or fresh-account path after assessing the available data.

Updated next step: continue source-first reverse engineering of the legacy Supabase contracts inside the two approved repositories, inventory the data models and operations, then design a migration bridge and D1 schema. An upstream Supabase account is not a prerequisite for this source-level work.


## 9. Source-audit addendum — additional verified contracts (2026-11-13)

This addendum supplements the feature inventory above. These are client-visible contracts confirmed from the current User App branch; they do not establish the upstream SQL/RLS implementation.

### Additional endpoints and storage operations

| Feature | Verified legacy operation | Required replacement behavior |
|---|---|---|
| Plugin repositories | Read profile-filtered `plugins` table ordered by `sort_order`; push through `sync_push_plugins` | Preserve profile scope, repository URL ordering, and local scraper-code cache semantics |
| Home catalogue settings | `sync_pull_home_catalog_settings`, `sync_push_home_catalog_settings` with profile and platform keys | Preserve platform-specific blobs, local/remote JSON merge, catalogue order, enabled state, custom titles, and collection entries |
| Media servers | `sync_pull_media_servers`, `sync_push_media_servers` | Preserve server/library metadata and profile merge behavior; treat serialized server tokens as secrets |
| Device registration | `register_current_device` with installation ID, client name/version, platform, and device name | Derive UID from verified Firebase token; support device listing/revocation and retention |
| Watch Party realtime | Private channel `watch-party:<partyId>`, member-keyed presence, broadcast events | Durable Object room authorization, presence, fan-out, reconnect behavior, and compatible event payloads |

### Credential-handling requirement

The current `SyncedServer` serialization includes a `token` field. The replacement must not store plaintext server tokens in D1 or logs. Use authenticated encryption with key material held outside D1, define rotation/versioning, and ensure API responses reveal credentials only to the owning Firebase UID/profile when required. The same no-secret-logging and strict ownership rules apply to provider credentials.

### Separate catalogue concepts

Keep these three concepts separate:
1. Shared admin-managed add-on catalogue in Firestore `addons/{addonId}`.
2. User-installed add-ons in the legacy profile-filtered `addons` table and `sync_push_addons`.
3. Plugin repositories in the profile-filtered `plugins` table and `sync_push_plugins`.

Do not merge them into one D1 table or assume that shared catalogue publication equals a user's installed add-on selection.

### Watch Party event contract

The full client broadcast set is `state`, `state_request`, `status`, `control`, `member_joined`, `member_left`, `ended`, `media`, `stream`, and `chat`. Presence key is the party member ID. The channel is private; broadcast acknowledgements and own-broadcast delivery are disabled. Any replacement must preserve server-side membership checks and private-room isolation rather than trusting client-supplied party/member IDs.

### Platform limitation

The inspected Android Play Store and iOS App Store plugin repository implementations are intentionally unavailable/no-op. The full plugin implementation is under `fullCommonMain`; keep current platform gating unless product requirements are explicitly changed.


## 10. Source-audit addendum — protected profile assets (2026-11-13)

The current User App also depends on Supabase Storage for membership assets:

| Feature | Legacy metadata/API | Storage bucket | Required replacement |
|---|---|---|---|
| Standard avatars | `get_avatar_catalog` | Standard avatar URL handling is separate from member bucket | Preserve catalogue ordering and URL compatibility |
| Member avatars | `get_member_profile_avatar_catalog` | `membership-profile-avatars` | R2 object migration, authenticated download, membership entitlement check, one-day share URL behavior |
| Member profile backgrounds | `get_member_profile_background_catalog` | `membership-profile-backgrounds` | R2 object migration, authenticated download, landscape/portrait paths, asset-version cache, portrait fallback |

Do not expose member-only assets publicly. Use Worker authorization and short-lived signed R2 URLs or an authenticated streaming proxy. Keep metadata in the database and binary objects in R2. Preserve local cache behavior and version-based invalidation. Legacy bucket policies and object ACLs are unknown because the user does not own the upstream Supabase project.


## 11. Source-audit addendum — replace app-wide Supabase infrastructure (2026-11-13)

The migration must replace shared SDK infrastructure as well as feature APIs:

- Backend configuration/discovery: replace Supabase URL/publishable-key configuration and custom server discovery with the official Worker API configuration and a reviewed environment/capability document. Do not ship a Supabase anon key as the new API authorization mechanism.
- Reachability: replace Supabase REST endpoint health probes with a lightweight Worker health/capability probe that distinguishes internet failure from API/backend failure.
- Retry/fallback: explicitly define safe retry behavior, origin-failure handling, backoff/cooldown, and fallback routing for idempotent operations. Do not blindly retry mutations.
- Realtime: replace Phoenix/Supabase channel transport with authenticated Durable Object WebSocket rooms. Preserve Watch Party heartbeat, reconnect, membership, presence, broadcast and event semantics; validate the protocol rather than retaining Supabase-internal socket hooks.
- Storage: migrate member-only avatars/backgrounds to R2 with authenticated short-lived access; retain entitlement checks and cache/version behavior.

The source scan of 296 relevant common/full-common Kotlin files found the above client dependencies. It does not establish upstream server-side policies or prove all repository code has zero Supabase references.


## 12. Migration evidence decision — no upstream Supabase schema access (2026-11-13)

This section clarifies and supersedes any earlier wording that made an upstream Supabase schema export or dashboard access a prerequisite.

- The user does not own the upstream Supabase project and has no Supabase account for this integration. Do not ask for credentials or block progress on obtaining dashboard access.
- The implementation specification will be built from verified client source: serialized request/response models, RPC names/parameters, table reads/writes, local merge behavior, realtime event contracts, Storage object metadata, and product requirements.
- Any behavior that cannot be proven from client source (legacy RLS, SQL constraints/triggers, PIN hash algorithm, credential encryption, Storage ACLs, membership source-of-truth, and deletion cascade) must be marked as an explicit unknown and replaced with a secure newly defined behavior, not guessed as legacy parity.
- A source-derived D1 schema draft and local Worker tests may now be prepared without upstream schema export. Keep them local/documentation-only until reviewed. Do not claim exact legacy schema parity.
- Remote data transfer remains conditional on the user's existing app session and actual service reachability. Do not attempt privileged export or bypass legacy authorization.
- The first D1 migration must include explicit ownership constraints, profile scoping, indexes, delta/event cursors, tombstones, encrypted secret storage, retention/cleanup policy, and idempotent deletion semantics. Its shape must be tested locally before mobile adapter changes.
- No production Cloudflare resource, Firebase setting, production data, or deployment is authorized by this evidence decision.


## 13. Source-derived D1 schema draft and local SQLite validation (2026-11-13)

Added `premium-worker/schema/0001_account_data.draft.sql`. It is a draft file only; it is not registered as an active Wrangler migration, no D1 binding was added, and it has not been applied to any Cloudflare database.

The draft currently defines 18 tables and 9 indexes:
- Account lifecycle and profile ownership.
- Profile settings and separate PIN verifier material.
- Profile-installed add-ons and plugin repositories.
- Library items, watch progress, watched items, and deletion timestamps.
- Collections and platform-scoped home catalogue settings as JSON blobs to preserve unknown fields.
- Provider credentials and media-server tokens as ciphertext/nonce/key-version fields.
- Registered devices and hashed device-link challenge/code/nonce fields.
- Per-user/profile/resource sync event history and idempotency records.
- Retryable account deletion jobs retained separately from account-row cascades.

Local SQLite validation passed:
- All 18 application tables and 9 indexes created.
- Orphan profile references rejected.
- Invalid JSON payloads rejected.
- Duplicate profile add-on keys rejected.
- Partially populated encrypted media-server token fields rejected.
- Sync event cursor produced an ordered event ID.
- Account deletion cascaded owned rows while retaining the minimal deletion-job tombstone.
- Foreign-key check returned no violations.

This is structural validation only. It does not prove Cloudflare D1 deployment behavior, production query performance, API correctness, upstream schema parity, encryption implementation, or migration safety. The Worker API route matrix is documented separately in `docs/FIREBASE_CLOUDFLARE_API_ROUTE_MATRIX.md`.

Important exclusions: premium/admin/trial/entitlement records and the shared add-on catalogue remain Firestore; Watch Party realtime state remains Durable Objects; image binaries remain R2; member asset catalogue metadata placement is still undecided. Do not apply this draft until the API implementation, D1 resource configuration, rollback/backup plan, and separate deployment approval are complete.


## 14. Membership source-of-truth reconciliation (2026-11-13)

The client has two distinct membership reads:
- `get_my_member_access` returns only a tier and cosmetic entitlement list, used to gate member avatars/backgrounds and related cosmetics.
- `get_my_membership_overview` returns a much broader view: status/tier, verified/supporter timestamps, provider connection, subscription state/provider, current period end, cancellation state, monthly amount/currency, and active/lifetime grant metadata.

The current premium Worker reads and writes Firestore `users/{uid}` fields for premium-code access and immutable trial. Its current status response includes premium/trial flags, tier, a fixed cosmetic entitlement list, and trial/premium expiry timestamps. The inspected Worker does not implement the full subscription-provider, billing-period, supporter-verification, or grant/lifetime-overview model returned by the legacy overview RPC.

Therefore:
- Do not assume `users/{uid}` premium/trial fields alone can reproduce both membership RPCs.
- Keep premium-code/trial access distinct from supporter membership and subscription/grant status unless the product owner explicitly defines them as one entitlement model.
- Before replacing membership reads, define the authoritative membership record and the trusted process that provisions/updates it (e.g. verified provider webhook or explicit admin grant workflow). Client apps must never write these fields.
- Until the source of supporter/subscription/grant truth is identified, `/v1/membership/overview` is a contract placeholder and must not fabricate billing/provider values.


## 15. First Worker implementation checkpoint — account bootstrap and device registry (2026-11-13)

Implemented in source only:
- `POST /v1/account/bootstrap`: verify Firebase email/password ID token, verify account creation timestamp through Firebase Identity Toolkit, create D1 account row idempotently, reject non-active account state, and initialize the immutable 7-day trial using the existing Firestore create-only flow.
- `POST /v1/devices`: validate bounded JSON/device metadata and register/update a device under the UID derived from the verified Firebase token.
- `GET /v1/devices`: list at most 100 active device records scoped to the verified UID.

The Worker has no D1 binding in `wrangler.toml`, so these endpoints are intentionally disabled at runtime and return 503 until D1 setup and schema review are separately approved. The draft schema is still not an active migration.

No device-revocation route is exposed: marking a registry row revoked would not invalidate Firebase ID/refresh tokens because the current request authentication is not installation-bound. A true revocation workflow must be designed and tested before advertising remote sign-out.

No mobile client was switched, no D1 database was provisioned, no production resource was changed, and no deployment was performed.


## 16. Account/device test checkpoint (2026-11-13)

- The D1 access and device request-validation logic has been isolated in `premium-worker/src/account-device.ts`.
- Added SQLite-backed D1 mock tests for missing/inactive accounts, missing binding, owner-scoped listing, registration idempotency, revoked installation reuse, invalid/oversized request data, and caller-supplied UID rejection.
- GitHub Actions run `43376689122` passed: TypeScript compilation, 9 schema tests, and 6 mocked account/device tests.
- The test scope does not include full HTTP route dispatch, Firebase JWT/JWKS verification, Firebase Identity Toolkit/Firestore integration, or a real D1 database.
- Production enablement remains blocked until D1 is provisioned and the schema is reviewed/applied through an explicitly approved step.


## 17. Worker HTTP/auth test checkpoint (2026-11-13)

- The actual Worker `fetch` handler is now exercised by automated tests using generated RS256 Firebase-shaped test tokens and a mocked JWKS endpoint.
- Tests confirm missing tokens and anonymous sign-in providers are rejected; D1-dependent account/device routes fail closed with 503 when no D1 binding exists; device registration/listing remain scoped to the verified UID.
- CI run `43377044568` passed TypeScript compilation and 20 tests across schema, mocked D1 data access, and Worker HTTP/auth behavior.
- The test suite does not call the real Firebase project, Firestore, or Cloudflare D1. Production enablement still requires schema review and approved D1 provisioning.


## 18. D1 security review checkpoint (2026-11-13)

See `docs/D1_SECURITY_REVIEW.md` for the detailed findings. The draft is not ready for production application: provider/media-server AEAD encryption and key management are not implemented; the profile PIN KDF/lockout design is unresolved; device-link, account deletion, retention, rate limiting, and generic JSON secret-exclusion controls require further work. `FIREBASE_WEB_API_KEY` must also be confirmed in Worker runtime configuration before account bootstrap is enabled.

No D1 resource/binding was created and no schema was applied. Explicit approval is required before provisioning D1. Keep D1-dependent routes disabled (503) until the reviewed schema and binding are ready.


## 19. Versioned data-encryption primitive checkpoint (2026-11-13)

Added `premium-worker/src/data-crypto.ts` with AES-256-GCM, random 12-byte nonces, 128-bit authentication tags, UID/profile/resource/record-bound additional authenticated data, and versioned key-ring rotation support. CI run `43377463012` passed 5 crypto tests as part of 25 total tests.

This is a primitive only. Provider credentials and media-server tokens are not yet wired through it, no encryption key-ring secret is configured, and no D1 data has been written. Do not treat this as completion of credential-at-rest protection until route integration, key provisioning, rotation/re-encryption workflow, and end-to-end tests are complete.
