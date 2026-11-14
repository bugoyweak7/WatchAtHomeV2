# WatchAtHome Setup Status — Handoff Notes

Last reviewed: 2026-11-13 (Asia/Manila)
Working branch: `setup/firebase-cloudflare-zero-cost`
Base branch: `repair/firebase-entitlements-and-auth`

## Approved architecture
- Firebase Authentication: email/password identity.
- Cloud Firestore: premium codes, user entitlements, immutable 7-day trial, admin roles, and the existing shared add-ons catalogue.
- Cloudflare Workers: trusted APIs and Firebase ID-token verification.
- Cloudflare D1: high-volume app data and sync.
- Cloudflare R2: user-uploaded images/files. Use external TMDB artwork URLs where possible; do not copy entire TMDB catalogue into Firestore.
- Cloudflare Durable Objects: Watch Party realtime state/messaging.
- Target is $0 using Firebase Spark and Cloudflare free allowances. Free tiers have limits; no unlimited/guaranteed zero-cost promise.

## What was scanned
- Repository tree: 2,395 entries; complete Git tree returned (not truncated).
- Authentication: `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthRepository.kt`.
- Backend provider: `core/network/SupabaseProvider.kt`, `SupabaseEndpointConfig.kt`.
- Android Firebase bridge: `core/network/FirebaseBackend.android.kt` exposes FirebaseAuth and FirebaseFirestore.
- Membership currently calls Supabase RPCs `get_my_member_access` and `get_my_membership_overview`.
- Watch Party currently calls Supabase RPCs and Supabase Realtime.
- SyncManager coordinates profile settings, provider credentials, add-ons, plugins, library, collections, home catalogue settings, and media servers.
- Prior source audit also identified Supabase dependencies for profiles, add-ons, library, watch progress, watched items, collections, device registration/linking, media servers, provider credentials, and account deletion.
- No Firestore rules file or Supabase database migrations/Edge Function source were found in this repository scan.

## Important current-state finding
This user app is NOT yet migrated to Firebase/Cloudflare. The Firebase Android bridge exists, but AuthRepository and SupabaseProvider still use Supabase. Do not remove Supabase until every current feature and API contract has a replacement and migration tests pass. Preserve email/password-only registered-account policy; no anonymous/guest auth.

## Data placement
- Firestore: `admins/{uid}`, `users/{uid}`, `premium_codes/{sha256(code)}`, existing `addons/{addonId}`, small app config.
- D1: profiles, profile settings, user add-ons sync (if distinct from admin catalogue), library references, watch progress, watched items, collections, home catalog settings, encrypted provider credentials, media-server metadata, registered devices, TV pairing sessions, sync events/cursors.
- R2: uploaded images/files only. Do not store movie/video binaries or image bytes in Firestore/D1.
- Durable Objects: party presence, coordination and messages.

## Existing business rules to preserve
- Registered Firebase email/password accounts only; no anonymous access.
- Trial is 7 days from verified account creation timestamp, immutable and non-resettable.
- Premium code is single-use, activation window 24h + 15min, selected duration; redemption extends an existing active entitlement.
- Existing product access/entitlement UI must remain compatible during migration.

## Cost and read/write controls
- Cache add-on/configuration reads; refresh only when changed.
- Never poll Firestore frequently for entitlement status; fetch on login, redemption, renewal, or controlled refresh.
- Keep watch progress/history/high-frequency sync in D1, batch writes, use delta cursors and bounded pagination.
- Avoid full per-user movie catalog copies. Store only user-specific references/settings.
- Use R2 or remote artwork URLs for image assets.
- Apply retention to pairing sessions and sync events; add Worker rate limits and request bounds.

## Work created in this setup branch
- A copy of the initial D1 schema is in the Premium Worker repository under `migrations/0001_initial.sql`.
- A detailed architecture note is in the Premium Worker repository as `ARCHITECTURE.md`.
- This file is the User App handoff note only. No app code migration has been performed.

## Not done / do not assume
- No Cloudflare account resources were created or inspected: D1 database, R2 bucket, Durable Object namespace, Worker deployment, routes, secrets, and bindings remain unverified.
- No Firebase Console state/rules/usage/billing were inspected or changed.
- No Firestore rules were published or validated.
- No D1 migration has been applied.
- No app build, automated test, integration test, or deployment was run in this handoff.
- No production data or billing configuration was changed.

## Next steps
1. Inventory Firebase project, Spark plan, Authentication providers, Firestore collections, current rules, indexes, and usage (read-only first).
2. Inspect Cloudflare account resources and free-plan availability (read-only first).
3. Finish mapping every Supabase API/RPC/Realtime/Edge Function contract before replacing any adapter.
4. Build a Cloudflare application Worker with Firebase token verification and D1 ownership enforcement.
5. Test locally against local D1; add migration/rollback and export/backup plan.
6. Migrate feature adapters incrementally; preserve all player/add-on/subtitle/catalog functionality.
7. Run tests and builds; no production deployment without separate approval.

## 2026-11-13 — Authentication migration execution audit (GO authorized)

