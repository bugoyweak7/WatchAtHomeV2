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