### Additional source files verified
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthRepository.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthModels.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthStorage.kt`
- `composeApp/src/androidMain/kotlin/com/nuvio/app/core/auth/AuthStorage.android.kt`
- `composeApp/src/iosMain/kotlin/com/nuvio/app/core/auth/AuthStorage.ios.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/DeviceLinkAuthRepository.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/auth/AuthScreen.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/storage/LocalAccountDataCleaner.kt`
- `composeApp/src/androidMain/kotlin/com/nuvio/app/core/network/FirebaseBackend.android.kt`
- `composeApp/build.gradle.kts` and `gradle/libs.versions.toml`

### Confirmed Firebase readiness
- GitLive Firebase Auth and Firestore dependencies (2.8.0) are already declared in commonMain.
- Native Firebase Auth and Firestore dependencies are already declared for Android.
- Android Google Services configuration identifies project `watchathome-admin`.
- iOS `GoogleService-Info.plist` exists in the repository.
- The common auth repository can use the existing multiplatform Firebase SDK, subject to initialization and platform build verification.

### Confirmed authentication behavior and migration blockers
- `AuthRepository` still uses Supabase session status, email/password sign-in/up, session refresh, sign-out, and Supabase Edge Function account deletion.
- A locally generated anonymous UUID is accepted as an authenticated app state; this violates the approved registered-account-only policy.
- `AuthScreen` still exposes “Continue without account” and calls `signInAnonymously()`.
- `DeviceLinkAuthRepository` currently obtains and imports a Supabase access/refresh-token session. It is not compatible with Firebase Auth without a server-side Firebase token-exchange/device-link flow.
- Existing data repositories and sync still depend on Supabase authentication and Supabase RLS/RPC/Edge Functions. Switching only the login provider would leave authenticated data operations without a valid Supabase session.
- Account deletion currently calls the Supabase `delete-account` function. Replacing this with Firebase Auth user deletion alone would leave backend data orphaned and would not provide a complete account-deletion workflow.
- Existing local account cleanup wipes substantial user data. It must only run after the new server-side account/session action succeeds, and must not run during a failed migration/sign-in.

### Execution decision
- GO authorization received for Priority 1.
- No application source code, Firebase project settings, backend resources, or production data were changed in this audit.
- Do NOT replace `AuthRepository` in isolation. That would break Supabase-backed data sync, device-link login, and account deletion.
- The safe implementation sequence is:
  1. Define and implement the Cloudflare authentication/device-link/account lifecycle contract, including Firebase ID-token verification and ownership.
  2. Add Firebase email/password auth and session state to the User App using the already-declared GitLive dependency.
  3. Remove the anonymous/local-UUID sign-in path and its “Continue without account” UI.
  4. Migrate device-link exchange to Firebase-compatible authentication before removing its Supabase session dependency.
  5. Replace Supabase account deletion with a server-authorized deletion workflow covering D1/Firestore and Firebase Auth.
  6. Keep Supabase data adapters until each corresponding API/RLS/RPC dependency has a tested Cloudflare replacement.
  7. Run Android and iOS compilation plus auth/session/device-link/account-deletion tests before marking migration complete.

### Next implementation gate
Build the Firebase-authenticated Cloudflare account/device-link lifecycle endpoints and document the API contract before changing the User App authentication provider. Preserve the existing player, add-on, subtitle, catalogue, profile, and sync behavior throughout.


## 2026-11-13 — Firebase authentication migration continuation (repository scope corrected)

### Repository scope confirmed by user
- The old repository name `WatchAtHomeV2-Firebase-Migration` is obsolete and must be ignored.
- The active User App repository is `bugoyweak7/WatchAtHomeV2`.
- The active Admin App repository is `bugoyweak7/WatchAtHomeAdmin`.
- Continue using the existing working branch `setup/firebase-cloudflare-zero-cost` for this migration unless the user explicitly approves a different branch.

### Additional actual-source findings
- The User App repository contains an existing `premium-worker/` directory with `src/index.ts`, `wrangler.toml`, `package.json`, and `README.md`. This is the existing Worker implementation to assess/extend; do not create a duplicate Worker project.
- The Worker currently implements health, admin premium-code creation, premium redemption/status, and trial initialization endpoints.
- Its Firebase ID-token verification requires the Firebase password sign-in provider, rejecting anonymous and other provider tokens.
- The Worker currently has no account registration lifecycle endpoint, device-pairing start/approve/poll/exchange endpoints, or account-deletion endpoint.
- `wrangler.toml` currently declares only `FIREBASE_PROJECT_ID`; it has no D1 database binding, Durable Object binding, or other account/device-link storage binding.
- No SQL migration/schema file for the account data model was found in the scanned User App repository tree. Existing app data adapters still rely on Supabase APIs/RPC/Realtime/Edge Functions.
- The current device-link repository still uses Supabase PostgREST RPCs `start_device_login_session` and `poll_tv_login_session`, then the `tv-logins-exchange` Edge Function and imports a Supabase session.
- Current account deletion still calls Supabase Edge Function `delete-account`; the existing Worker has no equivalent full data-deletion contract.

### Safe implementation decision
- Do not replace the mobile authentication provider yet. A Firebase-only login change without a working backend/data-access transition would break authenticated app features and device-link sign-in.
- Do not add placeholder device-link or deletion routes: they require persistent pairing state, browser-side approval/authentication, one-time nonce binding, expiry/replay protection, and a complete inventory of user-owned data across D1/Firestore/R2/other services.
- Do not configure or deploy Cloudflare resources, alter Firebase Console settings, or modify production data as part of this source-only step.
- Next safe implementation gate: define the account/data ownership schema and backend contracts against the actual existing Worker and current Supabase-dependent app feature inventory; then implement and test D1 migrations and Worker endpoints before switching mobile auth.

### Changes in this continuation
- Documentation only. No application source, Worker runtime code, deployment, Firebase settings, Cloudflare resources, or production data were changed.


## 2026-11-13 — Account migration contract drafted

- Added `docs/FIREBASE_CLOUDFLARE_ACCOUNT_MIGRATION_CONTRACT.md` as a draft API/ownership contract based on verified User App source calls.
- Documented current Supabase integration points for Auth, account deletion, device-link, profiles/PINs, add-ons, library sync, watch progress, watched items, membership, and Watch Party.
- Defined proposed Firebase-token-authenticated Worker route groups for account lifecycle, device pairing, profile-scoped sync, membership, and Watch Party.
- Defined device-link requirements: existing registered account only, explicit approval, nonce binding, short expiry, hashed secrets/codes, replay protection, one-time exchange, and narrowly scoped Firebase custom-token acceptance.
- Documented a proposed D1 logical ownership model. It is explicitly not a SQL migration and does not claim that these tables exist.
- Recorded the missing Supabase SQL migrations/RLS/Edge Function source as a required evidence blocker before exact schema migration and parity implementation.
- No application source, Worker runtime, SQL migration, Firebase/Cloudflare settings, production data, or deployment was changed. This step is documentation/design only.
- Next step: acquire/read the authoritative existing Supabase schema, RLS policies, RPC definitions, Edge Function contracts and Realtime channel definitions; then validate the draft contract and create the first local-only D1 migration with tests.


## 2026-11-13 — User clarification: Supabase is inherited upstream backend

- User clarified they do not have or own a Supabase account for this integration; Supabase is the legacy/default backend inherited from the upstream Nuvio source.
- Do not ask the user to create a Supabase account or provide Supabase dashboard credentials as a prerequisite for source-level migration work.
- Continue reverse-engineering the legacy contract from actual client source: request/response serializers, RPC names and parameters, table access, sync adapters, realtime usage, and existing product behavior.
- Without upstream project ownership, dashboard access, SQL migrations, RLS policies, Edge Function source, backups, and server logs cannot be inspected through the user's account. Do not claim server behavior or remote-data export has been verified.
- Existing remote user data migration must be investigated separately. If the legacy service is reachable, evaluate a user-authorized per-account export/import using the user's own existing authenticated session and only their authorized records. Never use the shared anon key to bypass authorization or access other users' data. If the old service is unavailable, preserve local data and do not promise automatic remote transfer.
- The migration contract was amended to reflect this ownership clarification and revised next step.
- No application source, Worker runtime, backend resource, Firebase/Cloudflare setting, production data, or deployment was changed.


## 2026-11-13 — Legacy backend source compatibility audit (continued)

- Added `docs/LEGACY_BACKEND_SOURCE_COMPATIBILITY_AUDIT.md` with source-verified contracts for profiles, user add-ons, library, watch progress, watched history, collections, and Watch Party.
- Re-read the actual existing `premium-worker/src/index.ts`, `wrangler.toml`, `package.json`, and `tsconfig.json` in this User App repository. Confirmed the Worker currently covers health, premium-code creation/redemption/status, and trial initialization only; it does not yet provide account lifecycle, TV device pairing, app-data sync, or Watch Party APIs.
- Confirmed the current Worker verifies Firebase password-provider ID tokens and active admin documents, accesses Firestore through a service-account secret, and has no D1 or Durable Object binding in its current Wrangler configuration.
- Recorded source-level Worker hardening items for review before expansion: wildcard CORS, no visible rate limiting/request-body bound, no visible structured observability, and need to verify least-privilege service-account IAM. These are review findings, not claims of an exploited vulnerability.
- Confirmed client compatibility requirements: profile ownership, snapshot/delta cursors, pagination, batching, sync-origin metadata, tombstone/delete behavior, collection unknown-field preservation, and Watch Party realtime presence/events must be retained.
- GitHub code search returned no results for broad Supabase queries on its indexed branch; targeted reads of known files were used instead. This does not establish that no other Supabase call sites exist.
- No application source, Worker runtime, SQL migration, Firebase settings, Cloudflare resource, production data, or deployment was changed.
- Next: continue auditing remaining source contracts (profile PIN/locks, profile settings, provider credentials, plugins, home catalog settings, media servers, membership, device registration/linking, account deletion), then reconcile the contract and design/test the first local-only D1 migration before any mobile adapter switch.


## 2026-11-13 — Legacy sync, membership, and security-sensitive contract audit

- Extended the source compatibility audit with verified profile-settings blob, provider-credential, media-server, membership, profile PIN/lock, device-link, and account-deletion client contracts.
- Confirmed profile settings sync uses `sync_pull_profile_settings_blob` / `sync_push_profile_settings_blob` and serializes multiple settings domains into a profile-scoped JSON blob.
- Confirmed provider credential sync uses `sync_pull_provider_credentials` / `sync_push_provider_credentials` with per-provider `credential_json` payloads. These values are sensitive; replacement encryption-at-rest and no-secret-logging requirements are now explicit. The upstream encryption behavior remains unknown.
- Confirmed media-server sync uses `sync_pull_media_servers` / `sync_push_media_servers` with `servers_json` and profile-scoped payloads.
- Confirmed membership client reads use `get_my_member_access` and `get_my_membership_overview`; response models include tier/entitlements, subscription and billing metadata, and grant/lifetime metadata.
- Confirmed profile PIN/lock RPCs: `verify_profile_pin`, `set_profile_pin`, `clear_profile_pin`, `clear_profile_pin_with_account_password`, `sync_pull_profile_locks`, and profile data deletion via `sync_delete_profile_data`. Legacy PIN hashing and server policy are not visible in client code.
- Confirmed device-link start/poll/exchange contract and account deletion Edge Function call. Firebase migration needs a new one-time Firebase-compatible exchange and a complete server-side deletion lifecycle.
- No application code, Worker runtime, SQL migration, Firebase settings, Cloudflare resource, production data, or deployment was changed.


## 2026-11-13 — Plugin, home-catalogue, device, media-server, and realtime audit

- Re-read the actual User App source for plugin persistence, home-catalogue settings sync, device registration, media-server sync, and Watch Party channel transport.
- Verified plugin storage reads profile-filtered `plugins` rows and pushes via `sync_push_plugins`; user-installed add-ons remain a separate profile-filtered `addons` table plus `sync_push_addons`. Both are distinct from the shared Firestore admin catalogue.
- Verified home-catalogue sync RPCs `sync_pull_home_catalog_settings` and `sync_push_home_catalog_settings`, including platform scoping and JSON merge behavior.
- Verified device registration RPC `register_current_device` and its installation/client/platform/device metadata parameters.
- Confirmed media-server sync serializes `SyncedServer.token` into the sync payload. Treat this as a sensitive credential requiring encryption at rest, strict ownership, and no secret logging in the replacement.
- Confirmed Watch Party uses private `watch-party:<partyId>` Realtime channels, member-keyed presence, and a defined broadcast event set. A REST-only replacement would not preserve current behavior; Durable Objects must cover presence, fan-out, reconnect and membership authorization.
- Confirmed plugin repository operations are no-op/unavailable in the inspected Android Play Store and iOS App Store actuals; full implementation exists in `fullCommonMain`. Keep platform gating intact.
- Appended full source paths and details to `docs/LEGACY_BACKEND_SOURCE_COMPATIBILITY_AUDIT.md`.
- No application code, Worker runtime, SQL migration, Firebase/Cloudflare setting, production data, or deployment was changed.


## 2026-11-13 — Migration contract reconciled with remaining source audit

- Appended a source-audit addendum to `docs/FIREBASE_CLOUDFLARE_ACCOUNT_MIGRATION_CONTRACT.md`.
- Added plugin repository sync, home-catalogue settings sync, media-server sync, device registration, and full Watch Party realtime transport requirements.
- Explicitly classified synchronized media-server tokens as secrets and required encryption at rest, key separation, ownership checks, and no secret logging.
- Clarified that shared Firestore add-on catalogue, per-profile installed add-ons, and per-profile plugin repositories are three separate data concepts.
- Preserved platform gating for plugin operations on Android Play Store and iOS App Store builds.
- No runtime code, SQL migration, Firebase/Cloudflare resource, production data, or deployment was changed.
- Next gate: finish a path-based inventory of all remaining Supabase imports and feature adapters, then validate the complete D1 logical schema and API route matrix against that inventory before implementing mobile migration.


## 2026-11-13 — Supabase Storage dependency discovered

- Expanded the source scan beyond PostgREST/RPC calls and found additional Supabase Storage dependencies in `AvatarRepository.kt` and `ProfileBackgroundRepository.kt`.
- Verified standard avatar catalogue RPC `get_avatar_catalog`, member avatar catalogue RPC `get_member_profile_avatar_catalog`, and member background catalogue RPC `get_member_profile_background_catalog`.
- Verified member-only avatar objects use bucket `membership-profile-avatars`, authenticated downloads, and one-day signed URLs for sharing.
- Verified supporter background objects use bucket `membership-profile-backgrounds`, authenticated downloads, optional portrait paths, and landscape fallback when portrait loading fails.
- Replacement requirements now include R2 object migration, Worker entitlement checks, short-lived authorized delivery, asset-version cache invalidation, and preservation of local image caches. Member-only assets must not become public.
- Updated the compatibility audit and migration contract with these asset dependencies.
- No app code, Worker runtime, R2 object, SQL migration, Firebase setting, Cloudflare resource, production data, or deployment was changed.


## 2026-11-13 — Shared backend infrastructure and profile asset audit

- Completed a path-targeted scan of 296 Kotlin files in the relevant User App common/full-common auth, network, sync, profile, add-on, library, membership, party, server, plugin, and settings areas on the approved branch.
- In addition to feature RPCs, identified app-wide Supabase infrastructure coupling in SupabaseProvider, SupabaseEndpointConfig, ServerConfiguration, ServerDiscovery, NetworkStatusRepository, and RealtimeSocketFactory.
- The replacement must cover official/custom backend configuration, health probing, retry/fallback and cooldown behavior, auth headers, and realtime WebSocket heartbeat/reconnect—not only replace database calls.
- Confirmed profile asset contracts and buckets: standard avatar catalogue; member avatar catalogue and membership-profile-avatars; supporter background catalogue and membership-profile-backgrounds. Member assets require authenticated delivery, membership gating, short-lived share URLs, versioned caches, and portrait fallback.
- Appended these infrastructure and asset requirements to the compatibility audit and migration contract.
- This scan is a targeted 296-file area scan, not a claim that every repository source file or upstream server-side definition has been exhaustively audited.
- No legacy service access, data export, app source change, Worker runtime change, SQL migration, Firebase/Cloudflare setting, production data change, or deployment was performed.
- Supabase dashboard/schema evidence remains unavailable because the user does not own the upstream project. Continue using verified client contracts and explicitly mark unverified server semantics.
- Next gate: reconcile the proposed D1 schema and Worker API matrix against the now-expanded client inventory, then produce a local-only schema draft and tests before mobile adapter changes.


## 2026-11-13 — Source-derived migration path confirmed

- Clarified the migration contract: upstream Supabase dashboard/schema access is not a prerequisite because the user does not own that legacy project.
- The earlier schema-export dependency is superseded. Continue from verified client source and product requirements; mark unknown legacy server semantics explicitly rather than inventing parity.
- Authorized next design stage: prepare a source-derived D1 schema draft and local Worker tests only. This does not authorize production D1 creation, Firebase/Cloudflare account changes, data migration, or deployment.
- Remote legacy data transfer remains conditional on an existing valid user session and verified service reachability; no shared-key bypass or cross-user export.


## 2026-11-13 — D1 schema draft and API route matrix created

- Added `premium-worker/schema/0001_account_data.draft.sql` with 18 source-derived tables and 9 indexes for user-owned account/profile data, sync history, credentials, device registration/linking, idempotency, and retryable account deletion.
- The SQL file is explicitly a draft outside the active Wrangler migrations directory. No D1 binding was added and no Cloudflare database was created or modified.
- Validated the schema locally with SQLite: 18 application tables and 9 indexes created; orphan profile references, invalid JSON, duplicate profile add-on keys, and incomplete encrypted media-server token tuples were rejected; account deletion cascades owned rows and retains the deletion-job tombstone; foreign-key check passed.
- Removed a redundant `PRAGMA foreign_keys = ON` statement from the draft after checking current Cloudflare D1 documentation: D1 enforces foreign keys by default and query/migration transactions cannot toggle this setting. <https://developers.cloudflare.com/d1/sql-api/foreign-keys/>
- Added `docs/FIREBASE_CLOUDFLARE_API_ROUTE_MATRIX.md` covering account/device lifecycle, profiles/PINs, settings, add-ons/plugins, library/watch sync, membership, protected assets, Watch Party, Firestore boundaries, and verification gates.
- The route matrix is a proposed contract only; no routes are implemented yet.
- Member asset catalogue metadata placement remains open. Premium/admin/trial/entitlements and shared add-on catalogue remain Firestore; Watch Party realtime remains Durable Objects; image bytes remain R2.
- No Worker runtime, mobile app code, D1 resource, Firebase setting, production data, or deployment was changed.
- Next: review the schema and route matrix against the Admin App premium-code mismatch and membership source-of-truth, then add local Worker contract tests without changing production bindings or switching mobile adapters.


## 2026-11-13 — Membership source-of-truth gap confirmed

- Re-read the User App membership models/repositories and existing Worker Firestore logic.
- Legacy `get_my_member_access` returns tier plus cosmetic entitlements; legacy `get_my_membership_overview` returns additional provider, subscription, billing-period, cancellation, verified/supporter and grant/lifetime metadata.
- The existing Worker currently calculates premium-code/trial access from `users/{uid}` fields and returns premium/trial flags, tier, a fixed cosmetic entitlement set and expiry timestamps. It does not implement the full supporter/subscription/billing/grant overview.
- Premium-code access and supporter/subscription membership must remain distinct unless a product decision explicitly unifies them.
- Updated the migration contract and route matrix to mark membership overview as blocked on identifying a trusted source-of-truth/update workflow. Do not fabricate provider or billing values.
- No code, Firestore document, Worker runtime, or production data was changed.


## 2026-11-13 — Local schema test harness added and executed

- Added `premium-worker/test/schema.test.mjs` using Node's built-in test runner and SQLite module.
- Added npm script `test:schema` to `premium-worker/package.json`: `node --experimental-sqlite --test test/schema.test.mjs`.
- Executed the committed test logic locally with Node v22.16.0 against the draft schema.
- Result: 7 tests passed, 0 failed. Coverage includes table/index counts, owner foreign keys, JSON validation, per-profile add-on uniqueness, encrypted media-server token tuple constraints, account deletion cascade/tombstone retention, and increasing sync event IDs.
- This is a local SQLite structural test suite, not a Cloudflare D1 integration test or Worker API test. No Worker runtime endpoint was changed and no D1 database was created or migrated.
- Next: implement Worker route handlers and route-level tests incrementally, starting with account bootstrap/device registration, while keeping current mobile Supabase adapters untouched.


## 2026-11-13 — First Worker account/device API implementation

- Added source handlers in `premium-worker/src/index.ts` for `POST /v1/account/bootstrap`, `POST /v1/devices`, and `GET /v1/devices`.
- Account bootstrap requires the existing verified Firebase email/password ID token, checks Firebase account creation time, creates the D1 account row with create-only conflict handling, rejects inactive/deleted account state, then calls the existing immutable Firestore trial initializer.
- Device registration validates an 8 KB maximum JSON body and bounded required metadata. Ownership is derived from the verified Firebase UID, never from request JSON.
- Device listing filters by the verified UID and returns at most 100 non-revoked registry entries.
- Added local SQL contract test cases for idempotent account creation and device registration/owner-scoped listing. These new cases have been committed but have not yet been executed; the previously recorded seven schema tests remain the only verified passing test run.
- Corrected the device route matcher during source review. Deliberately did not expose device revocation because the current authentication layer is not installation-bound and does not invalidate Firebase refresh tokens; a metadata flag alone must not be represented as remote sign-out.
- Added optional `DB?: D1Database` typing only. No D1 binding was added to `wrangler.toml`; new account/device endpoints return HTTP 503 until D1 provisioning and schema application are separately reviewed and approved.
- No active D1 migration, Firebase/Cloudflare account setting, mobile adapter, existing premium endpoint, production data, or deployment was changed.
- Next: obtain a real local checkout or CI runner for Worker TypeScript compilation and all schema tests; then add mocked D1 route tests before any D1 binding is introduced.


## 2026-11-13 — Worker build verification workflow added

- Local checkout was attempted for direct execution but the execution environment could not resolve GitHub, so no local TypeScript or Node test result is claimed.
- Added `.github/workflows/watchathome-worker-check.yml` on the approved branch. It runs on relevant pushes/pull requests and manual dispatch, installs the Worker package dependencies using Node.js 22, runs `npm run check`, then runs `npm run test:schema`.
- The workflow commit is `057042543d49aa1602dd379c71f74cf57996cb8a`.
- The GitHub Actions workflow run could not yet be confirmed through the available repository connector. Therefore TypeScript compilation and the complete nine-test suite remain pending actual CI results.
- No production deployment, D1 binding/database, Firebase setting, or app adapter was changed.
- Next: inspect the CI run and resolve any actual compiler/test failures before writing mocked D1 route tests.


## 2026-11-13 — Worker CI corrected; schema and mocked D1 tests passed

- First CI run failed at dependency installation because `@cloudflare/workers-types@^4.20261113.0` was not a published npm version. Replaced it with the verified published `^5.20261113.1` version.
- GitHub Actions run `43376508247` then passed TypeScript compilation and all 9 schema tests.
- Extracted account/device D1 operations and request validation into `premium-worker/src/account-device.ts` so they can be tested without connecting a live Cloudflare database.
- Added `premium-worker/test/account-device.test.mjs` using a D1-compatible mock adapter backed by in-memory SQLite. It verifies missing D1 configuration, missing/inactive accounts, device registration and idempotent update, owner-scoped listing, revoked installation ID rejection, invalid/oversized request rejection, and ignoring caller-supplied user IDs.
- Added `tsx` and `test:worker` to the Worker package; extended CI to run the mocked D1 tests.
- Latest GitHub Actions run `43376689122` completed successfully: dependency install passed, TypeScript check passed, schema tests passed (9/9), mocked D1 account/device tests passed (6/6). Total verified tests: 15 passed, 0 failed.
- This verifies TypeScript and the account/device data-access module against an in-memory SQLite-backed D1 mock. It is not a full HTTP/JWT integration test, Cloudflare D1 integration test, Firebase integration test, or production test.
- No D1 binding/database, Firebase setting, mobile adapter, production data, or deployment was changed.
- Next: add HTTP/auth integration coverage with a controlled Firebase token verifier, then review and approve D1 provisioning/migration before enabling the endpoints.


## 2026-11-13 — Worker HTTP/Firebase authentication tests passed

- Added `premium-worker/test/http-auth.test.mjs` with a generated RSA signing key and mocked Firebase Secure Token JWKS response; no real Firebase user or credential is used.
- Exercised the actual Worker `fetch` entry point for public health, missing token rejection, anonymous-provider token rejection, fail-closed behavior when D1 is absent, and authenticated device registration/listing with a SQLite-backed D1 mock.
- The first HTTP test attempt found a test-harness omission: the mock D1 environment was not passed to one Worker invocation. Corrected the test; no production endpoint logic change was needed for that failure.
- Added bounded unexpected-error logging in the Worker catch path to improve operational diagnosis without returning internal error details to clients.
- Latest CI run `43377044568` passed all checks: TypeScript compilation; 9 schema tests; 6 D1 data-access tests; 5 HTTP/Firebase-auth tests. Total: 20 tests passed, 0 failed.
- HTTP tests use a generated test signing key and mocked JWKS; they do not validate against the real Firebase project, Identity Toolkit, Firestore service account, or live Cloudflare D1.
- No D1 database/binding, Firebase configuration, mobile app adapter, production data, or deployment was changed.
- Next: complete a security review of the D1 schema and decide the D1 database provisioning/binding step. Do not enable the new routes until the reviewed schema is applied and the D1 binding is configured.


## 2026-11-13 — D1 and Worker security review documented

- Added `docs/D1_SECURITY_REVIEW.md` after reviewing the current D1 schema draft, Worker authentication/device routes, Wrangler configuration, and proposed migration route matrix.
- Blocking before storing secrets: no provider/media-server credential encryption implementation or finalized PIN KDF/lockout design exists yet. Keep these data classes out of D1 until AEAD key management, nonce/AAD rules, key rotation, and PIN verification controls are implemented and tested.
- High-priority design requirements recorded for device-link code entropy/HMAC/rate limits/nonce binding/expiry/replay prevention, HTTPS redirect allowlisting, UID/profile ownership on every query, secret exclusion from generic JSON blobs, device registration limits, cross-system account deletion, sync/idempotency retention, and request abuse controls.
- Identified operational configuration prerequisite: `FIREBASE_WEB_API_KEY` is required by account bootstrap registration lookup but is not declared in committed `wrangler.toml`; confirm it is configured as a Worker variable/secret before enabling bootstrap. No secret was requested or changed.
- D1 schema remains draft-only; no D1 database or binding was created. No Firebase/Cloudflare setting, user data, mobile adapter, or deployment was changed.
- Decision: do not provision/apply D1 yet. Resolve critical encryption/PIN design, add schema constraints/tests, and obtain explicit approval before creating a Cloudflare D1 resource and binding.


## 2026-11-13 — Versioned AES-GCM data-encryption primitives added

- Added `premium-worker/src/data-crypto.ts` implementing AES-256-GCM encryption/decryption using a versioned key ring supplied through Worker secrets/configuration.
- Each encrypted record uses a fresh 12-byte nonce and 128-bit authentication tag. Additional authenticated data binds ciphertext to `userId`, `profileIndex`, resource name, and record key, preventing cross-user/profile/record substitution.
- Added key rotation support: new writes use `DATA_ENCRYPTION_ACTIVE_VERSION`; retained older key versions remain available for decrypting existing records until data is re-encrypted.
- Added `premium-worker/test/data-crypto.test.mjs` and `test:crypto`; tests cover round-trip, AAD ownership binding, tamper rejection, old-key decryption after rotation, invalid key size, and missing historical key.
- Latest CI run `43377463012` passed TypeScript, 9 schema tests, 6 mocked D1 tests, 5 HTTP/auth tests, and 5 AES-GCM tests: 25 total passed, 0 failed.
- Important: encryption primitives are not yet wired into provider-credential or media-server API routes; no key-ring secret has been configured and no credential has been written to D1. Do not store sensitive values until integration, key setup, and end-to-end tests are complete.
- No D1 database/binding, Firebase configuration, production secret, mobile adapter, user data, or deployment was changed.


## 2026-11-13 — Encrypted credential storage layer added and verified

- Added `premium-worker/src/credential-store.ts` with D1 repository operations for provider credentials and media-server access tokens.
- Provider credential JSON is AES-GCM encrypted before D1 storage. Media-server access tokens are stored in encrypted token columns separately from metadata; metadata rejects keys containing token, password, secret, API-key, or authorization markers.
- D1 draft now enforces AES-GCM ciphertext minimum length (16 bytes) and nonce length (12 bytes) for provider credentials and media-server token tuples.
- Added `premium-worker/test/credential-store.test.mjs` and `test:credentials`; tests verify encrypted-at-rest storage, owner-scoped lookup, old-key reads/new-key writes during rotation, media-server token separation, and rejection of secret-bearing metadata.
- Latest CI run `43377725695` passed TypeScript and all 29 tests: 9 schema, 6 account/device D1 mock, 5 Worker HTTP/auth, 5 AES-GCM, and 4 encrypted credential-storage tests. Zero failures.
- This repository layer is not yet exposed through HTTP endpoints; D1 remains unconfigured and unapplied, and no real encryption key ring is configured. No production credentials were stored.
- Remaining before enabling: provision secrets with an approved process, add provider/media-server route auth and payload validation, test real D1 behavior, complete PIN verifier/lockout design, and finish deletion/retention/rate-limit controls.
- No D1 resource/binding, Firebase setting, production secret, mobile adapter, user data, or deployment was changed.


## 2026-11-13 — Pepper-protected profile PIN verifier added and tested

- Added `premium-worker/src/pin-verifier.ts` implementing a versioned HMAC-SHA256 keyed PIN verifier with a server-held pepper key ring, per-record 16-byte random salt, UID/profile binding, and constant-time digest comparison.
- The verifier stores only a 32-byte digest, 16-byte salt, algorithm identifier, and pepper-version metadata; it never stores the PIN itself. Old pepper versions remain available for verification during rotation.
- Updated the D1 draft to enforce 32-byte PIN digests and 16-byte salts.
- Added `premium-worker/test/pin-verifier.test.mjs`, `test:pin`, and a CI step. Tests cover correct/incorrect PINs, owner/profile binding, pepper rotation, invalid lengths, and missing historical peppers.
- Latest CI run `43377933824` passed TypeScript and 33 tests total: 9 schema, 6 account/device D1 mock, 5 Worker HTTP/auth, 5 AES-GCM, 4 credential-store, and 4 PIN-verifier tests. Zero failures.
- Important remaining control: the PIN verifier primitive is not yet connected to a route or D1 lockout workflow. Implement atomic failed-attempt increments, persisted lockout, request throttling, and recovery/re-auth rules before enabling PIN APIs. The keyed verifier is not a substitute for online throttling.
- No D1 database/binding, pepper secret, encryption secret, Firebase setting, production credential, mobile adapter, user data, or deployment was changed.


## 2026-11-13 — Persisted profile PIN lockout implemented and verified

- Added `premium-worker/src/pin-store.ts` to load the owner/profile-bound verifier, check persisted lockout, verify the PIN, reset failed attempts on successful verification, increment failures atomically in D1, and apply a 15-minute lock after 5 failed attempts.
- Lockout state is stored in the draft `profile_pin_credentials.failed_attempts` and `locked_until` fields. The helper does not expose a PIN HTTP route yet.
- Added `premium-worker/test/pin-store.test.mjs` and `test:pin-store`; tests cover threshold lockout, blocking correct PIN during active lockout, successful reset after expiry, missing/other-profile isolation, and repeated lockout after cooldown.
- First test run exposed two test-harness-only issues (SQLite null-prototype result comparison and duplicate account seeding); corrected both. The implementation itself compiled and the final suite passed.
- Latest CI run `43378244632` passed TypeScript and all 37 tests: 9 schema, 6 account/device D1 mock, 5 Worker HTTP/auth, 5 AES-GCM, 4 credential-store, 4 PIN-verifier, and 4 PIN-lockout tests. Zero failures.
- Important: PIN store/verifier are not yet connected to an authenticated HTTP route. Before enabling them, add request-level throttling beyond the per-profile lockout, recent reauthentication for PIN reset, generic client responses, and full route authorization tests.
- No D1 database/binding, pepper secret, encryption secret, Firebase setting, production credential, mobile adapter, user data, or deployment was changed.


## 2026-11-13 — Profile PIN lifecycle storage operations added

- Extended `premium-worker/src/pin-store.ts` with `setProfilePin` and `clearProfilePin`.
- Setting/replacing a PIN creates a fresh salted, pepper-versioned verifier and atomically resets prior failed-attempt/lockout state through an upsert. Clearing deletes only the authenticated owner's selected profile credential.
- Expanded `premium-worker/test/pin-store.test.mjs` to cover create/replace, old-PIN rejection, lockout reset on replacement, and owner/profile-scoped clearing.
- These are D1 storage helpers only. No HTTP route is exposed yet. The future route must require recent Firebase reauthentication for set/clear, verify profile ownership through the composite foreign key, apply request-level throttling, and return generic PIN errors.
- No D1 database/binding, PIN pepper secret, encryption secret, Firebase setting, production credential, mobile adapter, user data, or deployment was changed.


- Verification note for this checkpoint: GitHub reports no CI status on the PIN-store test commit yet. The new tests have been committed but are not marked as passing until a workflow run executes. Do not treat this checkpoint as CI-verified.


## 2026-11-13 — Authenticated PIN and encrypted profile API routes implemented

- Added authenticated Worker routes for profile PIN set, verify, and clear; provider credential save/load; and media-server save/list.
- Every route derives UID from the verified Firebase password-provider ID token and checks active account plus D1 profile ownership before accessing data.
- PIN set and clear require Firebase `auth_time` within the previous 5 minutes. PIN verification uses the persisted five-failure/15-minute lockout.
- Added D1-backed fixed-window request throttling by account/profile and hashed Cloudflare client IP. Added the `api_rate_limits` table to the local D1 schema draft and two dedicated rate-limit tests.
- Provider credential JSON and media-server access tokens use the existing AES-256-GCM key-versioned encryption helpers. Media-server metadata remains separate and rejects secret-like field names.
- Added route-level HTTP tests for reauthentication, owner/profile isolation, lockout, encrypted-at-rest storage, and owner-only retrieval. Added the rate-limit test command to Worker CI.
- CI run **43380260084** passed TypeScript compilation and **45 tests, 0 failures**: 9 schema, 6 account/device, 9 Worker HTTP/auth, 5 AES-GCM, 4 credential-store, 4 PIN-verifier, 6 PIN-store, and 2 rate-limit tests.
- An earlier run failed due to a TypeScript helper-interface mismatch; this was corrected. The next run exposed test fixtures missing active account rows for the wrong-owner cases; the fixtures were corrected and the final run passed.
- Remaining gates: add rate-limit row retention/cleanup; verify all legacy serializer details and mutation/delete semantics; add live D1 integration tests after approved provisioning; configure PIN/encryption key rings as Worker secrets only after separate approval; do not switch mobile adapters until API parity is verified.
- D1 remains a draft, no D1 resource/binding or secrets were created, and no mobile source, Firebase settings, production data, or deployment was changed.


- Follow-up type-safety refinement: PIN routes and encrypted-credential routes now use separate environment-secret type guards, so each route only asserts the key-ring configuration it actually requires. Final CI verification for this small refinement is running separately.


## 2026-11-13 — Profile CRUD and profile-settings Worker APIs added

- Re-read the actual ProfileRepository.kt, ProfileModels.kt, and ProfileSettingsSync.kt from the approved User App branch before implementing the replacement contracts.
- Added premium-worker/src/profile-api.ts with owner-scoped profile listing/upsert/deletion, profile-lock listing, and profile-settings pull/push storage operations.
- Added Worker routes: GET /v1/profiles; PUT /v1/profiles; DELETE /v1/profiles/{profileIndex}; GET /v1/profiles/locks; GET and PUT /v1/profiles/{profileIndex}/settings?platform=mobile.
- Profile payload validation follows the verified six-profile limit and fields in ProfilePushPayload; generated profile IDs remain stable on subsequent upserts. The authenticated Firebase UID scopes all queries; no caller-supplied UID is used.
- Profile deletion uses the draft schema's composite foreign keys to cascade only that owner's profile-dependent data.
- Profile and settings read responses are JSON arrays with snake_case fields expected by existing Kotlin serializers. Settings JSON is stored and returned without normalizing away unknown/future fields.
- Added profile storage tests for owner isolation, stable IDs, bounds, duplicate indexes, cascading deletion, unknown settings-field preservation, platform validation, and PIN-lock visibility. Added HTTP-level profile/settings route coverage and expanded Worker CORS method allowances to include PUT and DELETE.
- Initial response-shape test runs failed because test assertions still expected wrapper objects after the API was changed to serializer-compatible arrays. The assertions were corrected; the subsequent profile helper CI run passed.
- The final HTTP-expanded CI run is pending at this append. Do not count the new HTTP test as passing until its run completes.
- No mobile adapter was changed, no D1 resource/binding or migration was applied, no secrets were configured, and no production deployment/data was changed.


## 2026-11-13 — Profile API CI verification completed

- Final profile/API implementation checkpoint: commit 7b8e76b2d27b637bd2b40378bfc11a447d806f97.
- GitHub Actions run 43381569837 completed successfully: https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43381569837.
- Verified TypeScript compilation and all Worker CI suites: 52 tests passed, 0 failed. This includes 10 HTTP/Firebase-auth tests (including the new profile CRUD/settings route test) and 6 profile API storage tests, plus the existing schema, account/device, crypto, credential, PIN and rate-limit suites.
- The earlier response-shape test failures were test-expectation mismatches; the assertions were corrected and the final complete run passed.
- This is CI with local SQLite/D1 mocks and generated Firebase test signing keys, not live Cloudflare D1, Firebase project, production API, Android/iOS build, or deployment verification.
- Profile CRUD/settings routes are implemented in source but remain disabled until the D1 schema/database/binding and required secrets are separately reviewed and approved. No mobile adapters, production data, Cloudflare resources, Firebase settings, or deployments were changed.


## 2026-11-13 — Add-ons, Plugins and Collections backend APIs completed

- Re-read actual AddonRepository.kt, fullCommonMain PluginRepository.kt, PluginModels.kt, CollectionSyncService.kt, CollectionModels.kt, and PluginSyncTest.kt before implementation.
- Added premium-worker/src/profile-sync-api.ts and authenticated GET/PUT routes for /v1/profiles/{profileIndex}/addons, /plugins, and /collections.
- Add-on and plugin APIs preserve the legacy row shape: url, name, enabled, sort_order. Snapshot PUTs upsert incoming rows and remove stale rows; empty arrays clear only the selected user's selected profile. Request validation rejects invalid URLs, duplicate URLs, invalid enabled flags/sort orders, and over 200 entries. JSON-backed SQL avoids unbounded SQL placeholder expansion.
- Updated the draft profile_plugins table to include name and enabled fields as present in the legacy client row contract. Existing profile_addons table fields already represented the legacy selection data.
- Collection API returns the expected list/row shape with profile_id, collections_json, updated_at and stores the complete JSON array, including unknown/future nested properties. Empty array replaces the snapshot.
- Plugin repository metadata remains synced; scraper code/manifests are not copied into D1 because the inspected client fetches manifests/code from their repository URLs and caches scraper code locally. Plugin-wide runtime preferences remain in the existing local/settings behavior, not invented as server-side fields.
- Shared Firestore add-on catalogue remains separate from per-profile installed add-ons.
- Added 8 local SQLite storage tests and an HTTP/Firebase ownership test covering all three resources.
- Final GitHub Actions run 43382547116 passed TypeScript compilation and all 61 Worker tests (0 failures), including 11 HTTP/auth tests and 8 add-on/plugin/collection storage tests: https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43382547116.
- Verification is local/mock CI only. D1 remains draft-only and unprovisioned; no mobile adapters, UI, player, Firebase/Cloudflare resources, secrets, production data, or deployments changed.


## 2026-11-13 — Staged Firebase Auth implementation (GO)

### Source changes
- Added `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/FirebaseAuthGateway.kt`.
  - Uses the existing GitLive Firebase Auth 2.8.0 dependency.
  - Initializes the default Firebase app if the platform has not already initialized it; Android Google Services configuration and iOS GoogleService-Info.plist are already present in the repository.
  - Implements email/password create/sign-in, auth-state observation, sign-out and forced-refresh ID-token retrieval.
- Added `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/FirebaseAuthSessionManager.kt`.
  - Exposes a staged `FirebaseAuthRepository`.
  - Maps Firebase accounts to the existing shared `AuthState` model.
  - Rejects and signs out anonymous Firebase sessions.
  - Does not clear existing local account data.
- Added `composeApp/src/commonTest/kotlin/com/nuvio/app/core/auth/FirebaseAuthSessionManagerTest.kt` with six fake-gateway tests.
- Added `.github/workflows/watchathome-firebase-auth-check.yml` to compile the Android Play Store debug app when the staged auth source or related build files change.

### Current safety state
- The new repository is intentionally not wired into `AuthScreen`; the existing `AuthRepository` and active Supabase sign-in behavior remain unchanged.
- This avoids switching the app to Firebase while profile, library, watched history, watch progress, collections, membership, device-link, Watch Party and account deletion still depend on Supabase.
- No Firebase-to-Worker account-bootstrap request was added. The Worker bootstrap route currently requires D1, but the Wrangler configuration has no D1 binding and the draft schema has not been applied.
- No anonymous/local-UUID path was removed from the active UI in this staged step; that removal belongs to the coordinated provider cutover after dependent APIs are ready.

### Commits and verification
- `FirebaseAuthGateway.kt`: `300b4381b1d56a8b7929265aae0e42acff45cfea`
- `FirebaseAuthSessionManager.kt`: `1a8d8d9a16b16a6c7861f5b3ff8044478990d1f3`
- `FirebaseAuthSessionManagerTest.kt`: `ae672a57c6283b9faa53570dc74350dd50411356`
- Android compile workflow: `afccedb4cb2d3503259cc5a9b4fc84c15ffca88e`
- GitHub Actions run `43387942928` was observed in progress. No successful build or test result is claimed until the run completes.
- The six common tests have been added but have not yet been run by CI.
- No production Firebase/Cloudflare setting, Firestore rule, D1 database/binding, secret, deployment, Supabase data or user data was changed.


### Firebase Auth build failure and correction
- First workflow run `43387942928` failed before Kotlin compilation because the existing Gradle script used an unresolved `platform(...)` helper inside the Android source-set dependency block at `composeApp/build.gradle.kts:455`.
- Corrected only that BOM declaration to `implementation(project.dependencies.platform(libs.firebase.bom))`; the Firebase BOM remains applied to the Android source-set configuration.
- This is a build-script compatibility correction discovered while validating the new work, not an auth-source compiler finding.
- Second workflow run `43388218215` was queued from commit `4db2c6c59448e039c4cf36cad718f79a01bdafd9`; final result remains pending.
- iOS setup was also source-verified: `GoogleService-Info.plist` is present, `iOSApp.swift` calls `FirebaseApp.configure()`, and the Xcode project links `FirebaseCore`, `FirebaseAuth`, and `FirebaseFirestore`.


### Firebase Auth SDK API correction — 2026-11-13
- Workflow run `43388218215` completed with failure. The exact Kotlin compiler errors were two unresolved Firebase app initialization references (`apps`, `initialize`) and an invalid `.token` property on the nullable ID-token string.
- Verified GitLive Firebase SDK 2.8.0 tagged source: `FirebaseUser.getIdToken(forceRefresh)` returns `String?`; the Android Firebase SDK auto-initializes its default app through FirebaseInitProvider when Google Services configuration is present. The iOS app already configures Firebase at startup.
- Updated `FirebaseAuthGateway.kt` accordingly in commit `6cf909beab6bcf7301614f6cfc9d6784e2116d60`.
- The next workflow run must confirm whether the correction compiles. The six common tests are still not confirmed as executed.


## 2026-11-13 — CI test step
- Added `./gradlew :composeApp:testAndroidHostTest -Pnuvio.android.distribution=playstore -Pnuvio.ios.distribution=appstore --stacktrace` to the Firebase Auth workflow.
- Run `43399716638` is in progress. Wait for CI evidence before marking the six tests as passed.
- No local setup, Firebase Console configuration, Cloudflare resource, secret, or production deployment was performed.


## 2026-11-13 — Test filtering adjustment
- Broad host test execution exposed two unrelated failures in existing tests (`AndroidDownloadLifecycleTest`, `WatchProgressIdentityTest`), after 2,052 tests ran.
- Firebase Auth CI now filters to `com.nuvio.app.core.auth.FirebaseAuthSessionManagerTest` so the staged auth tests can be validated independently.
- Focused workflow commit: `9a89838d131cf1427e2ea5816db276ce9ce739ef`. Await CI result.


## 2026-11-13 — Generic JSON security guard
- Worker profile-settings and collection writes now reject nested sensitive-key names rather than storing credentials in generic JSON columns.
- The guard is source-only and requires no new Cloudflare variables or secrets.
- Worker CI latest run `43401302072` is pending; do not mark verified until it completes.
- D1 remains unprovisioned and the SQL remains draft-only.


## 2026-11-13 — Worker security guard CI result
- Verified: Worker CI run `43401302072` passed TypeScript and all 63 tests (0 failures).
- Still not configured: Cloudflare D1 database/binding, production key-ring secrets, Firebase service-account secret, and live deployment. SQL remains draft-only.


## 2026-11-13 — Home catalog API source added
- Worker source now includes profile-scoped home-catalog settings GET/PUT using the existing draft D1 table; no new Cloudflare setup variables are required.
- The app still uses Supabase for home catalog sync. D1 is not provisioned/bound and no deployment was performed.
- Final Worker route/test CI run `43401818613` pending verification.


## 2026-11-13 — Home catalog CI fixture correction
- The first route/test CI run failed because its test fixture inserted the same account twice; the implementation compiled and the other test passed.
- Fixture corrected. Run `43401962345` is queued for final verification. No production resources were touched.


## 2026-11-13 — Home catalog API verification passed
- Verified by Worker CI `43401962345`: TypeScript passed; 65 tests passed, 0 failed.
- Source implementation only. No D1 resource/binding/schema deployment, Worker deployment, or mobile adapter cutover has occurred.


## 2026-11-13 — Firebase Auth source verification
- Verified: focused Firebase Auth session-manager tests passed in CI; Android Play Store debug app compilation passed in workflow `43400761852`.
- Not yet configured/verified: live Firebase Console settings, production sign-in, auth UI integration, Cloudflare D1 provisioning, and mobile API adapter migration.


## 2026-11-13 — Device registry revocation source
- Worker source now supports owner-scoped deletion of a registered-device inventory entry.
- No new Cloudflare setup or secrets required. Device inventory revocation does not invalidate Firebase sessions or force a client logout.
- Final CI run `43402508386` queued after correcting initial syntax/validation issues.


## 2026-11-13 — Device registry revoke route verified
- Verified by Worker CI `43402508386`: TypeScript passed; 67 tests passed, 0 failed.
- This is local SQLite/mocked D1 validation only. No Cloudflare D1 production resource or Worker deployment exists; device inventory revocation does not revoke Firebase sessions.


## 2026-11-13 — Device registry API source verified
- Device registration and listing now have a companion owner-scoped soft-revocation endpoint in Worker source.
- CI run `43402508386` passed TypeScript and 67 tests, 0 failures.
- Still not provisioned/deployed: Cloudflare D1 database/binding, production Worker, Firebase production settings, and mobile device UI/API migration.


## 2026-11-13 — Library sync API source implementation and verification

- Source added: premium-worker/src/library-sync-api.ts.
- Worker routes added: snapshot GET/PUT /v1/profiles/:profileIndex/library, cursor GET /v1/profiles/:profileIndex/library/cursor, delta GET /v1/profiles/:profileIndex/library/delta, and tombstone POST /v1/profiles/:profileIndex/library/delete.
- Uses existing draft tables library_items and sync_events; no schema migration was applied.
- Validation limits: maximum 500 rows per mutation/page, bounded JSON body, validated content ID/type and metadata, duplicate-key rejection, and per-account/profile/IP route rate limiting.
- Tests added to profile-sync-api.test.mjs and http-auth.test.mjs. CI run 43405997252 passed TypeScript and 70 tests across 10 suites, 0 failures.
- Still pending: mobile LibrarySyncAdapter implementation/wiring, real D1 provisioning and integration, sync-event retention cleanup, production Worker deployment, and full multi-device/offline parity validation.
- Active Supabase library sync is unchanged.


## 2026-11-13 — Watch-progress Worker API implementation and verification

- Source added: premium-worker/src/watch-progress-sync-api.ts.
- Implemented GET snapshot, PUT batch upsert, GET cursor, GET delta and POST delete routes under /v1/profiles/:profileIndex/watch-progress.
- Uses the existing draft watch_progress and sync_events tables; schema remains unapplied.
- Enforces verified Firebase UID, active account, owned profile, route rate limiting, bounded JSON, max 500 rows, stable progress key validation, nonnegative numeric fields, and duplicate-key rejection.
- Test suites extended for local SQLite and authenticated HTTP behavior. Final CI run 43411656192 passed TypeScript and 73 tests across 10 suites, 0 failures.
- Pending: mobile adapter implementation, legacy RPC parity review, multi-device conflict testing, timestamp pagination tie handling, sync-event retention and live D1 integration.
- Existing SupabaseProgressSyncAdapter remains unchanged and active.


## 2026-11-13 — Mobile Cloudflare library adapter staged

- Added `CloudflareLibrarySyncAdapter.kt` implementing the existing `LibrarySyncAdapter` contract without changing the active repository adapter.
- Uses staged Firebase fresh ID tokens, Ktor multiplatform HTTP, bounded response reads, and Worker-compatible JSON routes.
- Added optional runtime property `CLOUDFLARE_WORKER_BASE_URL` (local.properties or environment); left blank by default.
- Added request-size-aware batching (192 KiB mobile cap against Worker 256 KiB request bound).
- Added four MockEngine tests and extended Android CI workflow. Run 43413914695 pending final result.
- No Worker endpoint, D1 binding, secrets, deployment, or production config was set.


## 2026-11-13 — Watch-progress mobile adapter staged

- Added `CloudflareProgressSyncAdapter.kt` using Firebase ID-token Bearer auth and the existing multiplatform Ktor HTTP client.
- Supports snapshot pages, delta cursor/events, push and delete tombstones; request bodies are size-batched and responses are bounded.
- Worker snapshot route now accepts a validated offset for deterministic paging. Worker CI run 43414785430 passed.
- Added four MockEngine tests; Android CI run 43414877340 pending.
- `WatchProgressRepository` remains on Supabase. No production Worker URL, D1 resource/binding, secret, deployment or production data changed.


- Added authenticated HTTP regression coverage for progress snapshot offset; Worker CI run 43415195896 passed.
- Latest Android test run 43415270909 is queued; prior run 43414877340 was cancelled by a subsequent push.

## 2026-11-13 — Library and watch-progress adapters wired behind an opt-in gate

- Added generated runtime configuration CloudflareWorkerConfig.SYNC_ENABLED, controlled by CLOUDFLARE_SYNC_ENABLED from local.properties or the build environment. The default is false.
- Wired LibraryRepository.syncAdapter to select CloudflareLibrarySyncAdapter only when the opt-in flag is true and the Worker base URL is HTTPS; otherwise it retains SupabaseLibrarySyncAdapter.
- Wired WatchProgressRepository.syncAdapter with the same guarded selection; Supabase remains the default.
- This is a safe integration seam, not a production cutover. Keep CLOUDFLARE_SYNC_ENABLED false until Firebase mobile auth is active, D1 is provisioned and migrated, the Worker is deployed with required bindings/secrets, and live integration/parity tests pass.
- No player, catalogue UI, subtitle, add-on, auth provider, local user data, Firebase Console setting, Cloudflare resource, secret, or production deployment was changed.
- Android CI run 43415270909 was cancelled before the Android compilation step completed; the Firebase Auth unit-test step passed. A fresh workflow run is required for the new wiring/config changes.
- Next: verify the fresh Android host tests and Play Store debug compilation; then complete D1-backed live integration and feature parity before enabling the flag.

- Fresh Android CI run 43416885505 was triggered by the final adapter/config source commit and is currently queued; do not mark the mobile wiring build-verified until this run completes successfully.

- CI follow-up: run 43416885505 has moved from queued to in progress. The focused Firebase/Auth + Cloudflare adapter host-test step is currently running; Android Play Store debug compilation is pending. No pass is claimed yet.


## 2026-11-13 — Firebase authentication dependency audit

- Scanned the active mobile auth flow and related repositories on the approved branch. `AuthScreen` still calls `AuthRepository` for email registration/login, anonymous access, and device-link flows; `AppGate` initializes and observes `AuthRepository`.
- `AuthRepository` remains Supabase-backed. `ProfileRepository` uses Supabase RPCs for profile pull/push/delete, PIN verification and management, and profile-lock sync. `DeviceLinkAuthRepository` uses Supabase RPCs and the `tv-logins-exchange` function; `DeviceSessionRegistration` calls `register_current_device`.
- Membership access and membership overview also call Supabase RPCs. Account deletion invokes the Supabase `delete-account` function. These paths require explicit replacement or a compatible identity bridge before Firebase can become the sole active identity.
- Firebase gateway/session manager are staged but not connected to `AuthScreen` or `AppGate`; do not switch the active auth provider yet.
- Android CI run 43416885505 remains in progress at the latest check: Firebase/Auth + adapter host tests running; Play Store debug compilation pending. No successful build is claimed.
- No application source or production configuration changed during this audit; Supabase remains active and Cloudflare sync remains disabled by default.


## 2026-11-13 — Firebase/Cloudflare backend implementation audit and Android CI result

- Rechecked GitHub Actions run `43416885505`: all steps completed successfully, including `Run Firebase Auth session manager unit tests` and `Compile Android Play Store debug app`. This verifies the current branch compiles and the focused unit tests pass; it does not verify live Firebase, D1, or deployed Worker integration.
- Scanned the in-repository `premium-worker` implementation. Its `verifyUser` currently accepts Firebase ID tokens only when the Firebase sign-in provider is `password`; it validates Firebase project issuer/audience and derives ownership from the verified token subject.
- Worker routes already include account bootstrap, device registration/list/revocation, profile operations, profile add-ons/plugins/collections, library sync, watch-progress sync, PIN operations, and premium/trial endpoints. These are Firebase-authenticated Worker APIs, not a migration bridge for the active Supabase session.
- The Worker does not currently expose the proposed device-link session start/poll/approve/exchange flow. The existing app still depends on Supabase RPCs and `tv-logins-exchange` for TV pairing. A Firebase custom-token device-link flow would require explicit one-time session binding and a narrowly scoped verifier change; do not broadly allow `sign_in_provider=custom`.
- The account schema file remains explicitly draft-only; `wrangler.toml` has no D1 binding. Account bootstrap and device routes therefore are not proof of a live D1 deployment. Keep `CLOUDFLARE_SYNC_ENABLED=false`.
- The active app repository tree contains no Supabase SQL migrations, RLS policy definitions, or Edge Function source needed to reproduce the legacy authorization and data contracts. Obtain an authorized Supabase schema/function export before designing identity mapping or production data migration.
- No application source, Firebase Console, Cloudflare resource, secret, D1 database, production data, or deployment was changed in this audit. Supabase remains the active auth and backend path.


## 2026-11-13 — Watched-items Worker sync API staged

- Re-scanned the current approved branch before implementation. Branch head at the start of this work: `726bd9d58de41dd1c184314f1e1852051e6c93d0`.
- Added `premium-worker/src/watched-items-sync-api.ts` with D1 snapshot paging, stable per-profile event cursor, delta reads, bounded upserts, and delete tombstones.
- Added authenticated Worker routes for `GET /v1/profiles/:profileIndex/watched-items`, `GET .../cursor`, `GET .../delta`, `PUT .../watched-items`, and `POST .../delete`.
- Ownership is derived from the verified Firebase UID and checked against the requested profile before every operation. Batch size is capped at 500; request bodies are bounded; episode season/episode values must be paired; duplicate keys are rejected.
- Delete events retain the prior watched-item payload so delta consumers receive the identity and metadata needed to apply the tombstone.
- Added local SQLite data-access tests and authenticated HTTP route tests. CI has been triggered by these commits; results must be checked before calling the change verified.
- This closes the Worker source gap for watched-items sync only. The mobile adapter remains Supabase-backed; no D1 database/binding, Firebase/Cloudflare secret, deployment, production data migration, or sync flag change occurred.
- The existing `CLOUDFLARE_SYNC_ENABLED` default remains false. Do not enable it until the mobile watched adapter is implemented and end-to-end parity is tested.


## 2026-11-13 — Mobile watched-items adapter staged behind existing opt-in gate

- Added `CloudflareWatchedSyncHttpAdapter` using the existing Worker HTTPS API and a fresh Firebase ID token. It maps the current `WatchedItem` and `WatchedDeltaEvent` contracts, pages snapshots at the Worker-supported maximum of 500 rows, and sends bounded upsert/delete batches.
- Added MockEngine tests for snapshot route/paging, delta mapping, cursor, mutation routes, wire fields, and missing-token rejection.
- `WatchedRepository.syncAdapter` now selects the Cloudflare implementation only when `CLOUDFLARE_SYNC_ENABLED=true` and the configured Worker base URL is HTTPS; otherwise it continues using `SupabaseWatchedSyncAdapter`.
- The global flag remains false by default. The Firebase Auth implementation is still staged rather than wired into the active app login, so this adapter is not ready for activation.
- Android CI has been triggered by these source/test commits. Do not mark compilation/tests as passed until the matching run completes successfully.
- No D1 binding, Cloudflare deployment, secrets, Firebase Console settings, production data, or account migration was changed.


### Watched-items identity and delete-key compatibility follow-up — 2026-11-13

- Tightened watched-item storage identity to include `content_type`, preserving the same content ID when it represents different media types.
- The legacy delete request intentionally carries only `content_id`, `season`, and `episode`; the Worker now resolves all matching active content-type variants and appends a separate tombstone for each exact stored item.
- Added a SQLite regression test covering same-ID movie/series rows and the legacy delete-key behavior.
- Worker CI rerun is pending. This change remains source-only and does not affect live data or deployments.


### Watched-items verification update — 2026-11-13

- Worker CI run `43420974177` passed TypeScript compilation and all configured Worker test steps, including the watched-items same-ID/different-content-type regression test and the authenticated route tests.
- The watched-items API now preserves distinct movie/series identities for a shared content ID. Legacy delete keys (which omit content type) resolve and tombstone each matching media-type row separately.
- Android CI run `43420777374` is still in progress at this status update. The new mobile adapter and guarded repository selection remain unverified until that run completes.
- No live D1, Worker deployment, Firebase Console, production data, or active Supabase cutover was performed.


## 2026-11-13 — Android CI failure diagnosed and corrected; rerun pending

- The first Android CI run including the watched-items adapter failed during Kotlin compilation because the new adapter declared a private `WatchedDeleteKey` type with the same package-level name as an existing type in `SupabaseWatchedSyncAdapter.kt`.
- Renamed the new adapter's private model to `CloudflareWatchedDeleteKey`; no public interface or wire JSON field changed.
- A fresh Android CI run was triggered by the fix. Its result is pending; do not mark the mobile adapter verified until it completes.
- The Worker watched-items implementation and content-type identity regression tests have passed their Worker CI runs.


## 2026-11-13 — Staged Cloudflare profile metadata adapter

- Added `CloudflareProfileSyncAdapter.kt` with Firebase ID-token authenticated Worker calls for profile listing, batch profile upsert, and profile deletion.
- The adapter matches the existing Worker contract: `GET /v1/profiles`, `PUT /v1/profiles` with a `profiles` array, and `DELETE /v1/profiles/{profileIndex}`. Requests require an HTTPS Worker base URL and a fresh Firebase ID token; response bodies are bounded.
- Added unit tests for profile response mapping, bearer-token use, profile upsert wire fields, profile deletion, and missing-token rejection. Added the tests to the Android Play Store CI workflow.
- This is a staged adapter only. `ProfileRepository` remains Supabase-backed and no active auth or profile-sync cutover was made. The adapter must not be selected until Firebase authentication is the active app session and the Worker/D1 deployment is verified.
- Android CI run `43421702839` was still in progress at the time of this update; the new profile adapter tests are included in subsequent matching CI runs, not that already-running run.
- No live D1 database, Worker deployment, Firebase Console setting, secret, or production data was changed.


## 2026-11-13 — Staged Cloudflare profile settings adapter

- Added `CloudflareProfileSettingsSyncAdapter.kt` for the existing Worker profile-settings contract: GET and PUT `/v1/profiles/{index}/settings?platform=mobile`.
- The adapter carries a Firebase ID-token bearer header, requires HTTPS, validates profile/platform values, bounds response size, and uses `JsonObject` so unknown future settings fields can be retained.
- Added tests for remote settings decode, upload payload/route, and missing-token rejection; added the adapter and test to Android CI path filters and test execution.
- The adapter is staged only. `ProfileSettingsSync` still calls Supabase RPCs; it is not wired or selected. Do not enable Cloudflare sync until Firebase is the active app session and live Worker/D1 is verified.
- No live cloud resources, secrets, Firebase Console settings, or production data were changed.


## 2026-11-13 — Admin premium-code Worker integration cross-repository update

- Re-scanned the Admin App and Premium Worker source. Admin premium-code creation now calls the existing authenticated `POST /v1/admin/premium-codes` endpoint using a Firebase ID token; direct Admin-side creation of raw-ID Firestore documents was removed.
- Worker-created code documents use SHA-256 IDs and preserve the `code`, `durationLabel`, `durationDays`, `durationMinutes`, `status`, and timestamp fields consumed by the Admin history screen. The existing Admin Firestore history query remains compatible with those hashed documents, subject to deployed Firestore rules.
- Admin build configuration now accepts the non-secret `watchathome.premiumApiBaseUrl` Gradle property. No live Worker URL was present in repository configuration, so the app is not yet configured for a live call.
- Admin build verification is pending: its current GitHub Actions workflow automatically targets `main`, not the approved setup branch. Do not treat this as production-ready until the branch build and authenticated API flow pass.
- No Firebase/Cloudflare resources, secrets, production data, deployments, or account settings were changed.


## 2026-11-13 — Admin APK build and Premium Worker endpoint audit

- Admin App GitHub Actions run [43426299440](https://github.com/bugoyweak7/WatchAtHomeAdmin/actions/runs/43426299440) completed successfully on branch `setup/firebase-cloudflare-zero-cost` at commit `60f7bc8a7a522aa5d1da0d1289eeeb4b6ab17802`.
- The `build-debug-apk` job passed, including APK artifact upload. Artifact: `WatchAtHomeAdmin-debug-apk`, artifact ID `14038096854`, 18,610,955 bytes, expires 2026-11-27.
- Re-scanned `premium-worker/src/index.ts`: unauthenticated `GET /health` is explicitly handled before Firebase authentication and returns JSON identifying `watchathome-premium-api`. The source route itself is present; this does not prove the live Worker has this revision deployed.
- Re-scanned `premium-worker/wrangler.toml`: Worker name is `watchathome-premium-api`, `workers_dev = true`, and Firebase project variable is `watchathome-admin`. The Admin build configuration contains the supplied base URL `https://watchathome-premium-api.adminenzoreviewer.workers.dev`.
- Live endpoint verification could not be completed from this environment. Therefore no HTTP 404, live deployment, Cloudflare secret, or service health claim is recorded. A mismatch between the live workers.dev hostname/deployment and the configured URL remains possible.
- No Worker deployment, Cloudflare secret/binding changes, Firebase changes, or production data changes were performed. Next deployment verification requires an authenticated Cloudflare deployment context with the existing `FIREBASE_SERVICE_ACCOUNT_JSON` secret available.


## 2026-11-13 — Admin device test: Premium Worker returns HTTP 404

- User installed the Admin APK and confirmed Firebase Admin login succeeds.
- On the Premium screen, the app displayed `Premium service request failed (HTTP 404)` before any premium code was created. The user did not generate codes; no premium-code Firestore writes were initiated by this test.
- Re-scanned the approved branch source: `premium-worker/src/index.ts` contains unauthenticated `GET /health` before authentication and authenticated `POST /v1/admin/premium-codes`; `premium-worker/wrangler.toml` declares Worker name `watchathome-premium-api` and `workers_dev = true`.
- Re-scanned Admin `PremiumApiClient.kt`: it constructs `POST ${PREMIUM_API_BASE_URL}/v1/admin/premium-codes`; the Admin build configuration sets the base URL to `https://watchathome-premium-api.adminenzoreviewer.workers.dev`. Source path and configured request path are consistent.
- This is now a user-observed HTTP 404 from the installed app. The exact responder is not yet identified. Most likely investigation areas are live Worker deployment/version, workers.dev account subdomain/hostname, and whether the deployed script is attached to the expected endpoint. Do not change the Admin route or Worker API contract without evidence.
- Live `/health` could not be independently fetched from this environment (web and shell network resolution unavailable); therefore no independent live endpoint response is claimed.
- No Worker deployment, Cloudflare dashboard setting/secret change, Firebase change, Firestore mutation, or premium-code creation was performed. Next: inspect the Cloudflare Worker deployment and its exact workers.dev URL, confirm `/health`, then retest the Admin APK.


## 2026-11-13 — Live Worker health route test returned application-level Not found

- User opened `https://watchathome-premium-api.adminenzoreviewer.workers.dev/health` from the Cloudflare Worker Overview URL.
- Observed response: `{ "success": false, "message": "Not found." }`.
- This differs from the approved branch source `premium-worker/src/index.ts`, which handles `GET /health` before authentication and returns `{ ok: true, service: "watchathome-premium-api" }`.
- Cloudflare Overview screenshot confirms the Worker URL exists, shows 29 invocations in the last 24 hours and 0 dashboard errors, and indicates a deployment approximately 11 hours earlier. These metrics do not prove route parity.
- Evidence now confirms that the live response does not match the health contract in the approved source. Likely causes include an older/different Worker deployment or a route/entrypoint mismatch; exact cause remains unverified.
- Next diagnostic: inspect the Worker Deployments tab and identify the active deployment version/time and its source commit/build. Do not deploy or alter routes/secrets until this comparison is complete.
- No Admin/User App source changes, Cloudflare deployment/settings/secrets changes, Firebase changes, Firestore mutations, or premium-code generation occurred.


## 2026-11-13 — Cloudflare Overview screenshot: production vs branch preview

- User supplied a Cloudflare Workers Overview screenshot for `watchathome-premium-api`.
- The Production deployment history shown in Overview contains several deployments marked `main` (including entries initiated by API token and GitHub user). The approved branch `setup/firebase-cloudflare-zero-cost` appears separately under Recent Previews, approximately 8 hours ago.
- This is evidence that the approved setup branch was previewed but is not shown as the active Production deployment in this screenshot. The production Worker may therefore be running a different revision/entrypoint than the current approved source. This is the leading explanation for the observed `/health` response `{ "success": false, "message": "Not found." }`, but the active deployment's exact version/commit has not yet been opened and verified.
- Overview also shows 0 bindings; the premium-code path in current Worker source uses Firestore REST via the service-account secret and does not require a D1 binding for code creation/redemption. The secret's actual deployed value/configuration remains unverified from this screenshot.
- Next: open the Cloudflare Deployments tab, select the latest Ready Production deployment, and inspect its version details/source commit and build/entrypoint. Compare it with the approved GitHub branch before any deployment action.
- No Worker deployment, secrets/bindings, Firebase settings, Firestore data, or premium codes were changed.


## 2026-11-13 — Premium Worker deployment command mismatch identified

- User provided Cloudflare deployment-detail screenshots for production Worker `watchathome-premium-api`. The deployment details identify repository `bugoyweak7/WatchAtHomePremiumWorker`, branch `main`, commit `6a4b913` (full SHA `6a4b91300ee1d24d5b030209ee4b5e7862df1f2e`), with build command `None` and deploy command `npm run check`.
- Re-scanned that exact repository's `package.json`: `check` runs `tsc --noEmit` (type-check only); `deploy` runs `wrangler deploy`.
- Re-scanned `src/index.ts` on `main`: it defines unauthenticated `GET /health` returning `{ ok: true, service: "watchathome-premium-api" }` and defines the authenticated `POST /v1/admin/premium-codes` route. The source commit shown by Cloudflare is the latest repository commit and contains these routes.
- Root cause is now strongly indicated: Cloudflare Workers Builds is configured to run `npm run check` as its Deploy command, which does not publish the Worker script. This explains why a green build can coexist with the live endpoint returning the older/different `{ success:false, message:"Not found." }` response. The live deployed script/version is still not independently identified.
- Correct Workers Builds configuration should be Build command `npm run check` and Deploy command `npm run deploy` (the existing package script runs `wrangler deploy`). Keep root directory `/`. Before applying, confirm the existing Cloudflare Worker secrets are configured; never place service-account JSON or API keys in build variables or Git.
- No repository source code, Cloudflare settings, deployment, secrets, Firebase settings, Firestore records, or premium codes were changed in this investigation.


## 2026-11-13 — Supabase removal deferred; Firebase + Cloudflare migration approved

- User approved completing the Firebase + Cloudflare migration first and removing Supabase only when it is safe. This is a staged migration authorization, not permission to delete the Supabase project, data, secrets, or source adapters prematurely.
- Re-scanned the selected branch tree directly from GitHub. Recursive tree response: `4f6c04c26dae0e2424cae7e97b2a17e3110cb9cd` (2,444 entries; not truncated). The branch remains `setup/firebase-cloudflare-zero-cost`.
- Confirmed active `AuthRepository.kt` still imports and calls `SupabaseProvider` for session observation, validation/refresh, email/password registration and sign-in, sign-out, session clearing, and invalid-session handling. Anonymous local identity handling also remains in that repository.
- Confirmed `FirebaseAuthGateway.kt` and `FirebaseAuthSessionManager.kt` provide a staged Firebase email/password session layer, but the manager explicitly is not wired into the active app authentication flow.
- Confirmed `DeviceLinkAuthRepository.kt` still imports Supabase Auth, Functions, and PostgREST APIs. Device linking therefore remains a migration blocker.
- Confirmed the User App still contains `SupabaseProvider.kt`, `SupabaseEndpointConfig.kt`, Supabase library/progress/watched adapters, and Supabase Party API/channel implementations. These are to remain until equivalent Firebase/Worker replacements pass parity and regression tests.
- Confirmed the in-repository Worker source now includes library, watch-progress, and watched-items sync API modules, in addition to account/device, profile, credential, add-on/plugin/collection, and premium/trial modules. This is source presence only; D1 is still draft/unprovisioned in this repository configuration and no live Worker/D1 deployment is inferred.
- The existing migration map contains an earlier route-parity snapshot that predates the subsequently added library/watch-progress/watched-items Worker modules. Treat its dated historical snapshot as historical; use the latest source tree and this follow-up for current planning.
- Safe execution order: (1) finish source/API contract inventory and legacy data export strategy; (2) implement/test Firebase identity, account bootstrap, device-link and account-deletion parity; (3) complete and validate Worker persistence/deployment prerequisites; (4) switch one data adapter at a time with rollback; (5) verify Android mobile/TV and iOS builds and behavior; (6) perform a final repository-wide Supabase reference/dependency audit; (7) only then remove Supabase source/config/dependencies and consider disabling the Supabase service after data retention and rollback are settled.
- No application source, Supabase data/service, Firebase project settings, Firestore rules/data, Cloudflare resources/secrets/deployments, or D1 resources were changed in this audit.


## 2026-11-13 — Firebase account cutover blocked by missing Cloudflare D1 binding

- Continued the source audit against the approved branch. Verified Worker `src/index.ts` already exposes `POST /v1/account/bootstrap`, `POST /v1/devices`, `GET /v1/devices`, and `DELETE /v1/devices/{installationId}`; these routes authenticate Firebase ID tokens and derive the UID from the verified token.
- Verified `bootstrapAccount` calls `requireAccountDb(env)`, inserts an account row idempotently, checks active account status, and initializes the Firestore trial using the Firebase account creation timestamp. This is the intended safe first-account bootstrap path.
- Verified `registerDevice`, `listDevices`, and `revokeDevice` also require an active D1 account row. These cannot operate until bootstrap succeeds.
- Verified `premium-worker/src/index.ts` declares optional `DB?: D1Database`, and `premium-worker/src/account-device.ts` returns HTTP 503 when `DB` is not bound.
- Verified `premium-worker/wrangler.toml` currently contains only the Worker name, entry point, compatibility date, Workers.dev setting, and Firebase project variable. It has no `[[d1_databases]]` binding. The checked-in SQL `premium-worker/schema/0001_account_data.draft.sql` explicitly says draft only / not applied.
- This is a hard deployment prerequisite: do not wire Firebase as the active app auth provider or call bootstrap from the live signup flow until a D1 database is created, the reviewed schema is applied, the binding name `DB` is configured in the production Worker, and the deployed bootstrap endpoint is verified.
- Also verified the active `AuthRepository` still uses Supabase session status, email/password auth, refresh/validation, sign-out, invalid-session recovery, and the `delete-account` Edge Function. `DeviceLinkAuthRepository` still uses Supabase RPCs and the `tv-logins-exchange` Edge Function. The Firebase session manager remains staged and not wired to AuthScreen.
- No application code, D1 resources/schema, Cloudflare Worker bindings/deployments/secrets, Firebase settings, Firestore data, or Supabase service/data were changed in this step.
- Next safe action: create the free-tier Cloudflare D1 database for the existing account schema and share its database name/ID (not credentials). Then review the SQL before applying it, add the exact binding to Worker configuration, deploy through the verified production pipeline, and test bootstrap/device registration with a dedicated test account before changing client auth.


## 2026-11-13 — Cloudflare D1 database created and production Worker rechecked

- User confirmed the Cloudflare D1 database `watchathome-accounts` was created.
- Confirmed database ID: `a39fe326-52c2-442c-ae71-5a11908059c7`.
- Re-fetched the current `premium-worker/wrangler.toml` from the approved User App branch and `wrangler.toml` from the standalone production Worker repository `bugoyweak7/WatchAtHomePremiumWorker`; both currently have no `[[d1_databases]]` binding.
- The production Worker configuration currently identifies `watchathome-premium-api` and Firebase project `watchathome-admin`, but the D1 database is not yet connected.
- The account-data SQL remains a draft and has not been applied. No Worker configuration, deployment, D1 schema, Firebase data, or Supabase service/data was changed in this step.
- Next safe step: finish reviewing the complete D1 schema and confirm the standalone production Worker source and migration compatibility before applying SQL or adding the D1 binding. Keep Supabase active for rollback until all replacement flows pass verification.


## 2026-11-14 — Supabase removal readiness audit (read-only)

- User instruction: proceed with the Supabase-to-Firebase/Cloudflare migration, but do NOT remove Supabase until evidence proves removal is safe. No assumptions; require verified source/API parity, successful tests/builds, live integration checks, data/rollback readiness, and a final repository-wide reference/dependency audit before removal.
- Re-scanned the complete recursive Git tree for `bugoyweak7/WatchAtHomeV2` on `setup/firebase-cloudflare-zero-cost`: 2,444 entries; response not truncated. The tree still contains Supabase-named source files: `SupabaseProvider.kt`, `SupabaseEndpointConfig.kt`, `SupabaseLibrarySyncAdapter.kt`, `SupabaseProgressSyncAdapter.kt`, `SupabaseWatchedSyncAdapter.kt`, the library adapter test, and the migration map.
- Re-fetched active `AuthRepository.kt`: it still imports/calls Supabase Auth for session observation, session validation/refresh, email/password registration/sign-in, sign-out/session clearing, and the `delete-account` Edge Function. Staged Firebase Auth is not yet the active auth implementation.
- Re-fetched `DeviceLinkAuthRepository.kt` earlier in the audit trail and migration map: TV/device linking still depends on Supabase Auth, PostgREST RPCs and the `tv-logins-exchange` Edge Function. Replacement device-link approval/exchange and Firebase custom-token flow are not proven complete.
- Re-fetched `SupabaseProvider.kt` and `SupabaseEndpointConfig.kt`: the shared Supabase client still configures Auth, PostgREST, Functions, Storage and Realtime. It is still required by active app paths.
- Re-fetched the active library, watch-progress and watched-items Supabase adapters: each still calls Supabase RPCs. Cloudflare counterparts exist in source, but prior status records say they are staged/opt-in and not switched into active repositories. Cloudflare sync flag remains false by default.
- Re-fetched `composeApp/build.gradle.kts`: it still generates `SupabaseConfig.kt`, reads `NUVIO_SUPABASE_URL`, `NUVIO_SUPABASE_ANON_KEY`, and `NUVIO_SUPABASE_FALLBACK_URL`, and declares Supabase PostgREST/Auth/Functions/Storage/Realtime dependencies. `gradle/libs.versions.toml` still declares Supabase libraries.
- Existing migration map identifies additional Supabase-backed areas requiring parity review: profiles/PIN/locks, profile settings, installed add-ons/plugins/collections, home-catalog settings, provider credentials, media servers, membership overview/access, member asset storage, account deletion, and Watch Party PostgREST + Realtime. Worker route presence alone is not proof of live deployment or mobile cutover.
- Current evidence conclusion: **Supabase is NOT safe to remove.** Removing it now would break active authentication and multiple sync/account/realtime paths. Keep Supabase source, dependencies, runtime configuration, and service/data intact as rollback until each replacement is wired, tested, live-verified, and data migration/retention is settled.
- This audit was read-only with respect to application code and cloud resources. Only this status/migration documentation and changelog are being updated. No source adapters, Gradle dependencies, Supabase service/data, Firebase settings, D1/R2 resources, secrets, or deployments were changed.
- Next work item: create a feature-by-feature evidence matrix for the active Supabase call sites, their Firebase/Worker replacements, required D1/Firestore/R2/DO bindings, tests, and cutover/rollback gates. Then select one low-risk feature for end-to-end migration; do not perform a global Supabase removal.

## 2026-11-14 — Firebase auth and account/device migration evidence matrix

### Active app identity path — BLOCKED
- Re-read current AuthRepository.kt, AuthScreen.kt, and AppGate.kt. AuthScreen and AppGate still call/observe AuthRepository; that repository imports SupabaseProvider and Supabase Auth for session observation, validation/refresh, email/password sign-in/up, sign-out, and invalid-session handling.
- AuthRepository still exposes signInAnonymously() using a locally generated UUID. AuthScreen still calls it from the “Continue without account” actions. This conflicts with the approved registered-email/password-only policy.
- AuthRepository still invokes the Supabase delete-account Edge Function; local account cleanup is tied to the old session-loss path. Do not replace this with Firebase Auth user deletion alone.
- FirebaseAuthGateway and FirebaseAuthSessionManager exist and support Firebase email/password create/sign-in, sign-out, auth-state observation, and fresh ID-token retrieval. Their source comments explicitly say they are staged and must not replace AuthRepository until protected app data APIs and device-link/account deletion are migrated.
- Android CI run 43422907365 passed the Firebase Auth integration Android Play Store variant compile. This is compile evidence only; it does not prove active app wiring, iOS compilation, live Firebase auth, or backend compatibility.

### Worker account bootstrap and device registry — SOURCE + CI PASS; LIVE FLOW NOT PROVEN
- Re-read standalone Worker bugoyweak7/WatchAtHomePremiumWorker on the approved setup branch. src/index.ts contains authenticated POST /v1/account/bootstrap, POST /v1/devices, GET /v1/devices, and DELETE /v1/devices/{installationId} routes.
- Firebase ID-token verification derives UID from the token and currently accepts Firebase sign_in_provider=password; anonymous tokens are rejected. Account bootstrap validates Firebase account creation metadata through Identity Toolkit, creates/checks the D1 account root idempotently, and initializes the existing immutable trial flow.
- Device register/list/revoke operations require an active D1 account and scope rows to the verified token UID. They are not TV pairing or Firebase custom-token exchange.
- Standalone Worker wrangler.toml binds DB to watchathome-accounts (ID a39fe326-52c2-442c-ae71-5a11908059c7) and Preview DB to watchathome-accounts-preview (ID 38cb13eb-dfbd-403f-92a9-43b545d6375c). Worker status records report 19 application tables and 9 indexes applied/verified in both D1 databases. This is schema presence, not proof of route-level production integration.
- Worker CI run 43545476435 passed its TypeScript and D1 test job after the Worker default export fix. Tests/CI do not prove real Firebase/Firestore/remote D1 behavior or production deployment.
- The duplicate nested premium-worker/ copy in the User App repository has a different wrangler.toml that does not declare the standalone Worker's D1 binding. Treat bugoyweak7/WatchAtHomePremiumWorker as the approved standalone Worker repo for deployment configuration; do not infer its configuration from the nested copy.

### TV device-link — BLOCKED
- DeviceLinkAuthRepository.kt still calls Supabase PostgREST RPCs start_device_login_session and poll_tv_login_session, invokes tv-logins-exchange, and imports a Supabase access/refresh-token session.
- Current Worker route dispatch has no /v1/device-link/* start, approve, poll, or one-time exchange endpoints. D1 has a device_link_sessions table, but table existence is not an implemented pairing flow.
- Firebase custom-token minting, narrowly scoped custom-token verification, browser/app approval, nonce binding, one-time atomic exchange, expiry, replay protection, brute-force rate limiting, and cancellation/revocation remain unimplemented/unverified as an end-to-end flow.

### Account lifecycle and cutover matrix
| Capability | Current active app path | Firebase/Worker replacement evidence | Gate |
|---|---|---|---|
| Email/password sign-up/sign-in/session | Supabase AuthRepository | Staged Firebase gateway/session manager; Worker accepts password-provider ID tokens | BLOCKED: wire only after every protected API and account path accepts Firebase identity |
| Anonymous/local UUID | signInAnonymously() in active AuthRepository/UI | Firebase session manager rejects anonymous Firebase sessions | BLOCKED: remove UI/path only with approved migration and local-data preservation behavior |
| Account bootstrap/trial | Legacy auth lifecycle | Worker /v1/account/bootstrap; D1 account root + Firestore trial initialization | PARTIAL: source and CI pass; live Firebase/Worker/Preview integration and dedicated test-account verification required |
| Device registration/list/revoke | Supabase registration path still present in app | Worker /v1/devices routes backed by D1 | PARTIAL: route/CI/schema evidence; mobile client wiring and live tests required |
| TV device-link | Supabase RPC + Edge Function + imported Supabase session | D1 table only; no Worker pairing routes | BLOCKED: implement and test full Firebase custom-token pairing flow |
| Account deletion | Supabase delete-account Edge Function | D1 deletion-job table is only schema; no complete Worker deletion route/state machine proven | BLOCKED: cross-store deletion, reauth, retry, Firebase Auth deletion and data retention required |
| User data sync | Supabase adapters/RPCs still active in multiple repositories | Some Worker APIs and staged Firebase-token adapters exist | BLOCKED: per-feature parity, active adapter wiring, live end-to-end tests and rollback |
| Membership/supporter/subscription | Supabase membership RPCs | Existing Worker premium/trial status is not equivalent to full supporter/subscription overview | BLOCKED: identify authoritative membership source and preserve semantics |

### Next safe task
- Continue the evidence matrix for the remaining user-owned resources and verify every staged adapter against the current Worker route/schema. Then define the first end-to-end test in isolated Preview using a dedicated test account, after verifying Preview-only Firebase secrets and Worker deployment. Do not switch active app auth, enable Cloudflare sync globally, delete anonymous/local data, remove Supabase, or deploy Production as part of this audit.
- No app source, Worker runtime, Firebase project settings, Cloudflare resources, secrets, production data, or deployments were changed by this audit. Documentation only.


## 2026-11-14 — Isolated Preview Firebase Android configuration
- Replaced only `androidApp/src/debug/google-services.json` with the supplied Firebase project configuration for `watchathome-preview`.
- Verified the configuration contains the app registrations `com.nuvio.app`, `com.nuviodebug.com`, and `com.tapframe.watchathomeadmin`; the Gradle debug variant uses `com.nuviodebug.com`.
- Left `androidApp/google-services.json` (Production project) unchanged. No authentication flow, app source, Worker, cloud resource, secret, or deployment was changed.
- This is configuration only: the active app authentication repository still uses Supabase; Firebase account creation is not enabled by this change.


## 2026-11-14 — Supabase migration evidence matrix created

- Added `docs/SUPABASE_MIGRATION_EVIDENCE_MATRIX.md` from the current approved-branch source audit and existing migration contract.
- The matrix records legacy client contracts, Firebase/Cloudflare replacement evidence, status and remaining gates for authentication, anonymous access, account/device lifecycle, TV pairing, account deletion, profiles/PIN, profile settings, add-ons, plugins, collections, library, watch progress, watched history, home catalogue settings, provider credentials, media servers, membership, Watch Party, Storage and build/runtime dependencies.
- Explicitly separated the shared Admin Firestore add-on catalogue from each user's installed add-ons.
- Recorded that upstream Supabase SQL/RLS/trigger/Edge Function/Realtime server definitions are unavailable because the user does not own the inherited project; no remote user-data migration is claimed.
- Current conclusion remains that Supabase is required by active paths and is not safe to remove. The document defines Preview, identity, security, feature-cutover, platform, data/rollback and final dependency-audit gates.
- Documentation only. No app/Worker source, adapters, Gradle dependencies, Firebase/Cloudflare settings, secrets, D1/R2/DO resources, Supabase service/data, production data or deployments were changed.
- Next implementation gate: verify isolated Preview runtime prerequisites, then complete and test Firebase account lifecycle (including TV device-link and full account deletion) before wiring Firebase as the active mobile identity.


## 2026-11-14 — Master handover reporting rule and Supabase matrix

- User directed that all full project reports must be contained in `WATCHATHOME_MASTER_HANDOVER.md`.
- Appended the complete Supabase migration evidence matrix and reporting workflow to the master handover. The master handover is the authoritative location for full reports, audits, test results, blockers and handover updates.
- Future work must not create separate report documents. `SETUP_STATUS.md` and `CHANGELOG.md` retain concise operational entries; do not duplicate full reports in `REPORT_LOG.md`.
- The earlier standalone matrix file remains as historical evidence; no historical file was deleted or rewritten.
- Documentation only. No application source, cloud resources, secrets, data, deployments or Supabase configuration changed.


## 2026-11-14 — Preview environment verification report

- Re-verified current Preview/Production Firebase project IDs and D1 database IDs in the approved standalone Worker Wrangler config.
- Confirmed User App debug Firebase config targets `watchathome-preview` and includes the debug and Admin package registrations.
- Confirmed Worker source requires Firebase Web API key and service-account secrets, checks service-account project match, and exposes password-provider-only Firebase token verification and account bootstrap.
- Preview secret presence/correctness, Firebase Console permissions, exact Preview deployment URL/version and live health/bootstrap remain unverified. No secret values were accessed.
- Worker source still has no complete TV device-link exchange or account-deletion flow. Active mobile auth remains Supabase.
- Full evidence, limitations and next action are appended to `WATCHATHOME_MASTER_HANDOVER.md`.
- Read-only verification only; no source, cloud configuration, secrets, data, Supabase settings or deployments changed.


## 2026-11-14 — TV device-link client implementation blocked by active-auth boundary
- User approved the proposed client implementation scope. A fresh source check found the active User App authentication, device registration, and device-link exchange are still Supabase-backed; Firebase auth remains staged.
- The Premium Worker already accepts its narrowly scoped `tv_linked=true` custom-token identity and exposes start/approve/poll routes. Preview backend testing passed, but this does not make the Firebase session an active User App session.
- A Firebase-only TV sign-in would not establish the Supabase session required by the current app runtime and existing feature adapters. Mobile approval also needs a Firebase identity that is safely linked to the active app account; matching email alone is not verified as an identity link.
- No separate Android TV target was found in the authorized User App repository. The current Android flavors are `full` and `playstore`; the main manifest has no Leanback launcher declaration.
- No application source or tests were changed/run. No cloud resources, secrets, deployments, Production settings, or Supabase services/data were changed. Full blocker analysis and required next gate are in `WATCHATHOME_MASTER_HANDOVER.md`.
- Next: approve a staged active-auth/data-access integration design and confirm the intended TV target before implementing client changes. Keep Supabase active for rollback.


## 2026-11-14 — Preview legacy identity verification endpoint staged
- Premium Worker setup branch now includes authenticated `POST /v1/migrations/legacy/verify`, which independently validates a recent Firebase email/password session with verified email and a current non-anonymous Supabase session through Supabase Auth `/auth/v1/user`.
- New optional Preview Worker configuration names are `LEGACY_SUPABASE_URL` and `LEGACY_SUPABASE_ANON_KEY`; no values were supplied or configured. No service-role key is used.
- The endpoint verifies identities only: it creates no account link, migration record, D1 row, or data transfer. HTTP tests were added, but CI and live Preview testing are not confirmed.
- Full implementation details, security boundaries, exact commits, and next gates are appended to `WATCHATHOME_MASTER_HANDOVER.md`.
- No User App source, Production deployment/configuration, cloud secrets, D1 data/schema, Firebase settings, Supabase services/data, or account records were changed.

## 2026-11-14 — Firebase/Supabase identity migration design
- GO was used for the identity-migration design/documentation step only; no runtime source or cloud resource changed.
- The active User App AuthRepository and device-link client remain Supabase-backed. Firebase gateway/session manager remain staged; Firebase email-verification orchestration is not yet exposed.
- Worker `POST /v1/migrations/legacy/verify` verifies dual sessions but creates no durable link. Current D1 schema has no Firebase-UID-to-legacy-user-ID mapping table.
- Design decision: use explicit dual-authenticated, one-to-one identity linking; never auto-link by matching email; retain both sessions/adapters until feature-by-feature parity. Full design and test gates are appended to WATCHATHOME_MASTER_HANDOVER.md.
- Next implementation requires separate approval: additive Preview D1 identity-link migration and idempotent/conflict-safe Worker link endpoint, followed by User App email-verification and dual-session linking flow.



## 2026-11-14 — Worker identity-link backend source implementation

- Premium Worker setup branch now contains additive migration `0002_legacy_identity_links.sql`, the conflict-safe identity mapping module, and authenticated `POST /v1/migrations/legacy/link`.
- Endpoint requires recent verified Firebase password authentication, verified email, an active bootstrapped D1 account, and a valid registered legacy Supabase session. It supports exact retries and rejects either-side remapping.
- HTTP/schema tests were added. CI run `43585777914` was pending at the time of this note.
- Full implementation and commit details are in `WATCHATHOME_MASTER_HANDOVER.md`.
- Source only: no D1 application, Worker deployment, Preview secrets/configuration change, live mapping, User App login change, Production operation, or Supabase data/settings change.


## 2026-11-14 — Legacy identity-link Worker CI passed

- GitHub Actions run #31 (`43585951934`) for source/test commit `fd3922734c3ecd61fd77b7f9167c54141c2778aa` completed successfully.
- Verified steps: dependency installation, TypeScript check, D1 schema tests, Worker module tests, HTTP/auth tests (including identity-link success/retry/conflict/stale-auth/bootstrap cases), crypto, credentials, PIN, PIN-store, rate-limit, profile, and profile-sync suites.
- During test development, CI identified two test-only fixture/assertion issues: a foreign-key case used an existing account, and SQLite row objects have null prototypes. Both tests were corrected; the final full workflow passed. No runtime workaround or assertion weakening was used.
- This confirms source-level and mocked HTTP/D1 test coverage only. It is not a live Preview integration test.
- Migration `0002_legacy_identity_links.sql` has not been applied to Preview D1; Worker has not been deployed; no Preview secrets/variables, Firebase/Supabase settings/data, User App runtime auth, or Production resources were changed.


## 2026-11-14 — Preview migration/deployment approval received; execution blocked by access boundary

- User explicitly approved the next gate: apply migration `0002_legacy_identity_links.sql` to Preview D1, deploy the Preview Worker, and verify it.
- Re-verified the approved Worker branch configuration: Preview D1 name `watchathome-accounts-preview`, ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`; Preview Firebase project ID `watchathome-preview`. Production D1 and Firebase project identifiers are distinct in `wrangler.toml`.
- No Cloudflare account/D1/Workers management connector is available in this session. GitHub access is read-only for workflow/deployment resources; GitHub workflow dispatch is not available. User explicitly prohibited TinyFish, so no browser automation was attempted. The public Preview health URL could not be independently reached through the available web fetch.
- Therefore no live D1 migration listing, Preview database existence/identity check, migration application, Worker deployment, secret/variable update, or live endpoint test was performed. This is an access/tooling blocker, not a reported Cloudflare failure. No cloud state was changed.
- Before execution, Cloudflare access must be provided through a supported Cloudflare integration or the user must run Wrangler from the authorized Worker checkout. Use Wrangler's Preview D1 targeting only (`--preview`); do not use Production database name/ID or a plain production `wrangler deploy`. First list Preview migrations and verify the target; only then apply pending migration 0002. Preview deployment uses Wrangler's `preview` command, not Production `deploy`.
- Official command references: Cloudflare D1 Wrangler commands (<https://developers.cloudflare.com/workers/wrangler/commands/d1/>) and Worker Preview command (<https://developers.cloudflare.com/workers/wrangler/commands/workers/>).
- Supabase remains active. User App runtime authentication remains unchanged. No Production, Firebase/Supabase settings or data, secrets, or account records were modified.


## 2026-11-14 — Staged Firebase email-verification foundation

- Extended the existing GitLive Firebase Auth gateway with send-verification and reload-current-user operations, and added the Firebase `isEmailVerified` snapshot field.
- Staged Firebase registration now sends a verification email after account creation. The session manager exposes verification status, supports resend while unverified, and reloads the Firebase user to detect a completed verification link.
- Added focused tests for verification-email delivery, resend, refreshed verified status, mismatched/missing sessions, anonymous rejection and sign-out state cleanup.
- Kept the active `AuthRepository`, `AuthScreen`, Supabase adapters/dependencies, Worker routes, account bootstrap and Production configuration unchanged. This is a foundation only; it does not block the current Supabase login or yet connect verification to Worker bootstrap.
- Source commits: `7467a697f715690700c1410206f0e681aa55ceae`, `01382cf0e03dfba4260403c301adfe6ea64a56d3`, `fc3ba156be2c2c88557a38fa0e5b7165492788da`.
- Test execution/CI result is pending; source commits are not treated as build verification. No Preview/Production deployment, Firebase Console change, secret/configuration change, D1/Firestore mutation, Supabase service/data change, or user-account operation occurred.
- Next gate: run focused common tests and Android/iOS compilation; fix any compile/test issues before implementing the separate Worker bootstrap integration.

## 2026-11-14 — Staged Firebase email-verification settings UI

- Added a separate Firebase account-preparation card to Account Settings for users with a signed-in, non-anonymous legacy account.
- Supports Firebase email/password account creation or sign-in, verification-email resend, and refreshing verification status after opening the email link.
- The UI explicitly states that this is preparation only: it does not link Firebase to Supabase, call Worker bootstrap, or change the active Supabase login/data adapters.
- Added the settings UI files to the Firebase Auth GitHub Actions path filters so Android compilation and focused auth tests run for these changes.
- Source commits: `bd727edf26d5953f23aa733f6186d4c10312407c`, `ff7c0593c8f586a7ab0fb46b84b1885f7320de2c`, `a5e66fe88c5072053cc7ad501cd52ff7b2c6a368`.
- CI result pending; do not treat the UI as build-verified until the workflow completes successfully.
- No active Supabase auth behavior, Supabase adapters/dependencies, Worker, cloud configuration, Preview/Production resources, secrets, or account data were changed.
- Full details and next gate are recorded in `WATCHATHOME_MASTER_HANDOVER.md`.

## 2026-11-14 — User App Supabase dependency audit (Firebase-only account direction)
- Re-audited the approved User App branch source and existing migration evidence. Active AuthRepository, device-link flow, shared Supabase provider/config, library/progress/watched adapters, profile/settings/credentials/media-server/add-on/plugin/collection sync, Watch Party Realtime, membership/assets, and five Supabase SDK modules remain migration work.
- Firebase auth preparation and Worker APIs are staged but do not yet replace active app authentication or every feature. The immediate priority is Firebase-native active auth + complete account/device lifecycle, then feature-by-feature Worker cutover and regression tests.
- User has no Supabase account/project; do not request/configure legacy Supabase credentials or use identity-link migration 0002. No code or cloud resources changed. Full findings and phased plan are in WATCHATHOME_MASTER_HANDOVER.md.


## 2026-11-14 — Firebase Preview bootstrap client staged

- Added a verified-email-gated, user-initiated call from the staged Firebase session to `POST /v1/account/bootstrap` using the configured HTTPS Cloudflare Worker base URL.
- Requires Worker confirmation `accountReady: true`; safe to retry against the create-only bootstrap contract.
- Active Supabase-backed login and existing app data paths remain unchanged. No cloud deployment or production operation performed.
- Validation pending: focused Firebase Auth tests and Android build/CI; verify the build's Worker URL targets Preview.
- Full implementation notes: appended to `WATCHATHOME_MASTER_HANDOVER.md`.


## 2026-11-14 — Preview APK workflow prepared

- Added manual GitHub Actions workflow `.github/workflows/watchathome-preview-apk.yml` for the approved setup branch. It injects the Preview Worker URL at build time, runs Firebase Auth session-manager tests, builds the Play Store debug APK and uploads a seven-day artifact.
- Commit: `7ca6abac1d9369c65ecc9edd9aa0f971481079c4`.
- Workflow dispatch is not available through the connected GitHub tool. User must start it in GitHub Actions on branch `setup/firebase-cloudflare-zero-cost`; artifact/build result remains pending. Full details in `WATCHATHOME_MASTER_HANDOVER.md`.


## 2026-11-14 — Preview-only Firebase entry point added to login screen

- Added a login-screen entry point that opens the existing Firebase account verification/bootstrap card, so the staged Firebase test can be reached before the Supabase-gated Settings screen.
- The entry point is controlled by generated PreviewFirebaseAccessConfig.ENABLED; it defaults to false and is enabled only by the manual Preview APK workflow through WATCHATHOME_PREVIEW_FIREBASE_ACCESS=true.
- Existing Supabase login, AppGate routing, active app identity, and account/data adapters were not replaced or modified.
- Updated the Preview APK workflow to set the Preview-only flag. The workflow remains restricted to setup/firebase-cloudflare-zero-cost and continues using the Preview Worker URL.
- Commits: 7a12abc0cd98e72b799ae33f5577db32f3b5d50d (AuthScreen), de876999f8b233fca1d18eba79e899cff0536c26 (runtime build config), 63d50a99d43aca3a349482734bd89c2c42c2f276 (Preview workflow).
- Validation is not yet complete: the updated workflow has not yet been run, so Kotlin compilation, Firebase Auth tests, APK artifact creation, and device behavior remain pending. Do not install/use a new APK until the workflow passes.
- No cloud resource, Firebase project setting, Worker deployment, secret, Production endpoint, or Supabase configuration was changed. Full handover details appended to WATCHATHOME_MASTER_HANDOVER.md.


## 2026-11-15 — Preview Firebase trial status display

- Updated the Preview Firebase account flow to parse the trial details returned by the existing `/v1/account/bootstrap` response.
- The Preview tools now display whether the Cloudflare account is active, whether the 7-day trial is initialized, and the returned trial start and expiry timestamps.
- The existing bootstrap endpoint remains unchanged; its create-only trial initialization behavior is preserved. No new endpoint, polling, production deployment, cloud configuration, or Supabase cutover was performed.
- Pending verification: run Firebase Auth unit tests and Android Play Store debug compilation on the approved setup branch, then rebuild the Preview APK before installing this UI update.


## 2026-11-15 — Firebase trial status visibility build fix
- Corrected `FirebaseTrialStatus` from `internal` to public visibility because the public `FirebaseAuthRepository.bootstrapCloudflareAccount()` API returns `Result<FirebaseTrialStatus>`.
- Addresses the Kotlin compiler error from Firebase Auth Build run `43614099352`.
- Source commit: `78034fa69b39671e0c51d330d8f26f107acdc538`.
- Verification is pending. The failed run stopped at test compilation; Android compilation and APK packaging did not run.
- What is happening: source fix committed; CI result pending. Are we building now: no new build has yet been confirmed. Does the user need to do anything: no. Next: inspect CI, then run the separate Preview APK workflow if CI passes.

 
## 2026-11-15 — Preview trial verified; Firebase active-auth migration handover

- Verified Preview APK workflow run `43617004862` (workflow: **WatchAtHome Preview APK**) completed with conclusion `success` on branch `setup/firebase-cloudflare-zero-cost`, commit `f37a1a625429b95861d6ec06beb9a5f96a19cfe6`.
- Verified uploaded artifact `watchathome-preview-playstore-debug-apk`, artifact ID `14122798970`. User supplied an on-device screenshot from the updated Preview tools showing Firebase email verified, Cloudflare account Active, 7-day trial Initialized, and trial start/expiry timestamps. Device verification is based on the user's screenshot.
- Firebase Auth Build run `43615293783` on commit `78034fa69b39671e0c51d330d8f26f107acdc538` completed successfully: Firebase Auth session-manager unit tests and Android Play Store debug compilation passed. This was a compile/test workflow, separate from the Preview APK artifact workflow.
- Read-only Phase 1 audit reconfirmed: `AuthRepository.kt` still uses Supabase for active session monitoring, email/password signup/sign-in, validation/refresh, sign-out, invalid-session recovery and account deletion; `AuthScreen.kt` submits normal login through this repository; `AppGate.kt` still initializes/observes it; `DeviceLinkAuthRepository.kt` still uses Supabase RPC/functions and imports Supabase sessions; `SupabaseProvider.kt` still creates Auth, PostgREST, Functions, Storage and Realtime clients. `FirebaseAuthSessionManager.kt` and `FirebaseAuthRepository` remain separate/staged.
- Decision: do not replace active `AuthRepository` or wire Firebase into `AppGate` yet. Firebase-only login before migrating dependent account/data/device-link services could authenticate users without preserving required app services. Next implementation gate is to strengthen and test the Firebase-native repository/session lifecycle in isolation, retaining the current active repository as rollback; then migrate dependent Worker-backed services before active-login cutover.
- No application source, Worker source/deployment, cloud resource, Firebase settings/data, D1/Firestore data, secrets, Supabase configuration/data, or Production resource was changed in this audit/report update. Documentation only.
- **Mandatory status format for every future WatchAtHome report and Master Handover update:**
  1. What is happening?
  2. Are we building right now?
  3. Do you need to do anything?
  4. What is the next step?
  Answers must distinguish source coding, tests, APK packaging, user/device testing, and waiting for user action.
- **What is happening?** Preview bootstrap/trial is verified and Phase 1 authentication audit is complete.
- **Are we building right now?** No; this update is documentation-only.
- **Do you need to do anything?** No.
- **What is the next step?** Continue with isolated Firebase repository/session lifecycle work only after checking the latest source and tests; do not switch active login or remove Supabase dependencies at this stage.

 
## 2026-11-15 — Firebase session lifecycle regression coverage added

- Added focused tests to `FirebaseAuthSessionManagerTest.kt` for idempotent initialization, observer cancellation/reinitialization after `stop()`, live auth-state changes, and preserving authenticated state when Firebase sign-out fails so the user can retry.
- Test-only change; no production authentication code, active `AuthRepository`, `AppGate`, login screen, Supabase dependency, Worker, cloud resource, secret, or account data changed.
- Source commit: `bc9e56b634edaf39a16eafb2d278d82a1c92e6a7`.
- CI is triggered by the existing Firebase Auth workflow path filter. Test/build result must be checked before claiming validation.
- What is happening? Firebase session lifecycle regression tests have been added.
- Are we building right now? CI status must be checked; no APK workflow is requested by this test-only change.
- Do you need to do anything? No, pending CI result.
- What is the next step? Verify focused Firebase Auth tests and Android Play Store debug compilation; address any failure before expanding the migration.

## 2026-11-15 — Authenticated account status endpoint added

- Added `GET /v1/account` to the Premium Worker. It derives the account UID exclusively from the verified Firebase token and returns the matching D1 account lifecycle fields: status, createdAt, updatedAt, and deletedAt.
- Added an owner-scoped `getAccount` query and tests for active/pending status, missing accounts, and UID isolation.
- Source commits: `ef03d2e4625b470d419c6f9dab0a4aa5b3d3b3f3` (`account-device.ts`), `4b89425a590c1f2141a3d54ab90c1fa2d93067d7` (tests), `28a2770219496d60e3d7a136ab8e314d10bffb47` (`index.ts`).
- The existing Worker Checks workflow is path-triggered for `premium-worker/**`; CI must complete before validation is claimed. No Worker deployment or Cloudflare D1 change was performed.
- Active Supabase authentication, AppGate, device-link behavior, and all production data/settings remain unchanged.
- What is happening? The authenticated account-status API and focused ownership/lifecycle tests have been added.
- Are we building right now? CI should run the Worker type-check and test suite; no APK is being built.
- Do you need to do anything? No, pending CI result.
- What is the next step? Verify the Worker workflow, then decide whether to add client-side read-only account status integration.

## 2026-11-15 — Account route formatting correction

- The first Worker CI run (`43622490326`) caught literal escaped newline characters in the newly added route in `premium-worker/src/index.ts`; TypeScript compilation failed before tests ran.
- Corrected the route formatting in commit `2092b0ba9d3c10598af9207f234d48cfea5adb3d`. No API behavior changed. A new Worker Checks run must confirm the correction and execute the full suite.
- No deployment, D1 change, APK build, active Supabase auth change, or production resource change.
- What is happening? The TypeScript syntax issue found by CI has been corrected.
- Are we building right now? A new Worker CI run should validate the fix; no APK is being built.
- Do you need to do anything? No.
- What is the next step? Check the new Worker CI result before proceeding.

## 2026-11-15 — Follow-up route formatting correction

- The second Worker CI run (`43622597320`) found one remaining literal escaped newline immediately before the bootstrap route in `premium-worker/src/index.ts`.
- Corrected the remaining source formatting in commit `d844ffde962b09561c6626cdada1f6d66f2eca1e`. This is a syntax-only correction; no endpoint behavior changed. Await the next Worker Checks run.
- What is happening? The remaining TypeScript syntax issue is corrected.
- Are we building right now? Worker CI should validate the source and tests; no APK build.
- Do you need to do anything? No.
- What is the next step? Verify the newest Worker Checks run.

## 2026-11-15 — Account status endpoint Worker CI passed

- Worker Checks run `43622683097` completed successfully on commit `d844ffde962b09561c6626cdada1f6d66f2eca1e`: https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43622683097
- Verified successful: TypeScript compilation, local SQLite schema tests, mocked D1 account/device tests (including new account lifecycle/ownership test), Worker HTTP/Firebase authentication tests, encryption/key rotation, credential storage, PIN verifier/lockout, rate limits, profile CRUD/settings, and profile add-on/plugin/collection sync tests.
- The endpoint is source-only and not deployed. D1 draft remains unapplied. No APK build, production change, active Supabase login cutover, or Supabase removal.
- What is happening? `GET /v1/account` and the full Worker CI suite have passed.
- Are we building right now? No. CI is complete; no APK is being built.
- Do you need to do anything? No.
- What is the next step? Review and approve the read-only Firebase client adapter for displaying account status; keep active Supabase authentication unchanged.

 
## 2026-11-15 — Read-only Firebase account status client added

- Added `FirebaseCloudflareAccountStatus` and a parser for the Worker `GET /v1/account` response. The parser validates required lifecycle fields, supported account states, non-negative timestamps, and that the returned UID matches the signed-in Firebase UID.
- Added `FirebaseAuthSessionManager.getCloudflareAccountStatus()` and exposed it through the staged `FirebaseAuthRepository`. It requires a verified, registered Firebase session, obtains a fresh Firebase ID token, and performs an authenticated GET only. It does not create or update account records.
- Added common tests for active and deletion-pending account parsing, nullable/deletion timestamps, UID mismatch rejection, and malformed/unsupported payload rejection.
- Source commits: `ea151dda13b97795f6549cd9938bd8cfebc46f02` (client adapter), `594772c74101081302cd559b91d9f0952e35561e` (parser tests).
- The adapter remains separate from normal `AuthRepository`, `AuthScreen`, `AppGate`, and all active Supabase-backed services. No active login cutover or Supabase removal.
- Validation is pending: Firebase Auth CI must run common tests and Android compilation. No APK build is requested by this change. Worker remains undeployed; D1 schema remains unapplied; no cloud resources, secrets, or Production data were changed.

### Mandatory status
1. What is happening? The read-only Firebase account-status client and parser regression tests are committed.
2. Are we building right now? No APK is being built. Firebase Auth CI must validate common tests and Android compilation.
3. Do you need to do anything? No, wait for CI results.
4. What is the next step? Verify the Firebase Auth workflow; fix any compile/test failures before considering a UI display or broader account lifecycle work.

 
## 2026-11-15 — Account status authentication-gate test added

- Added a regression test confirming the staged client refuses account-status retrieval when signed out and when the Firebase account email is not verified. This test complements the payload/UID validation tests recorded above.
- Test source commit: `671576c010a6cafb8094c4205ba3bff629b6c5d2`.
- The Firebase Auth workflow path filter includes the changed manager and test files. CI result remains pending; no APK build, deployment, D1 migration, active Supabase change, or Production operation.
- What is happening? The read-only account-status client and its authentication gate now have focused regression coverage.
- Are we building right now? No APK build; the Firebase Auth CI workflow should run common tests and Android compilation.
- Do you need to do anything? No.
- What is the next step? Verify the workflow result before any UI integration or APK packaging.
