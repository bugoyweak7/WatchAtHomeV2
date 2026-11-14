# WATCHATHOME — MASTER HANDOVER & COMPLETE STATUS ARCHIVE

**Snapshot date:** 2026-11-14 (Asia/Manila)  
**Purpose:** Single starting document for future ChatGPT conversations. This file consolidates the current project handover, rules, decisions, status reports, migration reports, architecture notes, API notes, and append-only changelogs from all three authorized repositories.  
**Primary repository:** `bugoyweak7/WatchAtHomeV2`  
**Branch for this snapshot:** `setup/firebase-cloudflare-zero-cost`

> **NEXT-CONVERSATION INSTRUCTION:** Read this entire `WATCHATHOME_MASTER_HANDOVER.md` first. Treat it as the consolidated project handover and status snapshot. Before making any code/configuration change, re-fetch the latest approved branch source and this file's source documents/commit history as needed. This file is a snapshot, not proof that repository state has not changed since 2026-11-14 (Asia/Manila).

---

## 1. Quick continuation prompt

In a new conversation, say:

**“Read WATCHATHOME_MASTER_HANDOVER.md from bugoyweak7/WatchAtHomeV2, branch setup/firebase-cloudflare-zero-cost. Continue from the latest verified status. Follow every strict rule in the file. First inspect the actual repository source and latest status before doing anything. Do not change anything until I say GO.”**

## 2. Authorized repositories and branches

| Component | Repository | Working branch | Base branch |
|---|---|---|---|
| User App | `bugoyweak7/WatchAtHomeV2` | `setup/firebase-cloudflare-zero-cost` | `repair/firebase-entitlements-and-auth` |
| Admin App | `bugoyweak7/WatchAtHomeAdmin` | `setup/firebase-cloudflare-zero-cost` | `repair/addon-catalogue-and-admin` |
| Premium Worker | `bugoyweak7/WatchAtHomePremiumWorker` | `setup/firebase-cloudflare-zero-cost` | `main` |

Only these three repositories are authorized. There is no Debug App repository; ignore it. Do not access unrelated/old repositories or the obsolete `WatchAtHomeV2-Firebase-Migration` branch/repo.

## 3. Mandatory user rules

1. Inspect actual repository source, current branch, latest status, and relevant changelog before every task. Never assume based only on an earlier conversation or this snapshot.
2. Do not change anything unless the user explicitly authorizes it. “GO” authorizes only the current agreed step; it is not blanket permission for later unrelated changes.
3. Preserve existing functionality. Prefer the smallest safe, evidence-backed change.
4. Append to status notes and changelogs. Never delete, rewrite, truncate, or overwrite historical entries.
5. Maintain `SETUP_STATUS.md` and `CHANGELOG.md` in all three authorized repositories when relevant changes are made. Also update the relevant migration/architecture documents. Keep history append-only.
6. No production deployment, production resource change, secret change, or production data migration without separate explicit approval.
7. Do not ask the user to paste secrets. Never print, commit, or expose secret values, tokens, private keys, service-account JSON, or passwords.
8. Do not claim build/test/runtime/deployment success unless the exact evidence is checked.
9. Use complete files for code delivery when requested; user prefers downloadable `.txt` files and clean source without embedded instructions.
10. Do not use TinyFish.
11. Prioritize zero/lowest-cost Firebase Spark and Cloudflare free-tier-compatible design. Minimize Firestore reads/writes, D1 queries/writes, Worker invocations, and unnecessary polling. Never promise unlimited free usage.
12. Supabase must remain intact until evidence proves safe removal. Do not remove its code, dependencies, configuration, data, secrets, or service prematurely.
13. Do not remove Nuvio legacy references unless the user authorizes a specific cleanup and verified project evidence supports it.
14. Work step-by-step and explain exactly what changed, what was tested, what remains blocked, and what the next safe step is.

## 4. Project purpose and approved target architecture

WatchAtHome is a media application with a User App, Admin App, and Premium Worker.

- **Firebase Authentication:** email/password identity only. No anonymous/guest Firebase accounts.
- **Cloud Firestore:** admin roles, premium codes, entitlements, immutable trial state, and the existing shared add-ons catalogue. Keep small shared records here.
- **Cloudflare Workers:** trusted server-side APIs; verify Firebase ID tokens and derive user ownership from verified identity.
- **Cloudflare D1:** relational/profile-scoped application data and synchronization.
- **Cloudflare R2:** uploaded files/images only when needed. Do not store movie/video binaries or large catalog artwork in Firestore/D1; prefer external artwork URLs.
- **Durable Objects:** intended option for Watch Party real-time coordination after the existing Supabase Realtime contract is fully mapped.
- Keep ownership checks server-side, scope all user data by verified Firebase UID and profile, validate inputs, rate-limit sensitive routes, use idempotency where appropriate, and preserve rollback/data export paths.

Existing premium-code, entitlement, trial, admin-role and shared add-on catalogue responsibilities remain Firestore-backed unless a separately reviewed decision changes them.

## 5. Current overall status — verified snapshot

### Supabase removal project
**Supabase is NOT safe to remove.** The active User App still uses Supabase Auth, TV device-link RPC/Edge Function, account deletion, multiple sync adapters, shared client services, generated runtime configuration, and Gradle dependencies. Some Firebase/Worker alternatives exist but remain staged or are only source/CI verified.

Keep Supabase source, dependencies, runtime configuration, project/service, data, secrets/configuration, and adapters intact until:
- every active Supabase call site has a compatible replacement;
- source and schema/API contracts are mapped;
- relevant platform builds and tests pass;
- isolated Preview live integration passes;
- data export/migration and rollback/retention are proven;
- active traffic has been safely cut over and verified;
- final zero-reference audit is complete; and
- the user explicitly approves removal.

### User App authentication
- Active `AuthRepository` remains Supabase-backed and is still used by `AuthScreen` and `AppGate`.
- It uses Supabase Auth for session observation, validation/refresh, email/password sign-up/sign-in, sign-out, invalid-session handling and the `delete-account` Edge Function.
- Active UI still exposes local anonymous/UUID sign-in via `signInAnonymously()`. This conflicts with the target registered-email/password-only model; do not simply delete it without a controlled local-data/account migration plan.
- `FirebaseAuthGateway` and `FirebaseAuthSessionManager` exist, support email/password create/sign-in, sign-out, auth-state observation and fresh ID-token retrieval, but are deliberately staged and not wired to the active auth lifecycle.
- User App Android Firebase-auth compile CI run `43422907365` succeeded for the Android Play Store variant. This does not prove active wiring, iOS build, live Firebase auth, or Worker compatibility.

### Account bootstrap and device registry
Standalone Premium Worker source includes Firebase-token-protected:
- `POST /v1/account/bootstrap`
- `POST /v1/devices`
- `GET /v1/devices`
- `DELETE /v1/devices/{installationId}`

The Worker derives UID from the verified Firebase ID token. Its verifier currently accepts password-provider tokens and rejects anonymous tokens. Bootstrap validates Firebase account metadata through Identity Toolkit, creates/checks the D1 account root idempotently, and initializes the existing Firestore trial flow. Device registry operations require an active D1 account.

These routes are source/CI verified, not proven live end-to-end with Firebase/Firestore/remote D1 or the mobile app.

### TV device-link
Still Supabase-dependent:
- mobile `DeviceLinkAuthRepository` uses PostgREST RPCs `start_device_login_session` and `poll_tv_login_session`;
- invokes `tv-logins-exchange`;
- imports a Supabase access/refresh session.
Worker currently has no complete Firebase device-link start, approve, poll, one-time exchange, or custom-token route flow. D1 `device_link_sessions` table existence is not a complete implementation.

### Account deletion
Still uses Supabase `delete-account` Edge Function. A D1 deletion-job table alone is not a deletion workflow. Complete cross-store deletion, recent-authentication/reauth, retries, Firebase Auth deletion, R2/Firestore/D1 cleanup, retention and audit behavior remain unverified.

### Worker CI
Premium Worker CI run `43545476435` succeeded: TypeScript and D1 test job passed after restoring the Cloudflare default export. This does not prove live Firebase/Firestore/D1 integration or production deployment.

### Preview and Production D1
- Production D1: `watchathome-accounts`, ID `a39fe326-52c2-442c-ae71-5a11908059c7`.
- Preview D1: `watchathome-accounts-preview`, ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`.
- Prior user verification recorded 19 application tables and 9 named indexes in both databases.
- Schema presence does not prove data migration, foreign-key behavior, route correctness, live integration or production readiness.
- Standalone Worker `wrangler.toml` has production and Preview D1 bindings named `DB`. The nested `premium-worker/` copy inside User App has different configuration and is not the standalone deployment source of truth.

### Admin App
- Admin app uses Firebase email/password and active-admin authorization model documented in its setup notes.
- Admin premium-code creation calls the Worker endpoint using Firebase ID token; Admin history reads the admin-only Firestore premium-code collection.
- Read-only Diagnostics screen/client was added for API URL validation, Worker health, Firebase session/token checks, and Worker-side service-account/Firestore/admin checks. It hides tokens/credentials and does not create premium codes or write DB data.
- Admin diagnostics build had failures from a truncated MainActivity update and inaccessible private theme colors. MainActivity was restored from approved baseline and DiagnosticsScreen color references were corrected. Latest Admin build validation was pending in the source status at this snapshot. Re-check GitHub Actions before claiming success or proceeding.

## 6. Current blockers and next priorities

1. Finish feature-by-feature Supabase call-site and adapter parity matrix.
2. Verify Preview-only Firebase secrets and deployment state without exposing secret values or reusing production secrets.
3. Run isolated Preview account-bootstrap integration with a dedicated test account; verify Firebase password ID token, Worker token validation, Identity Toolkit account lookup, D1 account row, and Firestore trial initialization. Check idempotency and failure recovery.
4. Verify mobile device registration/list/revoke against Preview Worker/D1.
5. Implement and test the complete secure TV device-link flow: start, approval, poll, one-time exchange, Firebase custom-token issuance/verification, nonce binding, expiry, replay prevention, brute-force rate limiting, cancellation and revocation.
6. Design and implement complete account deletion/export/recovery contract before replacing the existing Supabase deletion path.
7. Continue data/API parity for profiles, PIN/locks, settings, add-ons/plugins/collections, home catalogue, provider credentials, media servers, library, watch progress, watched items, membership, assets and Watch Party realtime.
8. Only after all replacements pass live tests, stage the active app cutover and rollback plan.
9. Final zero-reference audit and Supabase removal only after explicit user approval and verified no live traffic/dependencies/data obligations.

Do not switch active app auth, globally enable Cloudflare sync, delete anonymous/local data, remove Supabase, or deploy Production as part of a read-only audit.

## 7. Important CI evidence and known run history

- User App Firebase auth Android compile: run `43422907365`, success.
- Premium Worker TypeScript/D1 tests: run `43545476435`, success.
- Earlier Worker HTTP tests failed because default export was missing; Cloudflare-compatible default export was restored in source commit `c7178d6e8256f5f360839d6044d2651241da9172`, and the subsequent CI run succeeded.
- Admin latest diagnostics fixes: check latest Actions state before claiming a successful build. Earlier failed runs are recorded in the Admin status/changelog.

## 8. Important repository and source notes

- User App source and migration documents are the primary app contract reference.
- Standalone Premium Worker repository is the Worker deployment/configuration source of truth.
- The nested `premium-worker/` folder in User App is not a substitute for checking the standalone Worker repository.
- Existing Supabase database schema, RLS policies, Edge Function source and Realtime contract are not fully available in the User App repository. Do not invent them. Obtain authorized exports/source if needed before data migration or parity claims.
- Old statements in historical status documents may have been superseded by later appended addenda. Read the entire document and prioritize the latest dated evidence, while retaining historical context.

## 9. Source snapshot inventory and blob SHAs

The complete source documents below were fetched from the approved branch `setup/firebase-cloudflare-zero-cost` on 2026-11-14 (Asia/Manila). Their contents are reproduced in full in the following sections.



---

# SOURCE DOCUMENT: USER APP — SETUP STATUS

**Repository:** `bugoyweak7/WatchAtHomeV2`  
**Path:** `SETUP_STATUS.md`  
**Blob SHA at snapshot:** `2c387dea4bad418df8c2ed25d4b30a292c569f4a`  
**Original content follows in full.**

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



---

# SOURCE DOCUMENT: USER APP — CHANGELOG

**Repository:** `bugoyweak7/WatchAtHomeV2`  
**Path:** `CHANGELOG.md`  
**Blob SHA at snapshot:** `90b7b7477e496af586a089e0a5f01aa929586786`  
**Original content follows in full.**

# WatchAtHomeV2 Changelog

Entries are append-only. Do not rewrite or remove earlier records.

## 2026-11-13 — Profile backend APIs

- Added authenticated profile list/upsert/delete and profile-lock routes to the existing Cloudflare Worker.
- Added profile-settings GET/PUT synchronization with JSON round-trip preservation, including unknown/future keys.
- Enforced Firebase UID ownership, active-account/profile checks, six-profile bounds, request-size limits and rate limiting; enabled PUT/DELETE in Worker CORS.
- Added profile storage and HTTP tests. GitHub Actions run 43381569837 passed TypeScript and all 52 tests (0 failures).
- D1 remains draft-only and unprovisioned. No mobile Supabase adapter, production setting, secret, or deployment was changed.


## 2026-11-13 — Add-ons, Plugins and Collections migration backend

- Added authenticated per-profile GET/PUT Worker routes for installed add-ons, plugin repository selections, and collection blobs.
- Implemented whole-snapshot replacement semantics, profile ownership, bounded validation, duplicate URL checks, and rate limiting.
- Extended draft profile_plugins schema to match legacy row fields; retained Firestore shared add-on catalogue separation.
- Preserved complete collection JSON including unknown fields. Kept plugin scraper code/manifests on their existing repository/local-cache flow.
- Added eight SQLite storage tests and HTTP route ownership coverage. GitHub Actions run 43382547116 passed all 61 tests and TypeScript compilation (0 failures).
- D1 remains draft-only; no mobile adapter, UI, player, production resource, secret, data, or deployment changed.

## 2026-11-13 — Verified migration status baseline

- Audited the newest User App branch `setup/firebase-cloudflare-zero-cost` at commit `c4b106b8b994154208d2672f381750cf29665352` and inspected the Admin App repository on `main`.
- Confirmed the User App authentication repository still uses Supabase, including email/password auth and anonymous sign-in; Firebase Android configuration, SDK dependencies and an Android Firebase backend wrapper are present but do not yet replace the main auth repository.
- Confirmed Supabase profile/library/watch-progress adapters and Supabase runtime configuration remain in source.
- Confirmed Worker premium/trial and additional account/profile APIs exist, while D1 remains draft-only and no D1 binding is present in the inspected Wrangler configuration.
- Confirmed Admin App Firebase Auth/Firestore integration and shared `watchathome-admin` Firebase project configuration.
- Added `PROJECT_STATUS.md` as the verified source-of-truth status record. Live Firebase rules, Cloudflare secrets, D1 provisioning and deployed Worker state remain unverified.
- Documentation-only audit: no app source, database rules, cloud resources, secrets or deployments were changed.

## 2026-11-13 — Supabase migration source inventory

- Added `docs/SUPABASE_FIREBASE_CLOUDFLARE_MIGRATION_MAP.md` with source-file mappings and current Worker route parity.
- Verified that authentication, device linking, profile operations, settings sync, credentials, media servers, add-ons/plugins/collections, library/progress/watched sync, membership/premium, and Watch Party use distinct migration paths.
- Identified missing Worker route implementations for account deletion, device-link custom-token exchange, library/watch-progress/watched sync, full membership parity, and Watch Party realtime.
- Confirmed no client cutover or Supabase removal is safe yet; legacy adapters and local data must remain until replacement parity and tests pass.
- Documentation-only inventory; no app code, cloud resources, secrets, rules, data, or deployments changed.


## 2026-11-13 — Staged Firebase email/password auth foundation

- Added a multiplatform GitLive Firebase Auth gateway for email/password account creation, sign-in, auth-state observation, sign-out, and fresh ID-token retrieval.
- Added a separate staged Firebase auth session manager/repository; anonymous Firebase sessions are rejected.
- Added six common unit tests using a fake auth gateway.
- Added an Android Play Store debug compile workflow for changes to the staged Firebase auth layer.
- Kept the active Supabase AuthRepository and AuthScreen unchanged. No active provider cutover was made because Supabase-backed profile/data sync, device-link and account-deletion paths are not yet migrated.
- Account bootstrap is not connected from the app; the Worker route currently requires a D1 binding that is not configured.
- GitHub Actions run `43387942928` started; Android compilation result pending at the time of this entry.
- No live Firebase settings, Firestore rules, Cloudflare resources, D1 binding/database, secrets, deployments, or production data changed.


### Firebase Auth build follow-up

- First compile workflow run `43387942928` exposed an existing Gradle Kotlin DSL issue: the Firebase BOM `platform(...)` call was unresolved in the Android source-set dependency block. The build failed before compiling Kotlin source.
- Updated the declaration to `project.dependencies.platform(libs.firebase.bom)` to preserve BOM dependency alignment using the project DependencyHandler.
- Second workflow run `43388218215` queued; awaiting actual Android compile result.


### Firebase Auth SDK API correction — 2026-11-13
- Fixed three Firebase Auth gateway compile errors using the actual GitLive Firebase SDK 2.8.0 API: removed unsupported no-context initialization calls and corrected ID-token retrieval to use the returned nullable string.
- Source fix commit: `6cf909beab6bcf7301614f6cfc9d6784e2116d60`.
- Android build run `43388218215` failed at Kotlin compilation; the source fix triggers the next validation run.


## 2026-11-13
- CI: added the Android host-test task for the staged Firebase Auth session manager tests before the existing Play Store debug build. Commit: `4629adb63172064bf29c546e178cf8f2c0f57f1b`.
- Verification: GitHub Actions run `43399716638` was still running at documentation update time; no test/build success is claimed yet.


## 2026-11-13 — Focused Firebase Auth test run
- The initial broad Android host-test task completed 2,052 tests with two unrelated failures: `AndroidDownloadLifecycleTest` and `WatchProgressIdentityTest`.
- Updated CI to run only `com.nuvio.app.core.auth.FirebaseAuthSessionManagerTest` using Gradle's `--tests` filter. This isolates the six staged Firebase Auth tests from unrelated host-test failures.
- Commit: `9a89838d131cf1427e2ea5816db276ce9ce739ef`; focused CI result pending.


## 2026-11-13 — Reject sensitive fields in generic profile JSON
- Added recursive secret-key validation for profile settings and collections before persistence in D1.
- Preserved forward compatibility for non-sensitive unknown JSON fields.
- Added tests for nested provider API-key rejection, nested access-token rejection, and safe unknown-field round trips.
- Worker CI triggered; latest run `43401302072` pending verification.


## 2026-11-13 — Generic JSON guard verification
- GitHub Actions [run 43401302072](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401302072) passed TypeScript and 63 Worker tests (0 failures), including new profile-settings and collection secret-field rejection tests.


## 2026-11-13 — Add home catalog settings Worker endpoint
- Added profile-scoped GET/PUT endpoint for home catalog settings using existing D1 schema table and shared platform key.
- Preserves full JSON/unknown fields, increments row version, enforces owner/profile scope and request limits, and rejects sensitive fields.
- Added tests for round-trip, isolation, replacement, invalid payloads and secret rejection. Final Worker CI pending.


## 2026-11-13 — Home catalog test fixture fix
- Corrected the profile-isolation test fixture to add a second profile under the existing account instead of inserting a duplicate account row.
- CI run `43401818613` failed on the fixture setup; corrected commit `e4d38da054d928687ed759c86bcb921464c89ae7` is queued as run `43401962345`.


## 2026-11-13 — Home catalog API CI passed
- [Worker CI run 43401962345](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401962345) passed TypeScript and 65 tests across 10 suites with 0 failures, including all 11 profile add-on/plugin/collection/home-catalog tests.


## 2026-11-13 — Firebase Auth CI passed
- [Firebase Auth workflow run 43400761852](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43400761852) passed the focused `FirebaseAuthSessionManagerTest` suite and Android Play Store debug app compilation.
- No production Firebase configuration or active Supabase auth flow was changed.


## 2026-11-13 — Device registry revocation route
- Added owner-scoped `DELETE /v1/devices/:installationId` with active-account validation, rate limiting and idempotent registry revocation.
- Added SQLite unit and Worker HTTP tests. Corrected initial route/validator escaping issues; final CI run `43402508386` pending.
- This is registry deactivation only, not Firebase token revocation or remote logout.


## 2026-11-13 — Device registry revoke route CI passed
- [Worker CI run 43402508386](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43402508386) passed TypeScript and 67 tests across 10 suites with 0 failures, including device revocation unit and Worker HTTP tests.


## 2026-11-13 — Device revocation endpoint
- Added `DELETE /v1/devices/:installationId` with Firebase UID ownership, active-account validation, input validation, rate limiting, soft revocation and idempotent behavior.
- Added direct and authenticated HTTP regression tests for owner isolation and revoked inventory.
- [Worker CI run 43402508386](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43402508386) passed TypeScript and 67 tests with zero failures.


## 2026-11-13 — Library sync Worker API

- Added D1-backed library snapshot pagination, cursor lookup, ordered delta reads, item upserts, and delete tombstones.
- Added authenticated profile routes for /library, /library/cursor, /library/delta, and /library/delete; UID and profile ownership come from verified Firebase auth and D1.
- Preserved the app's existing serialized library fields and p_origin_client_id event metadata.
- Added SQLite and HTTP regression coverage for paging, delta events, delete behavior, validation, authentication, and profile isolation.
- Worker CI run 43405997252 passed TypeScript and 70 tests across 10 suites (0 failures).
- Mobile remains on Supabase; no live D1 or Worker deployment.


## 2026-11-13 — Watch-progress sync Worker API

- Added D1 snapshot, cursor, delta, upsert and delete-tombstone operations for watch progress.
- Added authenticated routes under /v1/profiles/:profileIndex/watch-progress, including cursor, delta and delete endpoints.
- Preserved the existing sync record fields and stable progress_key identity; sync events retain p_origin_client_id.
- Added SQLite and HTTP regression tests for data semantics, validation, ownership and auth.
- [Final Worker CI run 43411656192](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43411656192) passed TypeScript and 73 tests across 10 suites (0 failures).
- Active mobile sync remains on Supabase; no live D1 or Worker deployment.


## 2026-11-13 — Staged Cloudflare mobile library adapter

- Added a separate Cloudflare HTTP implementation of the existing library sync interface for snapshot, cursor, delta, upsert and delete operations.
- Added Firebase Bearer-token injection, bounded response handling, HTTPS-only Worker URL validation and size-aware request batching.
- Added optional build-time Worker URL configuration via `CLOUDFLARE_WORKER_BASE_URL`; default remains empty and no production URL is assumed.
- Added MockEngine tests and included them in the Android CI test workflow. Run 43413914695 pending final result.
- Active LibraryRepository wiring remains on Supabase.


## 2026-11-13 — Staged Cloudflare watch-progress mobile adapter

- Added a separate Worker HTTP implementation of `ProgressSyncAdapter` for snapshot, cursor, delta, upsert and delete operations.
- Added deterministic offset pagination for the Worker progress snapshot route, retaining the existing timestamp filter.
- Added MockEngine regression tests and included them in Android CI. Run 43414877340 pending.
- Supabase remains the active WatchProgressRepository adapter.


- Follow-up verification: authenticated Worker offset paging test passed in run 43415195896. Android run 43414877340 was cancelled by a later push; replacement run 43415270909 is queued for the latest mobile adapter tests.

## 2026-11-13 — Guarded Library and watch-progress adapter wiring

- Added CLOUDFLARE_SYNC_ENABLED as a generated runtime flag, defaulting to false.
- Connected LibraryRepository and WatchProgressRepository to select their Cloudflare adapters only when the explicit flag is enabled and the Worker URL is HTTPS.
- Supabase remains the active/default path. No automatic fallback after a failed Cloudflare request is introduced, avoiding silent split-brain writes if the flag is intentionally enabled later.
- This change does not provision D1, deploy a Worker, switch authentication, or migrate production data.
- Android CI verification is pending after the previous run was cancelled by a subsequent push.

- Fresh Android CI run 43416885505 was triggered by the final adapter/config source commit and is currently queued; do not mark the mobile wiring build-verified until this run completes successfully.

- CI follow-up: run 43416885505 has moved from queued to in progress. The focused Firebase/Auth + Cloudflare adapter host-test step is currently running; Android Play Store debug compilation is pending. No pass is claimed yet.


## 2026-11-13 — Firebase authentication dependency audit

- Audited the current login and identity-dependent feature source before planning any auth cutover.
- Confirmed active Supabase dependencies in AuthRepository, profile RPCs, device-link login exchange, device registration, membership access/overview, and account deletion.
- Confirmed staged FirebaseAuthRepository is not yet wired into AuthScreen or AppGate. This is intentional; replacing only the login screen would leave feature calls expecting Supabase sessions.
- No source behavior changed. CI run 43416885505 was still running at audit time; do not claim Android build success.


## 2026-11-13 — Backend auth audit and Android CI verification

- Android CI run `43416885505` completed successfully: Firebase Auth session-manager unit tests and Android Play Store debug compilation both passed.
- Audited the existing in-repository Cloudflare Worker: Firebase email/password ID-token verification is implemented; account bootstrap, device registration, profile, library, watch-progress, PIN, premium, and trial routes exist in source.
- The Worker currently rejects non-password Firebase sign-in providers. It does not implement the proposed Firebase device-link exchange, while the active app's TV pairing still depends on Supabase RPCs and the `tv-logins-exchange` Edge Function.
- D1 schema is draft-only and no D1 binding is configured in `wrangler.toml`; no live D1 integration is established. Keep Cloudflare sync disabled.
- Supabase schema/RLS/Edge Function source is not present in the scanned app repository. An authorized schema export is required before safe legacy UID mapping and migration design.
- No production or application behavior changed; Supabase remains active.


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

- Added Firebase-token authenticated Cloudflare profile list, upsert, and delete client operations matching the existing Worker routes.
- Added adapter unit tests for response mapping, request methods and payload, bearer authentication, and missing-token rejection.
- Updated the Android Play Store CI workflow to run the new test suite and watch the new adapter/test paths.
- Kept the adapter unwired from `ProfileRepository`; Supabase remains the active profile backend until Firebase auth, D1, and Worker are proven end to end.
- No live cloud resources, secrets, or production data were modified.


## 2026-11-13 — Staged Cloudflare profile settings adapter

- Added Firebase-token authenticated profile-settings GET/PUT adapter using the existing Worker routes and a JSON-object payload that preserves unknown settings fields.
- Added focused adapter tests and Android CI workflow coverage.
- Kept active profile settings synchronization on Supabase; no cutover or live cloud changes occurred.


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


## 2026-11-13 — Premium API 404 observed during Admin APK test

- User confirmed Admin Firebase login works. The installed Admin APK's Premium screen displays `Premium service request failed (HTTP 404)`; user did not press Generate Codes.
- Rechecked Admin client request path (`POST /v1/admin/premium-codes`), configured base URL, Worker source route, and Wrangler Worker name. The source/configured paths match.
- No application source change is justified yet. Investigate live Cloudflare deployment and workers.dev hostname/account-subdomain parity before changing code.
- Live `/health` could not be independently queried from this environment. No deployment, secrets, Firebase configuration, or production Firestore data was changed.


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


## 2026-11-14 — Supabase removal readiness audit

- Re-scanned the complete User App setup branch and re-verified active Supabase authentication, device-link, data-sync, runtime configuration and dependency references.
- Confirmed Supabase remains active in AuthRepository and multiple feature paths; Firebase/Cloudflare replacements are incomplete or staged. Supabase is not safe to remove.
- Recorded evidence and the required staged migration/verification gates in SETUP_STATUS.md and the Supabase migration map. No application source or cloud resource was changed.

## 2026-11-14 — Firebase auth/account/device evidence matrix
- Re-audited active User App auth/UI/AppGate, staged Firebase auth, device-link repository, and standalone Premium Worker account/device routes.
- Recorded the current migration matrix and blockers in SETUP_STATUS.md, docs/SUPABASE_FIREBASE_CLOUDFLARE_MIGRATION_MAP.md, and docs/FIREBASE_CLOUDFLARE_ACCOUNT_MIGRATION_CONTRACT.md.
- Confirmed Android Firebase auth compile CI run 43422907365 and Worker TypeScript/D1 test CI run 43545476435 passed; neither establishes live integration or active app cutover.
- Documentation only. No app source, Worker runtime, Firebase/Cloudflare settings, secrets, production data, or deployment changed.



---

# SOURCE DOCUMENT: USER APP — SUPABASE MIGRATION MAP

**Repository:** `bugoyweak7/WatchAtHomeV2`  
**Path:** `docs/SUPABASE_FIREBASE_CLOUDFLARE_MIGRATION_MAP.md`  
**Blob SHA at snapshot:** `3b202792de5a82b1fee95df266389ff1169b0b44`  
**Original content follows in full.**

# Supabase → Firebase + Cloudflare Migration Map

Audit date: 2026-11-13 (Asia/Manila)
Repository: `bugoyweak7/WatchAtHomeV2`
Branch: `setup/firebase-cloudflare-zero-cost`
Audited branch head before this documentation commit: `c4b106b8b994154208d2672f381750cf29665352`
Purpose: File-by-file migration inventory based on the checked-in source and the draft migration contract. This is a planning document, not approval to cut over or delete anything.

## Migration rules

- Firebase Authentication is the target identity provider; registered email/password accounts only for normal sign-in.
- Do not add anonymous/guest account creation.
- Device-linking may only attach a device to an existing, explicitly approved registered account.
- Cloudflare Worker is the trusted API boundary for privileged/account operations.
- Keep existing Supabase adapters and configuration until their replacements are implemented, tested for parity, and individually switched over.
- Preserve local caches, local user data, profile state, sync cursors, tombstones, and offline behavior.
- Do not provision paid resources or assume that a repository config proves a live cloud resource exists.
- No application code or cloud configuration was changed during this inventory.

## 1. Identity, account lifecycle, and device linking

| Current source file | Verified current responsibility | Target / replacement | Status |
|---|---|---|---|
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthRepository.kt` | Supabase session listener, email/password sign-up/sign-in, session validation/refresh, sign-out, account deletion Edge Function; local anonymous ID support and `signInAnonymously()` | Firebase Auth email/password; Firebase ID token provider; Worker account bootstrap and deletion workflow; remove anonymous path only after migration and tests | Not migrated |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthModels.kt` | Shared auth state/model contract | Preserve public UI state contract while replacing provider-specific implementation | Review required |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthStorage.kt` | Platform-independent local auth/session metadata interface | Keep only necessary local metadata; Firebase SDK owns token/session persistence | Review required |
| `composeApp/src/androidMain/kotlin/com/nuvio/app/core/auth/AuthStorage.android.kt` | Android auth storage implementation, including anonymous ID | Remove anonymous identifier only after safe migration and compatibility handling | Not migrated |
| `composeApp/src/iosMain/kotlin/com/nuvio/app/core/auth/AuthStorage.ios.kt` | iOS auth storage implementation | Same target as Android; retain platform parity | Not migrated |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/DeviceLinkAuthRepository.kt` | Supabase RPC start/poll, Supabase Edge Function exchange, imports Supabase session | Worker device-link session API, explicit account approval, one-time exchange to narrowly scoped Firebase custom token | Not migrated |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/DeviceSessionRegistration.kt` | Device/session registration abstraction | Worker device registration API | Review against existing Worker route |
| `composeApp/src/androidMain/kotlin/com/nuvio/app/core/auth/DeviceSessionRegistration.android.kt` | Android device metadata/registration implementation | Keep platform metadata; route network operation through Worker | Review required |
| `composeApp/src/iosMain/kotlin/com/nuvio/app/core/auth/DeviceSessionRegistration.ios.kt` | iOS device metadata/registration implementation | Keep platform metadata; route network operation through Worker | Review required |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/network/SupabaseProvider.kt` | Constructs Supabase Auth/PostgREST/Functions/Storage/Realtime client | Replace with narrowly scoped Firebase and Worker clients; do not retain an all-purpose Supabase client | Not migrated |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/network/SupabaseEndpointConfig.kt` | Supabase primary/fallback URL and realtime URL handling | Remove only after all Supabase API and realtime call sites are migrated | Not migrated |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/features/auth/ServerConnectionController.kt` | Server/backend selection control flow | Review whether custom server selection is still required; Firebase project and Worker endpoints must not be user-switchable accidentally | Review required |

### Auth-specific safety blockers

- AuthRepository currently has an anonymous account path. The target must be registered Firebase email/password accounts only.
- The Worker currently accepts Firebase tokens only when `firebase.sign_in_provider == "password"`; the device-link custom-token flow is not implemented. Any future custom-token exception must be narrow and backed by an approved, unexpired, one-time server-side device-link record.
- Account deletion must not be replaced by a client-only sign-out. The Worker deletion workflow and cleanup ordering must exist and be tested first.
- Failed token exchange or backend calls must not wipe local account data or local sync state.

## 2. Profiles and profile security

| Current source file | Current remote operations | Target Worker route | Status |
|---|---|---|---|
| `composeApp/src/commonMain/kotlin/com/nuvio/app/features/profiles/ProfileRepository.kt` | `sync_pull_profiles`, `sync_push_profiles`, `sync_delete_profile_data`, `verify_profile_pin`, `set_profile_pin`, `clear_profile_pin`, `clear_profile_pin_with_account_password`, `sync_pull_profile_locks` | `GET/PUT /v1/profiles`, `DELETE /v1/profiles/{profileIndex}`, `GET /v1/profiles/locks`, `POST /v1/profiles/{index}/pin?action=...` | Partial Worker implementation; client still Supabase |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/features/profiles/ProfileStorage.kt` | Local profile persistence | Preserve local profile cache and migration-safe serialization | Review required |
| `composeApp/src/androidMain/kotlin/com/nuvio/app/features/profiles/ProfileStorage.android.kt` | Android profile storage | Preserve local data | Review required |
| `composeApp/src/iosMain/kotlin/com/nuvio/app/features/profiles/ProfileStorage.ios.kt` | iOS profile storage | Preserve local data | Review required |
| `composeApp/src/commonMain/kotlin/com/nuvio/app/core/storage/LocalAccountDataCleaner.kt` and platform implementations | Local account cleanup | Reorder cleanup around confirmed server-side account deletion; retain recoverability | Review required |

Worker source includes profile list/upsert/delete, profile locks, PIN set/verify/clear, and profile ownership checks. Profile deletion dependency cleanup and PIN/account reauthentication parity still require explicit tests against the legacy behavior.

## 3. Profile settings, credentials, add-ons, plugins, collections, and media servers

| Current source file / feature | Legacy backend behavior | Target Worker route | Status |
|---|---|---|---|
| `core/sync/ProfileSettingsSync.kt` | `sync_pull_profile_settings_blob`, `sync_push_profile_settings_blob`; platform-scoped settings JSON | `GET/PUT /v1/profiles/{index}/settings?platform=...` | Worker route exists; client remains Supabase |
| `core/sync/ProviderCredentialSync.kt` | `sync_pull_provider_credentials`, `sync_push_provider_credentials` | `GET/PUT /v1/profiles/{index}/provider-credentials` | Worker route exists; encryption config and parity tests required |
| `core/sync/MediaServerSync.kt` | `sync_pull_media_servers`, `sync_push_media_servers` | `GET/PUT /v1/profiles/{index}/media-servers` | Worker route exists; encryption config and parity tests required |
| `features/addons/AddonRepository.kt` | Reads PostgREST `addons` by profile and pushes via `sync_push_addons` | Per-profile installed add-ons `GET/PUT /v1/profiles/{index}/addons`; shared published catalogue remains Firestore `addons` | Worker route exists; client remains Supabase |
| `features/plugins/PluginRepository.kt` and platform implementations | Plugin repository selections and local scraper execution/cache; platform-specific implementation | `GET/PUT /v1/profiles/{index}/plugins` for user selections only; preserve existing manifest fetch and local scraper execution | Worker selection route exists; inspect platform implementations before switching |
| `features/collection/CollectionRepository.kt`, `CollectionSyncService.kt`, and related collection settings files | Collection records/settings and profile sync | `GET/PUT /v1/profiles/{index}/collections`; settings blob route where applicable | Worker route exists for collection snapshot; full client contract review required |

The shared Firestore add-on catalogue and a user's installed add-on list are separate data sets. Do not merge them. Keep plugin manifests and scraper code on their existing fetch/cache flow; only move the account-owned repository selection state.

## 4. Library, watch progress, watched items

| Current source file | Legacy RPC operations | Target Worker API | Status |
|---|---|---|---|
| `features/library/sync/SupabaseLibrarySyncAdapter.kt` | `sync_pull_library`, `sync_get_library_delta_cursor`, `sync_pull_library_delta`, `sync_push_library_items`, `sync_delete_library_items` | Proposed `/v1/profiles/{index}/library` snapshot/PUT/delete and `/library/delta` | Not implemented in inspected Worker route set |
| `features/watching/sync/SupabaseProgressSyncAdapter.kt` | `sync_get_watch_progress_delta_cursor`, `sync_pull_watch_progress_delta`, `sync_pull_watch_progress`, `sync_push_watch_progress`, `sync_delete_watch_progress` | Proposed `/v1/profiles/{index}/watch-progress` snapshot/PUT/delete and `/watch-progress/delta` | Not implemented in inspected Worker route set |
| `features/watching/sync/SupabaseWatchedSyncAdapter.kt` | `sync_get_watched_items_delta_cursor`, `sync_pull_watched_items_delta`, `sync_pull_watched_items`, `sync_push_watched_items`, `sync_delete_watched_items` | Proposed `/v1/profiles/{index}/watched` snapshot/PUT/delete and `/watched/delta` | Not implemented in inspected Worker route set |
| `features/library/sync/LibrarySyncAdapter.kt`, `features/watching/sync/ProgressSyncAdapter.kt`, `features/watching/sync/WatchedSyncAdapter.kt` | Adapter contracts and sync orchestration interfaces | Keep stable contracts while implementing and testing Worker adapters | Not migrated |

Critical parity requirements: preserve stable cursor semantics, bounded pagination, offline queue behavior, sync-origin metadata, tombstones, duplicate handling, conflict resolution, and local caches. Do not switch these adapters to a snapshot-only API.

## 5. Membership and premium

| Current source file | Current remote behavior | Target | Status |
|---|---|---|---|
| `features/membership/MemberAccessRemoteDataSource.kt` | RPC `get_my_member_access` | Worker account/entitlement response | Not implemented as a complete replacement |
| `features/membership/MembershipOverviewRemoteDataSource.kt` | RPC `get_my_membership_overview` | Worker account/entitlement response with parity for overview fields | Not implemented as a complete replacement |
| `features/membership/MemberAccessRepository.kt`, `MembershipOverviewRepository.kt` | Exposes remote membership state to UI | Preserve current UI contract and map to server-derived entitlement response | Review required |
| Worker `premiumStatus` in `premium-worker/src/index.ts` | Server-side Firestore premium/trial state | `GET /v1/premium/status` | Implemented in Worker; app adapter integration not verified |
| Worker premium code endpoints | Admin creates codes; user redeems; Firestore user entitlement updated | `POST /v1/admin/premium-codes`, `POST /v1/premium/redeem` | Worker source exists; live deployment/secret and Admin endpoint integration must be verified |

The Worker premium response currently exposes premium/trial booleans and a fixed entitlement list. Compare this with all fields and gating rules consumed by the existing membership repositories and UI before replacing either data source.

## 6. Watch Party

| Current source file | Verified current responsibility | Target | Status |
|---|---|---|---|
| `features/party/PartyApi.kt` | Supabase PostgREST RPCs: `watch_party_create`, `watch_party_join`, `watch_party_link_profile`, `watch_party_preview`, `watch_party_heartbeat`, `watch_party_update`, `watch_party_leave`, `watch_party_end`, `watch_party_set_host_only`, `watch_party_remove_member`, `watch_party_send_message`, `watch_party_list_messages`, `watch_party_clock`, `watch_party_enabled` | Draft Worker API contract for party lifecycle, messages and clock/config | Not implemented in inspected Worker route set |
| `features/party/PartyChannel.kt` | Supabase Realtime channel `watch-party:{partyId}`, broadcast events and Presence | Durable Objects are the intended realtime coordination option in the migration contract | Not implemented |
| `features/party/PartyRepository.kt`, `PartySync.kt` | Party state, presence, playback and synchronization orchestration | Preserve protocol/event behavior over a new realtime transport | Not migrated |

Watch Party is a separate realtime migration. Do not replace Presence/broadcast with ordinary request/response polling without a product and behavior review.

## 7. Build configuration and dependencies

| File | Verified state | Required final action |
|---|---|---|
| `composeApp/build.gradle.kts` | Declares Supabase and GitLive Firebase libraries; generates Supabase runtime config | Keep both only during staged migration; remove Supabase dependency after all call sites are gone and build/tests pass |
| `gradle/libs.versions.toml` | Supabase libraries remain in version catalog; Firebase libraries are declared | Remove unused Supabase entries only after source-wide reference audit |
| `settings.gradle.kts`, root build scripts | Plugin/repository configuration must be checked for Supabase-specific build plugins | Remove only if confirmed unused |
| `local.properties` and environment build inputs | Runtime Supabase URL/anon/fallback values are read by build logic | Stop requiring these only after generated config and all clients are migrated |
| `androidApp/google-services.json`, `androidApp/src/debug/google-services.json` | Firebase project configuration present | Retain and validate package/project mapping |
| `premium-worker/wrangler.toml` | Worker vars identify `watchathome-admin`; no D1 database binding is declared | Add binding only after a reviewed D1 decision and database migration tests; do not assume provisioned |
| `premium-worker/src/index.ts` and related Worker modules | Firebase token verification, Firestore premium/trial operations and several account/profile routes | Complete missing routes, test auth and data parity, then deploy only after explicit approval |

## 8. Current Worker route parity snapshot

Observed in inspected `premium-worker/src/index.ts`:
- Health endpoint.
- Account bootstrap and device register/list.
- Profiles, profile locks, profile settings, profile PIN operations.
- Add-ons, plugins, collections.
- Provider credentials and media servers.
- Admin premium code creation, premium redemption, trial initialization, premium status.

Not found in the inspected route dispatch:
- Account deletion lifecycle and deletion job status.
- Device-link start, poll, approve, one-time exchange/custom-token issuance.
- Library snapshot/delta/write/delete.
- Watch-progress snapshot/delta/write/delete.
- Watched-items snapshot/delta/write/delete.
- Membership overview parity.
- Watch Party lifecycle, chat and realtime transport.

This route snapshot is based on repository source inspection, not live deployment inspection.

## 9. Recommended migration sequence

1. Finish a detailed AuthRepository and DeviceLink parity design, including Firebase email/password, ID-token refresh, account bootstrap, deletion and approved device-link custom-token handling.
2. Implement Firebase Auth behind the existing auth UI/state contract; add tests for registration, sign-in, invalid sessions, sign-out, recovery and anonymous rejection. Do not remove Supabase yet.
3. Switch profile and PIN operations to Worker routes with local-cache preservation and tests.
4. Switch profile settings, credentials, add-ons, plugins, collections and media-server adapters one resource at a time.
5. Implement and test full library/watch-progress/watched snapshot + delta semantics before switching those adapters.
6. Migrate membership and premium response parity.
7. Design and implement Watch Party separately, including realtime presence and broadcast parity.
8. Only after all application call sites are migrated: remove Supabase runtime configuration, SDKs, generated config and dependencies; run full builds/tests and a source-wide zero-reference audit.
9. Only after data migration, rollback, deletion and backup plans are approved: remove legacy Supabase services/data.

## 10. Audit boundaries and evidence

- Source inspected on `setup/firebase-cloudflare-zero-cost` at branch head `c4b106b8b994154208d2672f381750cf29665352` before this documentation-only commit.
- File references were fetched directly from the selected repository branch.
- The migration contract and route matrix under `docs/` are design documents; they do not prove route implementation or deployment.
- No Supabase account/project, Firebase Console rules, Cloudflare secrets, D1 database, Worker deployment, or production data were modified or verified in this source-only audit.


## 11. Staged Firebase Auth foundation — 2026-11-13

- Added a separate multiplatform Firebase Auth gateway and session manager under `core/auth/FirebaseAuthGateway.kt` and `FirebaseAuthSessionManager.kt`.
- The staged layer supports email/password registration/sign-in, auth-state observation, sign-out, and fresh ID-token retrieval; anonymous Firebase sessions are rejected.
- Six common tests were added with a fake gateway.
- The staged repository is not wired into the active auth UI. Existing Supabase authentication remains active until dependent data APIs, device-link and account deletion have tested replacements.
- The Worker account-bootstrap route still depends on D1, which is not bound/provisioned in the inspected Wrangler configuration. The staged Firebase layer therefore does not call it.
- See `SETUP_STATUS.md` and `REPORT_LOG.md` for implementation commits and build status.


### Firebase Auth SDK API correction — 2026-11-13
- Updated the staged Firebase Auth gateway to match the pinned GitLive Firebase SDK 2.8.0 API after CI identified three compile errors.
- Removed redundant no-context Firebase initialization from common code. Android default initialization is provided by FirebaseInitProvider under Google Services configuration; iOS is initialized by `FirebaseApp.configure()` in app startup.
- Corrected ID-token retrieval to use `FirebaseUser.getIdToken(forceRefresh)` directly as `String?`.
- The source-only change is committed as `6cf909beab6bcf7301614f6cfc9d6784e2116d60`; see `REPORT_LOG.md` for the exact CI findings.


## 2026-11-13 — Firebase Auth verification pipeline
- The Firebase Auth CI workflow now includes `:composeApp:testAndroidHostTest` to execute the staged `commonTest` Firebase Auth session-manager suite on the Android host test target.
- The workflow run `43399716638` is pending verification. Do not treat the suite as passed until GitHub Actions reports success.
- This is test automation only; Firebase Auth remains staged and is not connected to the active sign-in UI. Supabase remains the active auth provider.


## 2026-11-13 — Focused Firebase Auth test execution
- The first Android host-test run reported 2,052 tests with two failures in unrelated existing suites (`AndroidDownloadLifecycleTest`, `WatchProgressIdentityTest`). No Firebase Auth session-manager test appeared in the failure list.
- CI was narrowed to `com.nuvio.app.core.auth.FirebaseAuthSessionManagerTest` to provide a focused signal for the staged Firebase Auth implementation.
- Focused test run is pending. This does not change the staged status of Firebase Auth or the active Supabase auth integration.


## 2026-11-13 — Generic JSON secret exclusion
- Server-side validation now rejects sensitive key names recursively in profile-settings and collection JSON before D1 persistence. This complements the existing client-side `withoutProfileCredentials` filtering and prevents a modified client from bypassing that policy.
- Non-sensitive unknown fields remain preserved for forward compatibility.
- Added Worker tests for nested secret rejection and safe unknown-field round-trip. Latest CI run `43401302072` pending.


## 2026-11-13 — Generic JSON guard CI verification
- Worker CI run `43401302072` passed TypeScript compilation and 63 tests with zero failures.
- The settings/collection sensitive-key checks are now verified in local/mock tests. Live D1 and production service integration remain unverified; mobile adapters remain on Supabase.


## 2026-11-13 — Home catalog settings route added
- The proposed `/v1/profiles/:profileIndex/home-catalog?platform=` route now has Worker GET/PUT source backed by `home_catalog_settings`, with per-profile ownership checks and version increments.
- The endpoint stores the complete JSON payload to preserve the existing `SyncHomeCatalogPayload` contract and unknown fields; it rejects sensitive fields and enforces the same bounded request policy as other profile sync resources.
- Added SQLite contract tests. Mobile sync still calls the legacy Supabase RPCs; adapter migration is not started. Final Worker CI pending.


### Home catalog route test follow-up — 2026-11-13
- The first route/test CI run exposed a test-fixture-only duplicate account insert in the new profile-isolation case. The test setup was corrected to add a second profile row under the existing account. Follow-up CI `43401962345` queued; endpoint verification remains pending.


### Home catalog route verification — 2026-11-13
- Worker CI `43401962345` passed TypeScript and 65 tests across 10 suites (0 failures), including home-catalog read/write, round-trip, owner/profile/platform isolation, body bounds and sensitive-field rejection.
- This validates the Worker module against local SQLite/mocked D1 only. The mobile `HomeCatalogSettingsSyncService` still uses Supabase RPCs; no production cutover has occurred.


## 2026-11-13 — Firebase Auth stage verification complete
- CI workflow `43400761852` passed the focused `FirebaseAuthSessionManagerTest` suite and Android Play Store debug compilation.
- Staged Firebase Auth implementation is unit-tested and compiles. Active app auth still uses Supabase; production Firebase configuration, live auth, and app wiring remain separate pending stages.


## 2026-11-13 — Device registry revoke route staged
- Added owner-scoped `DELETE /v1/devices/:installationId` with rate limiting and idempotent `revoked_at` update; active device listing omits revoked rows.
- Added data-access and actual Worker HTTP test coverage. This is only an inventory state change, not session/refresh-token revocation. Final CI run `43402508386` pending.


## 2026-11-13 — Device registry revoke route CI passed
- Worker CI run `43402508386` passed TypeScript and all 67 tests (0 failures), including device revoke ownership/idempotence tests.
- This validates registry status changes only; it does not revoke Firebase refresh tokens or remotely sign out an app. No live D1 or mobile migration.


## 2026-11-13 — Device registry revocation route
- Implemented `DELETE /v1/devices/:installationId` using the authenticated Firebase UID, active-account check, route rate limit and soft revoke in D1. Revoked installations are excluded from active device listings; repeated or cross-owner revocation requests do not modify another owner's row.
- Worker CI `43402508386` passed TypeScript and 67 tests (0 failures), including authenticated HTTP coverage. The app-side device management flow is not migrated, and the route is not deployed to a live D1-backed Worker.


## 2026-11-13 — Watch-progress route parity update

- Worker source now includes D1-backed watch-progress snapshot, upsert, cursor, delta and delete-tombstone routes under /v1/profiles/:profileIndex/watch-progress.
- The API preserves the existing ProgressSyncAdapter wire fields and stable progress_key identity. Authenticated HTTP and local SQLite tests pass.
- Worker CI run 43411656192 passed TypeScript and 73 tests across 10 suites, 0 failures.
- This closes the Worker-source route gap only. The app still uses SupabaseProgressSyncAdapter; mobile client migration, legacy ordering parity, timestamp pagination tie handling, retention cleanup, live D1 validation and deployment remain outstanding.


## 2026-11-13 — Mobile library HTTP adapter staged

- Added a separate Cloudflare implementation of `LibrarySyncAdapter` using the existing Worker snapshot, cursor, delta, upsert and tombstone routes.
- Adapter obtains a fresh staged Firebase ID token and sends it as Bearer auth; it does not reuse the Supabase backend URL.
- Added optional `CLOUDFLARE_WORKER_BASE_URL` runtime configuration, blank by default, and request-size-aware batching.
- Added MockEngine coverage; Android CI run 43413914695 pending final result.
- No change to active `LibraryRepository.syncAdapter`; Supabase remains the live path. No production Worker/D1 resources were configured.


## 2026-11-13 — Mobile watch-progress adapter staged

- Added a separate Cloudflare `ProgressSyncAdapter` client using Firebase ID tokens for snapshot, cursor, delta, upsert and delete routes.
- Added validated deterministic offset paging to Worker snapshot reads; Worker CI run 43414785430 passed.
- Android MockEngine tests are included in run 43414877340 (pending).
- Supabase remains active in `WatchProgressRepository`; no live D1 or Worker deployment.


## 2026-11-13 — Follow-up progress adapter verification

- Worker authenticated offset paging test passed in run 43415195896.
- Added mobile mutation route tests. Android run 43414877340 was cancelled by a subsequent push; replacement run 43415270909 queued. Supabase remains active.

## 2026-11-13 — Library and watch-progress adapter wiring gate

- Both staged Cloudflare sync adapters are now selectable from their repository adapters through generated CloudflareWorkerConfig.SYNC_ENABLED.
- The flag is controlled by CLOUDFLARE_SYNC_ENABLED and defaults to false. HTTPS URL validation is also required for Cloudflare selection.
- Supabase remains the default active adapter. This does not constitute production cutover or verified live sync.
- Activation remains blocked on Firebase mobile auth integration, D1 provisioning/migration, deployed Worker bindings/secrets, and live compatibility/conflict tests.

- Fresh Android CI run 43416885505 was triggered by the final adapter/config source commit and is currently queued; do not mark the mobile wiring build-verified until this run completes successfully.

- CI follow-up: run 43416885505 has moved from queued to in progress. The focused Firebase/Auth + Cloudflare adapter host-test step is currently running; Android Play Store debug compilation is pending. No pass is claimed yet.


## 2026-11-13 — Active mobile auth dependency audit

- `AuthScreen` and `AppGate` still use Supabase-backed `AuthRepository`; staged `FirebaseAuthRepository` is not wired into the app lifecycle or login UI.
- Profile identity operations remain Supabase RPC-backed: `sync_pull_profiles`, `sync_push_profiles`, `sync_delete_profile_data`, profile PIN operations, and `sync_pull_profile_locks`.
- Device-link authentication remains coupled to Supabase RPCs `start_device_login_session` / `poll_tv_login_session`, Edge Function `tv-logins-exchange`, and Supabase session import. Device registration calls `register_current_device`.
- Membership access and overview remain Supabase RPC-backed; account deletion still invokes `delete-account`.
- Migration implication: Firebase ID tokens cannot simply replace Supabase access tokens for these existing RPCs/functions. Before app cutover, choose and implement a compatible backend identity bridge or migrate each protected API and its authorization/data-ownership rules. Preserve existing account IDs and user data; do not create parallel identities accidentally.
- This was a read-only source audit. No code, Firebase Console, Worker/D1 resource, production data, or deployment changed. Cloudflare sync remains disabled by default.
- Android CI run 43416885505 was still in progress at the latest check; host tests were running and Play Store debug compilation was pending.


## 2026-11-13 — Worker source audit and CI verification

- Android CI run `43416885505` completed successfully: Firebase Auth session-manager unit tests and Android Play Store debug compilation passed.
- The in-repository Worker verifies Firebase email/password ID tokens and contains partial account, device-registration, profile, PIN, library, watch-progress, premium, and trial APIs. Its current verifier explicitly requires the `password` sign-in provider.
- The Worker router does not yet implement Firebase device-link session creation, polling, approval, or one-time exchange. Existing app TV pairing remains Supabase-backed.
- The account D1 schema is draft-only; no D1 binding is configured. Source presence must not be treated as a deployed or live-tested service.
- Supabase SQL migrations, RLS policies, and Edge Function source are absent from the scanned WatchAtHomeV2 repository. Obtain an authorized export before legacy UID mapping or data migration design.
- Keep Supabase as the active provider and keep `CLOUDFLARE_SYNC_ENABLED` false. No production or app source changes were made in this read-only audit.


## 2026-11-13 — Watched-items Worker sync API staged

- Re-scanned the current approved branch before implementation. Branch head at the start of this work: `726bd9d58de41dd1c184314f1e1852051e6c93d0`.
- Added `premium-worker/src/watched-items-sync-api.ts` with D1 snapshot paging, stable per-profile event cursor, delta reads, bounded upserts, and delete tombstones.
- Added authenticated Worker routes for `GET /v1/profiles/:profileIndex/watched-items`, `GET .../cursor`, `GET .../delta`, `PUT .../watched-items`, and `POST .../delete`.
- Ownership is derived from the verified Firebase UID and checked against the requested profile before every operation. Batch size is capped at 500; request bodies are bounded; episode season/episode values must be paired; duplicate keys are rejected.
- Delete events retain the prior watched-item payload so delta consumers receive the identity and metadata needed to apply the tombstone.
- Added local SQLite data-access tests and authenticated HTTP route tests. CI has been triggered by these commits; results must be checked before calling the change verified.
- This closes the Worker source gap for watched-items sync only. The mobile adapter remains Supabase-backed; no D1 database/binding, Firebase/Cloudflare secret, deployment, production data migration, or sync flag change occurred.
- The existing `CLOUDFLARE_SYNC_ENABLED` default remains false. Do not enable it until the mobile watched adapter is implemented and end-to-end parity is tested.


## 2026-11-13 — Watched-items API source implementation

- The route parity inventory is updated: Worker source now includes a watched-items snapshot/cursor/delta/upsert/delete API backed by the draft `watched_items` and `sync_events` tables.
- The API is tested in local SQLite/mock D1 and authenticated Worker tests once CI completes. It does not yet replace `SupabaseWatchedSyncAdapter`.
- Mobile adapter wiring, real D1 validation, production binding/secrets, and live integration remain outstanding.


## 2026-11-13 — Mobile watched-items adapter staged behind existing opt-in gate

- Added `CloudflareWatchedSyncHttpAdapter` using the existing Worker HTTPS API and a fresh Firebase ID token. It maps the current `WatchedItem` and `WatchedDeltaEvent` contracts, pages snapshots at the Worker-supported maximum of 500 rows, and sends bounded upsert/delete batches.
- Added MockEngine tests for snapshot route/paging, delta mapping, cursor, mutation routes, wire fields, and missing-token rejection.
- `WatchedRepository.syncAdapter` now selects the Cloudflare implementation only when `CLOUDFLARE_SYNC_ENABLED=true` and the configured Worker base URL is HTTPS; otherwise it continues using `SupabaseWatchedSyncAdapter`.
- The global flag remains false by default. The Firebase Auth implementation is still staged rather than wired into the active app login, so this adapter is not ready for activation.
- Android CI has been triggered by these source/test commits. Do not mark compilation/tests as passed until the matching run completes successfully.
- No D1 binding, Cloudflare deployment, secrets, Firebase Console settings, production data, or account migration was changed.


## 2026-11-13 — Watched-items mobile adapter and guarded selection

- Added a Cloudflare HTTP adapter matching the current watched-item snapshot, delta, upsert, and delete contract.
- The repository selection is guarded by the existing global opt-in flag and HTTPS Worker URL validation. The default false setting keeps the Supabase adapter active.
- CI verification is pending; no production cutover is claimed.


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


## 2026-11-13 — Profile metadata client staging

- Worker profile metadata routes were verified in source: `GET /v1/profiles`, `PUT /v1/profiles`, and `DELETE /v1/profiles/{index}`.
- Added a Kotlin Cloudflare profile adapter that maps the existing `NuvioProfile` and `ProfilePushPayload` models to those routes and uses Firebase ID-token authentication.
- The adapter is intentionally staged and not selected by `ProfileRepository`. Active profile sync still calls Supabase RPCs. Switching it now would mix Supabase-authenticated app sessions with Firebase-token Worker authorization and could strand account data.
- Unit tests and CI coverage were added. Live Worker/D1 integration remains unverified.


## 2026-11-13 — Profile settings client staging

- Added `CloudflareProfileSettingsHttpAdapter` for GET/PUT profile settings blobs on the existing Worker API.
- It uses Firebase ID-token authentication, HTTPS-only transport, bounded responses, and `JsonObject` payloads to preserve unknown settings keys.
- The existing `ProfileSettingsSync` remains Supabase-backed and is not switched. The adapter is staged until Firebase auth is the active app session and Worker/D1 is deployed and verified.


## 2026-11-13 — Admin premium-code Worker integration cross-repository update

- Re-scanned the Admin App and Premium Worker source. Admin premium-code creation now calls the existing authenticated `POST /v1/admin/premium-codes` endpoint using a Firebase ID token; direct Admin-side creation of raw-ID Firestore documents was removed.
- Worker-created code documents use SHA-256 IDs and preserve the `code`, `durationLabel`, `durationDays`, `durationMinutes`, `status`, and timestamp fields consumed by the Admin history screen. The existing Admin Firestore history query remains compatible with those hashed documents, subject to deployed Firestore rules.
- Admin build configuration now accepts the non-secret `watchathome.premiumApiBaseUrl` Gradle property. No live Worker URL was present in repository configuration, so the app is not yet configured for a live call.
- Admin build verification is pending: its current GitHub Actions workflow automatically targets `main`, not the approved setup branch. Do not treat this as production-ready until the branch build and authenticated API flow pass.
- No Firebase/Cloudflare resources, secrets, production data, deployments, or account settings were changed.


## 2026-11-14 — Removal gate reaffirmed from source evidence

Supabase removal is explicitly blocked until every active call site has a tested and live-verified replacement and rollback/data-retention requirements are satisfied. The current branch still has active Supabase Auth in AuthRepository, Supabase device-link and account-deletion flows, a shared Supabase client with Auth/PostgREST/Functions/Storage/Realtime, Supabase library/progress/watched adapters, generated Supabase runtime config, Gradle Supabase dependencies, and additional membership/profile/settings/media/Watch Party call sites documented above. Worker route implementation or local/mock tests alone do not establish production parity. Final removal requires a repository-wide reference audit, successful relevant platform builds/tests, end-to-end Firebase/Worker integration checks, verified data migration/export and rollback plan, and explicit confirmation that Supabase is no longer serving live app traffic. Until then, preserve the Supabase project, data, secrets/configuration and source adapters.

## 2026-11-14 — Firebase auth, account lifecycle and device-link evidence matrix

| Feature | Verified current state | Replacement evidence | Status / remaining gate |
|---|---|---|---|
| Active email/password auth | AuthRepository remains Supabase-backed and is used by AuthScreen/AppGate | FirebaseAuthGateway + FirebaseAuthSessionManager are staged; Android compile CI passed | BLOCKED until all authenticated APIs, account lifecycle and sync are Firebase-compatible |
| Anonymous/local UUID | Active AuthRepository and AuthScreen still expose local anonymous sign-in | Staged Firebase manager rejects anonymous Firebase accounts | BLOCKED until controlled UI/path removal preserves local data and registered-account policy |
| Account bootstrap | Existing active auth does not use the Worker bootstrap | Worker POST /v1/account/bootstrap validates Firebase account metadata and initializes D1 account + trial | PARTIAL: source/CI evidence; live Preview integration still required |
| Device registry | App still has legacy Supabase registration dependency | Worker POST/GET /v1/devices and DELETE /v1/devices/{installationId} use D1 and verified UID | PARTIAL: mobile wiring and live integration not proven |
| TV device-link | Supabase RPC start/poll + tv-logins-exchange; imports Supabase session | device_link_sessions schema exists, but Worker has no pairing routes | BLOCKED: implement custom-token issuance/verification and full secure one-time pairing |
| Account deletion | Supabase delete-account Edge Function | D1 deletion-job table only; no complete Worker route/state machine verified | BLOCKED: complete cross-store deletion and recovery contract |
| Protected data sync | Supabase remains active for multiple domains | Several Worker APIs and Firebase-token adapters are staged | BLOCKED: per-feature contract tests, active adapter cutover and live parity |

### Verification evidence
- User App Android Firebase-auth compile: GitHub Actions run 43422907365 succeeded for the Android Play Store variant compile. This does not prove iOS build, live Firebase auth, or active app wiring.
- Standalone Premium Worker CI: run 43545476435 succeeded for TypeScript and D1 tests. This does not prove live Firebase/Firestore/D1 behavior or Production deployment.
- The standalone Worker repository has a D1 DB binding in wrangler.toml for production and isolated Preview. The nested premium-worker/ copy in the User App repository does not have the same binding; use the standalone Worker repository as the deployment source of truth.
- Current Worker route source includes account bootstrap and device registry operations but not device-link start/approval/poll/exchange or a complete account deletion workflow.
- Keep Supabase active. Do not treat schema tables, local/mock tests, or compile CI as live replacement parity.



---

# SOURCE DOCUMENT: USER APP — FIREBASE/CLOUDFLARE ACCOUNT MIGRATION CONTRACT

**Repository:** `bugoyweak7/WatchAtHomeV2`  
**Path:** `docs/FIREBASE_CLOUDFLARE_ACCOUNT_MIGRATION_CONTRACT.md`  
**Blob SHA at snapshot:** `9595d82f46b312b92030bab6e6d39de07c1cbc4d`  
**Original content follows in full.**

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


## 20. Encrypted credential repository checkpoint (2026-11-13)

Added `premium-worker/src/credential-store.ts` for encrypted provider credentials and media-server tokens. Provider credential JSON is encrypted using the versioned AES-GCM primitive; media-server tokens are stored separately from metadata, and secret-like metadata fields are rejected. The D1 draft now checks 12-byte AES-GCM nonces and ciphertext of at least 16 bytes.

CI run `43377725695` passed 29 tests (9 schema, 6 account/device, 5 HTTP/auth, 5 crypto, 4 credential storage) plus TypeScript compilation. The repository functions are not yet connected to HTTP routes; no key ring is configured, no D1 is provisioned, and no real user secret is stored.


## 21. Profile PIN verifier checkpoint (2026-11-13)

Added `premium-worker/src/pin-verifier.ts` using a versioned HMAC-SHA256 pepper key ring, per-record random salt, UID/profile binding, constant-time digest comparison, and pepper rotation support. The draft schema constrains PIN hash/salt dimensions. CI run `43377933824` passed all 33 tests, including 4 PIN verifier tests.

No PIN HTTP route or atomic D1 failed-attempt/lockout workflow exists yet. Do not enable PIN verification until lockout, rate limits, recovery/re-authentication, and owner/profile authorization are integrated and tested.


## 22. Persisted profile PIN lockout checkpoint (2026-11-13)

Added `premium-worker/src/pin-store.ts`: per-profile persisted failed attempts, 5-attempt threshold, 15-minute lockout, blocking during lockout, and counter reset after successful verification once lockout expires. CI run `43378244632` passed all 37 tests, including four lockout tests.

No PIN HTTP route is enabled. Request-level rate limits, recent reauthentication for reset, generic response behavior, and end-to-end route tests remain required before switching the mobile PIN adapter.

## 2026-11-14 — Source revalidation addendum: account/device implementation status

This addendum supersedes older status statements in this draft where they said account bootstrap and D1 schema were not yet present. It does not convert the draft contract into a production-ready specification.

### Verified current source
- The active User App still routes authentication through Supabase AuthRepository; AuthScreen and AppGate still use that repository. The “Continue without account” action still calls its local anonymous sign-in method.
- FirebaseAuthGateway and FirebaseAuthSessionManager are implemented as staged email/password auth and ID-token components, but they are deliberately not wired into the active app lifecycle.
- Standalone WatchAtHomePremiumWorker/src/index.ts now contains Firebase-token-protected account bootstrap and device registry routes. Its token verifier accepts password-provider Firebase ID tokens and rejects anonymous identities.
- POST /v1/account/bootstrap uses Firebase account creation metadata, creates/checks the D1 account row, and initializes the existing trial flow. Device register/list/revoke routes require an active D1 account and derive ownership from the verified token.
- Standalone Worker Wrangler config contains production and isolated Preview D1 bindings. Repository status records report both D1 schemas applied and their expected 19 tables/9 indexes verified. This does not establish production API deployment or live integration.
- CI: User App Android Firebase-auth compile run 43422907365 succeeded; standalone Worker TypeScript/D1 test run 43545476435 succeeded. Neither is a live integration test.

### Still missing / not proven
- Worker device-link session start, user approval, poll, and one-time exchange routes are absent from current route dispatch. The existing mobile device-link repository still uses Supabase RPCs and the tv-logins-exchange Edge Function, then imports a Supabase session.
- No complete Worker account-deletion route/state machine has been verified. A D1 deletion-job schema table alone is not an implementation.
- The mobile app has not switched its active AuthRepository, device registration, profile/data sync, or account deletion to Firebase/Worker.
- No end-to-end Preview test using a dedicated Firebase test account has been established by this source audit. Preview-only secret readiness and route-level runtime results must be separately verified.
- Existing Supabase schema/RLS/Edge Function/Realtime source is not available in the app repository; exact remote data migration/export behavior remains unverified.

### Revised gate
Do not switch active mobile auth until Firebase password auth, account bootstrap, registered-device behavior, TV pairing/custom-token flow, account deletion, and all currently active protected data APIs have a tested compatible identity/ownership path. Keep Supabase adapters and runtime configuration intact until per-feature live parity, rollback and data-retention gates are met.



---

# SOURCE DOCUMENT: ADMIN APP — SETUP STATUS

**Repository:** `bugoyweak7/WatchAtHomeAdmin`  
**Path:** `SETUP_STATUS.md`  
**Blob SHA at snapshot:** `23374fab94470156ba87a8f794a02e17de664e7e`  
**Original content follows in full.**

# WatchAtHome Admin Setup Status — Handoff Notes

Last reviewed: 2026-11-13 (Asia/Manila)
Working branch: `setup/firebase-cloudflare-zero-cost`
Base branch: `repair/addon-catalogue-and-admin`

## Approved architecture
- Firebase Authentication: admin email/password identity.
- Firestore: admin roles, premium codes, entitlements/trials, and existing add-on catalogue.
- Cloudflare Workers: privileged premium-code creation/redeem/status APIs and future application APIs.
- Cloudflare D1/R2/Durable Objects: application data, files, and Watch Party respectively.
- Target is $0 using Spark/free allowances; quotas still apply.

## What was scanned
- Entire repository tree: 79 entries; complete tree returned.
- `MainActivity.kt`: FirebaseAuth and FirebaseFirestore are initialized. Biometric unlock is a local device unlock feature, not a replacement for server-side admin authorization.
- `AddonsManagementScreen.kt`: subscribes to Firestore `addons` using a snapshot listener; creates/updates add-on documents and locally sorts by sortOrder to include older records.
- `app/build.gradle.kts`: Google Services plugin, Firebase Auth and Firestore dependencies.
- `app/google-services.json`: identifies Firebase project `watchathome-admin` and package `com.tapframe.watchathomeadmin`. Treat config as public client configuration; never put service-account secrets in the app.

## Existing behavior / issues to resolve
- Admin app currently uses Firebase Auth and Firestore directly.
- Existing add-ons management uses a realtime snapshot listener, which consumes reads as documents change and listener reconnects. Consider one-time fetch/cache or keep listener only where live updates are needed.
- Prior source audit found premium-code admin UI writes/reads Firestore directly, while Premium Worker stores code documents by SHA-256 hash. Admin raw-code document IDs and Worker hashed IDs are incompatible; standardize creation on Worker endpoint and ensure history UI uses hashed-document collection safely.
- Admin roles are checked against `admins/{uid}` with `role=admin` and `active=true` (must also be enforced server-side).
- Users, overview, TV pairing approval, and account-deletion management screens were previously identified as placeholders/not implemented; re-check before building those features.
- No Firestore security-rules file was found in this repository.

## Cost optimization
- Keep the existing shared add-ons catalogue in Firestore; do not duplicate it per user.
- Reduce unnecessary snapshot listeners and avoid repeated reads.
- Premium code history should be paginated and only fetched when opened.
- Admin mutations should go through the Worker for premium-code creation; never embed service-account credentials.
- Avoid storing images/files in Firestore; store only R2/remote URLs.

## Not done / do not assume
- No Firebase Console state/rules/usage/billing were inspected or changed.
- No Firestore rules were published or validated.
- No Cloudflare D1/R2/Worker resources were created or inspected.
- No code changes to Admin app behavior were made; only this handoff note was added.
- No APK build/test/deployment was run.

## Next steps
1. Verify admin authentication and active-admin Firestore rules.
2. Route premium-code creation through the Premium Worker and align hashed code history.
3. Review add-on listener read volume and choose an intentional refresh strategy.
4. Implement user management, pairing approval, and account deletion only after backend contracts exist.
5. Build and test Admin app; no production release without separate approval.


## 2026-11-13 — Admin App source compatibility continuation

### Verified source paths

- `app/src/main/java/com/tapframe/watchathomeadmin/MainActivity.kt`
- `app/src/main/java/com/tapframe/watchathomeadmin/AddonsManagementScreen.kt`
- `app/build.gradle.kts`
- `gradle/libs.versions.toml`
- `app/google-services.json`

### Authentication and authorization

- Admin sign-in uses Firebase email/password.
- After sign-in, the app reads `admins/{uid}` and requires `role == "admin"` and `active == true`; otherwise it signs the account out.
- Biometric unlock is local device re-authentication/unlock and does not replace the Firebase identity or server-side authorization check.
- The Worker must continue independently enforcing active-admin authorization for privileged operations. Client-side role checks alone are not sufficient.

### Shared add-on catalogue

- `AddonsManagementScreen.kt` subscribes to Firestore `addons` through a snapshot listener.
- The UI reads `name`, `manifestUrl`, `sortOrder`, `published`, and `enabled`; it creates/updates documents and supports publish, enable/disable, and delete actions.
- The User App separately reads this shared Firestore catalogue. This is not the same as a user's per-profile installed add-on list stored by the legacy Supabase client.
- Listener read volume and reconnect behavior remain a cost consideration; no read-count measurement was performed.

### Premium-code incompatibility remains open

- `MainActivity.kt` still contains a direct Firestore premium-code creation/history implementation.
- The admin implementation writes document IDs based on raw generated codes, while the existing User App Worker stores premium-code documents by SHA-256 hash.
- This mismatch means codes created directly by the current Admin UI may not be discoverable/redeemable through the Worker path unless the actual document mapping is aligned.
- The approved direction remains: route code creation through the existing Worker endpoint, then make history UI read the same hashed document model without exposing privileged credentials.
- No admin source code was changed in this audit.

### Firebase and Cloudflare state

- The Admin App build declares Firebase Auth and Firestore dependencies and uses Firebase project `watchathome-admin`.
- This source review did not inspect Firebase Console rules, deployed Worker state, Cloudflare resources, or production Firestore data.
- No security rules were published or changed, no Cloudflare resource was created or changed, and no APK build/test/deployment was run.


## 2026-11-13 — Premium-code workflow source verification

- Re-read the exact premium-code UI implementation in MainActivity.kt.
- The current admin UI reads the latest 50 premium_codes documents ordered by createdAt, then creates batches directly in Firestore with each raw generated code as the document ID.
- The existing User App premium Worker uses SHA-256(code) as the premium_codes document ID and performs redemption through the Worker. The direct admin write path therefore does not match the Worker storage contract.
- Required correction: admin creation must call the existing Worker admin endpoint with a Firebase ID token; Worker performs active-admin verification and writes the hashed document. History UI must use the same hashed record format and must never display hashes as redeemable codes unless the intended raw code is securely available through a separate one-time reveal flow.
- The current admin dashboard user/premium statistics are placeholders and display “Not connected”; no users management, device approval, or account-deletion workflow was verified as implemented in the inspected MainActivity.
- No Admin App source code, Firebase rules, Worker runtime, production Firestore data, or deployment was changed.


## 2026-11-13 — Admin premium-code generation aligned with Premium Worker

### Verified source mismatch fixed
- The Admin UI previously generated local codes in the older two-block `WAH-XXXX-XXXX` format and wrote them directly to Firestore using the raw code as the document ID.
- The Premium Worker accepts only the three-block `WAH-XXXX-XXXX-XXXX` format, hashes normalized codes with SHA-256 for Firestore document IDs, and independently checks the Firebase ID token plus active `admins/{uid}` role.
- These paths were incompatible and could produce Admin-created codes that the User App redemption endpoint could not find.

### Changes made on `setup/firebase-cloudflare-zero-cost`
- Added `PremiumApiClient.kt`: obtains the current Firebase ID token, calls `POST /v1/admin/premium-codes` over HTTPS, validates the returned code count and format, uses bounded connection/read timeouts, and returns results to the main thread.
- Updated `MainActivity.kt`: premium-code generation now calls the Worker; direct client-side premium-code creation writes have been removed. Existing Firestore history query remains, reading the Worker-created hashed documents by their stored `code` field.
- Updated `app/build.gradle.kts`: adds the non-secret `watchathome.premiumApiBaseUrl` build property as `BuildConfig.PREMIUM_API_BASE_URL`. No Worker URL is hardcoded; builds without the property show a clear configuration error rather than silently creating incompatible codes.
- The existing two-minute test duration and monthly duration UI options are preserved.

### Validation and limits
- Source-level request/response contract matches the existing Worker route and response fields.
- No Worker URL was available in repository configuration, so the Admin app is not yet configured to call a live endpoint.
- No Firebase/Cloudflare secrets, resources, production data, deployment, or account settings were changed.
- Android Admin build/CI validation is pending; do not treat this integration as production-ready until a configured URL and successful Admin build/API test are confirmed.


## 2026-11-13 — Admin build validation constraint

- Re-scanned `.github/workflows/build-apk.yml` after the premium Worker integration.
- The existing APK workflow supports manual dispatch, but its automatic push and pull-request triggers target only `main`; the approved `setup/firebase-cloudflare-zero-cost` branch therefore did not start an Admin build from these commits.
- No successful Admin build has been run for the new premium Worker client. The integration remains pending build validation.
- Do not merge or deploy solely on source inspection. Validate the branch with the Admin build workflow before release.


## 2026-11-13 — Premium Worker URL configured for Admin build

### URL supplied and source contract
- User supplied the Premium Worker base URL: `https://watchathome-premium-api.adminenzoreviewer.workers.dev`.
- Re-scanned User App repository source at `premium-worker/src/index.ts` on `setup/firebase-cloudflare-zero-cost`. The source defines unauthenticated `GET /health` returning JSON `{ ok: true, service: "watchathome-premium-api" }`, and authenticated `POST /v1/admin/premium-codes`.
- The admin creation endpoint verifies the Firebase ID token and checks Firestore `admins/{uid}` for `role == "admin"` and `active == true` before writing SHA-256-keyed premium-code documents.

### Changes made
- `app/build.gradle.kts` now uses the user-supplied HTTPS Worker URL as the default non-secret `PREMIUM_API_BASE_URL`; an explicit `-Pwatchathome.premiumApiBaseUrl=...` value can still override it.
- `.github/workflows/build-apk.yml` now also runs on relevant pushes and pull requests to `setup/firebase-cloudflare-zero-cost`, not only `main`. This allows the approved migration branch to receive actual Admin APK build validation.

### Live endpoint check and limitations
- A live fetch of `/health` returned a 404/page-not-found result, even though the current GitHub Worker source defines that route. The deployed Worker may be missing this source revision, the hostname may target a different deployment, or the live route may otherwise differ; the cause is not confirmed.
- The live `POST /v1/admin/premium-codes` route was not called because it requires an authenticated active-admin Firebase ID token and would create real premium-code records.
- No Cloudflare dashboard access, Worker deployment, secrets, D1 binding, Firebase Console change, Firestore data mutation, or production premium-code creation was performed.
- The Admin URL is configured in source, but live premium-code generation is NOT yet verified. Do not release the APK until the health route returns the expected JSON and an authorized test code can be created and redeemed safely.

### Validation
- Admin APK CI is expected to trigger from the source/configuration commit on this branch. Record the final workflow run and artifact status after GitHub completes it.


## 2026-11-13 — Confirmed Admin APK build; corrected live Worker verification status

- GitHub Actions run [43426299440](https://github.com/bugoyweak7/WatchAtHomeAdmin/actions/runs/43426299440) completed successfully on this branch at commit `60f7bc8a7a522aa5d1da0d1289eeeb4b6ab17802`. The `build-debug-apk` job and artifact upload both succeeded.
- Artifact: `WatchAtHomeAdmin-debug-apk`, ID `14038096854`, size 18,610,955 bytes, available until 2026-11-27. Download it from the Actions run page.
- Re-inspected User App Worker source on `setup/firebase-cloudflare-zero-cost`: `GET /health` is explicitly handled before auth and returns the expected service JSON. `wrangler.toml` names the Worker `watchathome-premium-api`; Admin build config uses the supplied `https://watchathome-premium-api.adminenzoreviewer.workers.dev` base URL.
- Important correction to the earlier log: the previously recorded live 404 was not independently verified by a reliable HTTP response. Current environment could not reach the live endpoint, so its status remains unverified; do not treat the old 404 statement as confirmed.
- No Cloudflare deployment, secret update, Firebase change, production Firestore write, or premium-code creation was performed. Live API validation still requires deployment parity and an authorized test account.


## 2026-11-13 — User APK test: Premium API HTTP 404

- User confirmed the installed Admin APK signs in successfully.
- Screenshot from the Premium screen shows `Premium service request failed (HTTP 404)`. The user did not generate codes.
- Rechecked `PremiumApiClient.kt`: the request is `POST ${PREMIUM_API_BASE_URL}/v1/admin/premium-codes`. Rechecked `app/build.gradle.kts`: default base URL is `https://watchathome-premium-api.adminenzoreviewer.workers.dev`.
- User App Worker source defines the matching `POST /v1/admin/premium-codes` route. No Admin source correction is justified until the live Cloudflare hostname/deployment is inspected.
- The live health endpoint could not be independently queried from this environment due network/DNS restrictions. Deployment/version and workers.dev account subdomain remain unverified.
- No Worker deployment, Cloudflare setting/secret changes, Firestore writes, or premium-code creation were performed.


## 2026-11-13 — Premium Worker deployment command mismatch identified

- User provided Cloudflare deployment-detail screenshots for production Worker `watchathome-premium-api`. The deployment details identify repository `bugoyweak7/WatchAtHomePremiumWorker`, branch `main`, commit `6a4b913` (full SHA `6a4b91300ee1d24d5b030209ee4b5e7862df1f2e`), with build command `None` and deploy command `npm run check`.
- Re-scanned that exact repository's `package.json`: `check` runs `tsc --noEmit` (type-check only); `deploy` runs `wrangler deploy`.
- Re-scanned `src/index.ts` on `main`: it defines unauthenticated `GET /health` returning `{ ok: true, service: "watchathome-premium-api" }` and defines the authenticated `POST /v1/admin/premium-codes` route. The source commit shown by Cloudflare is the latest repository commit and contains these routes.
- Root cause is now strongly indicated: Cloudflare Workers Builds is configured to run `npm run check` as its Deploy command, which does not publish the Worker script. This explains why a green build can coexist with the live endpoint returning the older/different `{ success:false, message:"Not found." }` response. The live deployed script/version is still not independently identified.
- Correct Workers Builds configuration should be Build command `npm run check` and Deploy command `npm run deploy` (the existing package script runs `wrangler deploy`). Keep root directory `/`. Before applying, confirm the existing Cloudflare Worker secrets are configured; never place service-account JSON or API keys in build variables or Git.
- No repository source code, Cloudflare settings, deployment, secrets, Firebase settings, Firestore records, or premium codes were changed in this investigation.


## 2026-11-14 — Preview Firebase project identified

- User confirmed from Firebase Console Project settings that the isolated Preview Firebase project ID is `watchathome-preview` (project number `1091456844777`).
- Rechecked the Admin setup-branch `app/google-services.json`: it still identifies Production project `watchathome-admin` (project number `314676209682`). Do not use this file for Preview builds.
- Firebase Console screenshot shows no registered apps in the Preview project. Next prerequisite is registering Android package `com.tapframe.watchathomeadmin` in `watchathome-preview`, downloading its Preview-specific `google-services.json`, then replacing only the setup-branch app config after verifying its project ID/package.
- No Admin source/config file, Firebase rule, Firestore record, Worker deployment, Production project, or Supabase rollback setting was changed in this step.


## 2026-11-14 — Admin Android app configured for Firebase Preview

- User supplied the Preview Firebase Android configuration. Verified exact project ID `watchathome-preview`, project number `1091456844777`, and Android package `com.tapframe.watchathomeadmin`.
- Replaced `app/google-services.json` on `setup/firebase-cloudflare-zero-cost` with the supplied Preview-specific configuration. Commit: `722054f905e1f7f15c0b476c95bb0987920ed67b`.
- This change is isolated to the Admin setup branch. It does not change the Admin production/main branch or Firebase Production project. The Firebase client API key in this file is public client configuration, not a service-account secret.
- Next: trigger/verify Admin setup-branch build, then configure Preview-only Worker Firebase Web API key and a service account created in `watchathome-preview`. Never reuse Production service-account credentials.
- Preview Firestore rules remain deny-all pending the least-privilege rules review. No Worker deployment, Preview Firestore data write, Production setting, or Supabase rollback configuration changed.


## 2026-11-14 — Admin Preview Premium API endpoint isolated

- User-provided Cloudflare Preview deployment details confirmed the branch Preview URL is `https://setup-firebase-cloudflare-zero-cost-watchathome-premium-api.adminenzoreviewer.workers.dev` (build #6c164781, source commit `d08bd6fb182807761955cdb3bc53d1be8d4a88e0`). The unique deployment URL is `https://ee1b6ee7-watchathome-premium-api.adminenzoreviewer.workers.dev`; use the stable branch Preview URL for the Admin app.
- Cloudflare production observability showed the Preview Admin APK posting to the Production hostname. The Production Worker rejected the Preview Firebase ID token with `JWTClaimValidationFailed: unexpected "iss" claim value`, confirming an environment URL mismatch rather than a sign-in or Firestore-rules failure.
- Updated only `app/build.gradle.kts` on this setup branch so its default `PREMIUM_API_BASE_URL` is the stable Preview Worker URL. Explicit Gradle property override `watchathome.premiumApiBaseUrl` remains supported. Commit: `e8abcfeb64f6495b0b41710b7092ea308224d150`.
- The Admin APK workflow includes `**/*.kts` in its push path filters, so this commit should automatically trigger a Preview-branch build. Verify the run branch and commit before installing.
- Pending before Premium API test: confirm the Preview Worker has Preview-only `FIREBASE_WEB_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON` secrets created from project `watchathome-preview`. Never copy Production service-account credentials. Do not change Production Worker settings or secrets.
- No Production app configuration, Worker deployment, secret, Firebase project, Firestore data, premium-code record, or Supabase rollback configuration was changed by this Admin source commit.


## 2026-11-14 — Read-only Premium diagnostics added

- Added a Diagnostics destination to the Admin app navigation, with a run button and copyable report.
- Added client checks for the configured HTTPS API URL, Worker `GET /health`, current Firebase session, Firebase ID-token retrieval (token value is never displayed or copied), and authenticated Worker diagnostics.
- The authenticated diagnostics request is read-only and depends on the new Preview Worker `GET /v1/admin/diagnostics` route. It reports service-account configuration/authentication, Firestore read access, and active-admin status without creating premium codes or writing records.
- Added `DiagnosticsApiClient.kt` and `DiagnosticsScreen.kt`; integrated the screen into `MainActivity.kt` navigation.
- Validation pending: run the Admin Preview GitHub Actions build; deploy the Worker setup branch to Preview; then run diagnostics in the new APK. No Production branch, Worker deployment, secrets, Firebase rules, or production data were changed.


## 2026-11-14 — Diagnostics build failure correction

- Inspected Admin Actions run `43545109776`. It failed Kotlin compilation because the earlier MainActivity update had been assembled from an incomplete line-range response, truncating the file and removing existing declarations. The diagnostics screen also referenced file-private color constants.
- Restored the complete MainActivity source from the last approved Admin baseline commit `e8abcfeb64f6495b0b41710b7092ea308224d150`, then re-applied only the Diagnostics tab and screen navigation.
- Updated DiagnosticsScreen to use local color literals instead of inaccessible private constants.
- No existing business logic was intentionally changed. New Admin build validation is pending.


## 2026-11-14 — Follow-up diagnostics color fix

- Rechecked failed Admin Actions runs #43545614608 and #43545624972. The diagnostics screen still contained references to private theme colors because the prior text replacement did not match all source occurrences.
- Replaced all remaining inaccessible theme references in `DiagnosticsScreen.kt` with local color values. New CI validation is pending.



---

# SOURCE DOCUMENT: ADMIN APP — CHANGELOG

**Repository:** `bugoyweak7/WatchAtHomeAdmin`  
**Path:** `CHANGELOG.md`  
**Blob SHA at snapshot:** `c08a62854d4617e091ff5c26c9e844b66dc78c53`  
**Original content follows in full.**

# WatchAtHome Admin Changelog

This file is append-only. New entries are added at the end; prior records must not be deleted or rewritten.

## 2026-11-13 — Premium Worker URL and Admin build validation

- Configured `app/build.gradle.kts` to default `PREMIUM_API_BASE_URL` to the Worker URL supplied by the user: `https://watchathome-premium-api.adminenzoreviewer.workers.dev`. The Gradle property `watchathome.premiumApiBaseUrl` remains available to override the default.
- Updated `.github/workflows/build-apk.yml` so relevant pushes and pull requests on `setup/firebase-cloudflare-zero-cost` trigger the Admin APK build, in addition to `main`.
- Rechecked the Worker source in `bugoyweak7/WatchAtHomeV2`: `GET /health` and authenticated `POST /v1/admin/premium-codes` are defined in `premium-worker/src/index.ts`.
- Live fetch of the supplied `/health` URL returned 404/page-not-found. Deployment parity is therefore unresolved; the source configuration is not proof that the live Worker is ready.
- Did not call the authenticated code-creation endpoint, deploy a Worker, alter Cloudflare settings/secrets, change Firebase settings, or write production Firestore records.
- Admin APK CI result is pending; update this log with its confirmed result after GitHub completes the run.


## 2026-11-13 — Confirmed Admin APK build; corrected live Worker verification status

- GitHub Actions run [43426299440](https://github.com/bugoyweak7/WatchAtHomeAdmin/actions/runs/43426299440) completed successfully on this branch at commit `60f7bc8a7a522aa5d1da0d1289eeeb4b6ab17802`. The `build-debug-apk` job and artifact upload both succeeded.
- Artifact: `WatchAtHomeAdmin-debug-apk`, ID `14038096854`, size 18,610,955 bytes, available until 2026-11-27. Download it from the Actions run page.
- Re-inspected User App Worker source on `setup/firebase-cloudflare-zero-cost`: `GET /health` is explicitly handled before auth and returns the expected service JSON. `wrangler.toml` names the Worker `watchathome-premium-api`; Admin build config uses the supplied `https://watchathome-premium-api.adminenzoreviewer.workers.dev` base URL.
- Important correction to the earlier log: the previously recorded live 404 was not independently verified by a reliable HTTP response. Current environment could not reach the live endpoint, so its status remains unverified; do not treat the old 404 statement as confirmed.
- No Cloudflare deployment, secret update, Firebase change, production Firestore write, or premium-code creation was performed. Live API validation still requires deployment parity and an authorized test account.


## 2026-11-13 — Premium API 404 reported from installed APK

- User-tested Admin APK login successfully.
- User screenshot shows HTTP 404 on the Premium screen. No code-generation action was taken.
- Verified Admin request path and base URL against the Worker source route and Wrangler Worker name; they match in the approved branch.
- Next investigation is live Cloudflare Worker deployment/hostname parity, not speculative changes to the Admin endpoint path.
- No source, deployment, secrets, Firebase configuration, or production Firestore data changed during this test.


## 2026-11-13 — Premium Worker deployment command mismatch identified

- User provided Cloudflare deployment-detail screenshots for production Worker `watchathome-premium-api`. The deployment details identify repository `bugoyweak7/WatchAtHomePremiumWorker`, branch `main`, commit `6a4b913` (full SHA `6a4b91300ee1d24d5b030209ee4b5e7862df1f2e`), with build command `None` and deploy command `npm run check`.
- Re-scanned that exact repository's `package.json`: `check` runs `tsc --noEmit` (type-check only); `deploy` runs `wrangler deploy`.
- Re-scanned `src/index.ts` on `main`: it defines unauthenticated `GET /health` returning `{ ok: true, service: "watchathome-premium-api" }` and defines the authenticated `POST /v1/admin/premium-codes` route. The source commit shown by Cloudflare is the latest repository commit and contains these routes.
- Root cause is now strongly indicated: Cloudflare Workers Builds is configured to run `npm run check` as its Deploy command, which does not publish the Worker script. This explains why a green build can coexist with the live endpoint returning the older/different `{ success:false, message:"Not found." }` response. The live deployed script/version is still not independently identified.
- Correct Workers Builds configuration should be Build command `npm run check` and Deploy command `npm run deploy` (the existing package script runs `wrangler deploy`). Keep root directory `/`. Before applying, confirm the existing Cloudflare Worker secrets are configured; never place service-account JSON or API keys in build variables or Git.
- No repository source code, Cloudflare settings, deployment, secrets, Firebase settings, Firestore records, or premium codes were changed in this investigation.


## 2026-11-14 — Preview Firebase project identified

- Confirmed Preview Firebase project ID `watchathome-preview` and project number `1091456844777` from the user's Firebase Console screenshot.
- Confirmed the current Admin setup-branch `app/google-services.json` still points to Production project `watchathome-admin`; it must not be reused for Preview builds.
- Preview project currently has no registered client app. The next required action is to register Android package `com.tapframe.watchathomeadmin` in Preview and obtain the project-specific `google-services.json` before changing the Admin setup branch.
- No code, Firebase rules/data, Cloudflare deployment/secrets, Production settings, or Supabase rollback configuration changed.


## 2026-11-14 — Admin Android app configured for Firebase Preview

- Updated `app/google-services.json` on `setup/firebase-cloudflare-zero-cost` with the user-supplied Preview Firebase configuration after verifying project ID `watchathome-preview`, project number `1091456844777`, and package `com.tapframe.watchathomeadmin`.
- Commit: `722054f905e1f7f15c0b476c95bb0987920ed67b`.
- Production/main Admin configuration remains unchanged. No Firebase rules/data, Worker deployment/secrets, Production resources, or Supabase rollback settings changed.
- Next validation: run Admin build on the Preview setup branch, then configure Preview-only Worker credentials from the Preview Firebase project.


## 2026-11-14 — Route Admin Preview premium requests to Preview Worker

- Confirmed the Preview Worker branch URL from Cloudflare build #6c164781: `https://setup-firebase-cloudflare-zero-cost-watchathome-premium-api.adminenzoreviewer.workers.dev`.
- Cloudflare Production observability showed Preview Firebase ID tokens being sent to the Production Worker, which rejected the issuer claim. Updated the setup-branch Admin Gradle default Premium API URL to the stable Preview Worker URL; property overrides remain available.
- Admin source commit: `e8abcfeb64f6495b0b41710b7092ea308224d150`. Push path filter includes Kotlin Gradle scripts, so a Preview build should start automatically.
- Next: verify the automatic build uses `setup/firebase-cloudflare-zero-cost`, then confirm Preview-only Firebase service-account and Web API key secrets exist before generating test codes. Production Worker/secrets and production data remain untouched.


## 2026-11-14 — Admin Preview diagnostics

- Added a read-only Diagnostics screen and client for API URL validation, Worker health, Firebase session/token checks, and authenticated Worker-side service-account/Firestore/admin checks.
- The diagnostic report hides Firebase ID tokens and credentials and can be copied for troubleshooting.
- Added navigation entry; no premium-code generation or database writes are part of diagnostics.
- Build and live Preview validation pending Worker Preview deployment.


## 2026-11-14 — Fix diagnostics APK compilation

- Restored full MainActivity source from the last approved baseline after detecting truncation in the prior edit, then re-applied the diagnostics navigation insertion.
- Replaced inaccessible private theme constants in DiagnosticsScreen with local colors.
- Build verification pending.


## 2026-11-14 — Follow-up diagnostics compilation fix

- Replaced remaining inaccessible private theme color references in `DiagnosticsScreen.kt` after reviewing the failed CI compiler output.
- Awaiting a fresh build result.



---

# SOURCE DOCUMENT: PREMIUM WORKER — SETUP STATUS

**Repository:** `bugoyweak7/WatchAtHomePremiumWorker`  
**Path:** `SETUP_STATUS.md`  
**Blob SHA at snapshot:** `313a40466f60a474df49f093f95385248da2742a`  
**Original content follows in full.**

# WatchAtHome Firebase + Cloudflare Setup Status — Handoff Notes

Last reviewed: 2026-11-13 (Asia/Manila)
Working branch: `setup/firebase-cloudflare-zero-cost`
Base branch: `main`
Current main commit audited: `6a4b91300ee1d24d5b030209ee4b5e7862df1f2e`

## Approved architecture
- Firebase Authentication remains email/password identity.
- Cloud Firestore remains source of truth for premium codes, user entitlements, immutable trial, admin roles, and existing add-ons catalogue.
- Cloudflare Workers host trusted APIs.
- Cloudflare D1 stores high-volume user application data.
- Cloudflare R2 stores uploaded images/files; remote TMDB artwork URLs preferred where possible.
- Durable Objects support Watch Party realtime state.
- Target is $0 using Spark and Cloudflare free allowances. Free tiers have quotas and are not unlimited.

## Existing Premium Worker scan
- Worker name in wrangler config: `watchathome-premium-api`.
- Firebase project ID: `watchathome-admin`.
- Source: `src/index.ts`; package uses TypeScript, Wrangler, and jose.
- Existing endpoints: `GET /health`, `POST /v1/admin/premium-codes`, `POST /v1/premium/redeem`, `POST /v1/trial/initialize`, `GET /v1/premium/status`.
- Verifies Firebase Secure Token JWT using Google JWKS, RS256, issuer/audience, and requires `sign_in_provider=password`.
- Admin creation checks `admins/{uid}` role=admin and active=true.
- Firestore REST is used with service-account OAuth; service account bypasses Firestore Security Rules, so Worker authorization is essential.
- Premium code docs use SHA-256 normalized code as document ID; user entitlement is in `users/{uid}`.
- Code is single-use; activation window 24h15m; redemption extends existing active expiry.
- Trial initialization validates Firebase account creation timestamp through Identity Toolkit.
- CORS was tightened to explicit browser origins; wildcard `*` is ignored. Native clients without Origin remain allowed.
- Current Wrangler config has Workers.dev enabled and FIREBASE_PROJECT_ID variable. Secrets are not in source; runtime secret presence was not verified.

## Files created on this branch
- `migrations/0001_initial.sql`: initial D1 schema for app users, profiles, profile settings, add-ons, library references, watch progress, watched items, collections, collection items, home catalog settings, encrypted provider credentials, media servers, registered devices, TV pairing sessions, sync events and cursors.
- `ARCHITECTURE.md`: architecture, D1 application, security, cost controls.
- This `SETUP_STATUS.md`: handoff state.

## Critical schema/security notes
- D1 schema is a first draft, not yet validated against all source DTOs and sync APIs. Review composite keys, nullable unique fields, timestamp units, and event payload/retention strategy before applying.
- Credentials/tokens must be encrypted before storing; key management is not implemented by the schema alone.
- Every query must verify Firebase token and enforce profile ownership by joining profiles to authenticated UID.
- Never trust UID/profile ID supplied by client without ownership check.
- Use prepared statements, pagination, request size limits, quotas, and rate limiting.
- D1 does not itself replace Firebase Auth; Worker must verify Firebase ID tokens.
- Existing premium endpoints remain Firestore-backed. Do not migrate premium records to D1.

## Cloudflare / Firebase resources — status
- D1 database: NOT CREATED / NOT VERIFIED.
- R2 bucket: NOT CREATED / NOT VERIFIED.
- Durable Objects namespace: NOT CREATED / NOT VERIFIED.
- App-data Worker/bindings/routes: NOT CREATED / NOT VERIFIED.
- Premium Worker deployment: NOT changed in this work; no deployment performed.
- Firebase project settings, Spark plan, Auth providers, Firestore rules/indexes/usage: NOT inspected in Console and NOT changed.
- No Firestore rules deployment, remote D1 migration, secret updates, billing changes, routes, or production writes were made.

## Next steps
1. Read-only inventory of Firebase Console and Cloudflare dashboard resources.
2. Complete DTO/RPC-to-D1 schema mapping, including delta sync semantics and account deletion.
3. Add D1 binding and application Worker code in a separate branch after schema review.
4. Validate schema locally and test API ownership/security.
5. Build app adapters incrementally; test user app and admin app.
6. Deploy only after separate production approval.


## 2026-11-13 — Reconciled production Worker D1 schema and application APIs

- Scanned the approved User App and Premium Worker setup branches before editing.
- Confirmed the older setup-branch migration used `app_users` / `profile_id`, while current User App Worker modules query `accounts`, `user_id`, and `profile_index`. The schemas were incompatible; prior status stated the old migration was not applied.
- Replaced the un-applied setup-branch migration with the canonical 19-table schema from the User App source and updated the local SQLite test path.
- Integrated D1 account/device, profile/settings, add-on/plugin/collection, library, watch-progress, watched-items, PIN, rate-limit, and encrypted credential/media-server modules into the Premium Worker. Existing Firestore premium-code, redemption, trial, status and admin authorization logic is retained.
- Used the latest Premium Worker main source as merge base to preserve explicit-origin CORS and bounded/redacted Firestore diagnostics; added Firebase auth_time to support recent reauthentication checks.
- Added Wrangler binding `DB` for existing D1 database `watchathome-accounts` (ID `a39fe326-52c2-442c-ae71-5a11908059c7`). This does not apply migrations or deploy.
- Added CI for TypeScript compilation, local SQLite schema, account/device, Firebase HTTP/auth, encryption, credential, PIN, rate-limit, profile and profile-sync tests.
- Encryption key-ring and PIN pepper secrets remain unconfigured by this source change. Sensitive routes require those secrets before use. No secret values were added to Git.
- Pending: run CI, resolve failures, confirm remote D1 migration state, then apply migration only after explicit production approval. No Worker deployment or mobile adapter cutover occurred. Supabase remains active for rollback.


## 2026-11-13 — CI follow-up: canonical migration test paths

- First post-reconciliation CI run passed TypeScript compilation and all 9 canonical schema tests, then failed at the account/device test setup because several test fixtures still loaded the removed `schema/0001_account_data.draft.sql` path.
- Updated all 7 affected test fixtures to load `migrations/0001_initial.sql`; no application runtime or production database data was changed.
- Committed as `59638236fbb2f930de10fa1ca735013a430e959a`.
- Follow-up CI run: `43448059185` was queued/in progress at the time of this status update. Do not treat the suite as passed until GitHub reports a completed successful conclusion.


## 2026-11-13 — CI verification passed

- GitHub Actions run `43448059185` completed successfully for source commit `59638236fbb2f930de10fa1ca735013a430e959a`.
- Passed: TypeScript compilation; canonical SQLite migration/schema tests; account/device; Firebase HTTP/auth; encryption; encrypted credentials; PIN verifier and lockout; D1 rate limits; profile CRUD/settings; and profile add-on/plugin/collection sync tests.
- This confirms the branch source and local test suite compile/pass. It does not confirm the remote D1 database has the migration applied, Cloudflare secrets are configured, or the Worker is deployed.
- Next gate remains remote D1 migration-history inspection and production deployment approval. Supabase remains active for rollback.


## 2026-11-13 — Read-only Cloudflare production audit

- User inspected Cloudflare D1 database `watchathome-accounts` in the dashboard. The displayed database ID is `a39fe326-52c2-442c-ae71-5a11908059c7`, matching the setup-branch Wrangler configuration.
- Read-only query against `sqlite_master` returned only Cloudflare's `_cf_KV` table; no application tables were listed.
- Read-only query for `d1_migrations` returned no rows. Therefore the canonical application migration is not applied to this D1 database.
- User inspected Production Worker `watchathome-premium-api`. Its Settings page showed Firebase project variable and Firebase service-account / Web API key secrets, but the Bindings section showed no connected bindings. In particular, D1 binding `DB` is absent.
- The Production deployment details showed successful build `#9976e07e` from branch `main`, commit `ca18d68` (message: "Append Firestore document-name fix to project records"). Deployment log listed only `env.FIREBASE_PROJECT_ID`; no D1 binding was attached.
- Cross-checked actual GitHub source: `main/src/index.ts` does not declare a D1 binding and does not contain the D1 account/profile routes. The setup branch source declares optional `DB` and contains the D1 application APIs.
- Setup-branch source identifies four additional secret values needed for encrypted credential/media-server and PIN operations: `DATA_ENCRYPTION_KEYS_JSON`, `DATA_ENCRYPTION_ACTIVE_VERSION`, `PIN_PEPPER_KEYS_JSON`, and `PIN_PEPPER_ACTIVE_VERSION`. These were not visible in the Production secrets list screenshot. Never record or request their values in chat.
- No Cloudflare configuration, secret, binding, database, migration, or deployment was changed during this audit. Supabase remains the rollback path.
- Next: complete read-only review of production deployment and secret configuration; then prepare a controlled release checklist. Do not add bindings, set secrets, apply D1 migration, change production branch, or deploy without explicit approval.


## 2026-11-13 — Production health endpoint check

- User opened the production Worker health endpoint and reported JSON response indicating `ok: true` and `service: watchathome-premium-api`.
- This confirms the currently deployed Worker is reachable and its health route responds. It does not validate Firebase-authenticated premium operations, D1 connectivity, application APIs, secret completeness, or the setup-branch code.
- No production changes were made.


## 2026-11-13 — Remote D1 initial schema applied and verified

- User manually executed the canonical `migrations/0001_initial.sql` statements in Cloudflare D1 database `watchathome-accounts` (ID `a39fe326-52c2-442c-ae71-5a11908059c7`).
- The initial attempt to paste the entire migration did not create application tables. A small `migration_test` table creation/verification succeeded and the temporary table was subsequently dropped.
- To avoid mobile-console paste issues, the user applied the canonical migration in batches: 4 initial tables, then 5, then 5, then the final 5. Each batch was reported as successfully executed.
- User then executed all 9 canonical named indexes successfully.
- Final verification query against `sqlite_master`, excluding Cloudflare's `_cf_KV` and SQLite internal objects, returned `index = 9` and `table = 19`. This matches the expected 19 application tables and 9 named indexes.
- The D1 schema is now present in the remote database. No application records were imported or seeded; this is schema-only.
- No Worker D1 binding, secrets, production deployment, Firebase configuration, or Supabase rollback configuration was changed as part of this migration.
- Next: verify the actual remote table and index names against the canonical migration, then configure the setup-branch Worker release prerequisites (including D1 binding and encryption/PIN secrets) under a separate controlled step. Do not deploy or switch app traffic until endpoint/security tests and explicit release approval are complete.


## 2026-11-13 — Exact remote D1 schema names verified

- User queried `sqlite_master` for all non-internal application tables. The result contained exactly the 19 expected names from `migrations/0001_initial.sql`: `accounts`, `profiles`, `profile_settings`, `profile_pin_credentials`, `profile_addons`, `profile_plugins`, `library_items`, `watch_progress`, `watched_items`, `collections`, `home_catalog_settings`, `provider_credentials`, `media_servers`, `registered_devices`, `device_link_sessions`, `sync_events`, `api_rate_limits`, `idempotency_keys`, and `account_deletion_jobs`.
- User queried `sqlite_master` for non-internal indexes. The result contained exactly the 9 expected names: `idx_profiles_owner_updated`, `idx_library_delta`, `idx_watch_progress_delta`, `idx_watched_items_delta`, `idx_sync_events_cursor`, `idx_sync_events_retention`, `idx_device_link_expiry`, `idx_registered_devices_active`, and `idx_idempotency_expiry`.
- Compared these names with the canonical migration file on this branch; all expected table and index names are present remotely.
- Remote D1 schema verification is complete. This verifies schema objects only, not data migration, foreign-key behavior, API correctness, Worker binding, or production readiness.
- No Worker binding, secrets, deployment, app cutover, Firebase settings, or Supabase rollback configuration was changed.


## 2026-11-13 — Isolated Preview D1 resource configured in Wrangler

- User created a separate Cloudflare D1 database named `watchathome-accounts-preview` and supplied database ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`.
- Updated setup-branch `wrangler.toml` to add `[previews.vars]` and a `[[previews.d1_databases]]` binding named `DB` pointing only to the Preview database. The production `[[d1_databases]]` binding remains pointed at `watchathome-accounts` (ID `a39fe326-52c2-442c-ae71-5a11908059c7`).
- Commit: `42cdbbadd0412c0bc5df82d1ea7d126b391b4a1f`.
- This is a source configuration change only. It does not apply the schema to the Preview database, configure Cloudflare runtime secrets, or deploy production.
- Preview and production both currently specify Firebase project ID `watchathome-admin`; no Firebase secrets were added or copied. Treat Preview as not ready for authenticated tests until secret isolation and access to production Firestore are reviewed.
- Next: allow the Preview build to run and inspect the new build result. If it succeeds, apply the same canonical schema to the Preview D1 database in isolated batches, then verify its tables/indexes. Do not deploy or change production.


## 2026-11-14 — Preview Worker deployment and D1 binding verified

- User inspected the Preview environment for branch `setup/firebase-cloudflare-zero-cost` in Cloudflare.
- Cloudflare Overview shows the Preview Worker has a recent successful deployment (Ready) and one binding listed as D1 database, binding name `DB`.
- The Preview build/deploy succeeded after adding the Wrangler `[previews.vars]` and `[[previews.d1_databases]]` configuration for the isolated Preview database.
- Production remains on branch `main`; this Preview deployment did not switch or replace Production.
- The screenshot confirms a D1 binding named `DB` is attached to Preview, but does not expose the database ID in the visible portion. The exact target should be checked in the binding details before using it.
- Preview D1 schema has not yet been applied or verified. No app data has been copied.
- No production Worker deployment, production binding change, secret update, Firebase change, or Supabase rollback change was made.
- Next: inspect the Preview `DB` binding details to confirm it points to `watchathome-accounts-preview` (ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`), then apply and verify the canonical schema in that Preview database before API testing.


## 2026-11-14 — Preview D1 canonical schema applied and verified

- User confirmed the Preview Worker binding points to the isolated D1 database `watchathome-accounts-preview` (ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`) and manually applied the canonical `migrations/0001_initial.sql` schema in batches through Cloudflare D1 Studio.
- User successfully executed all 9 canonical indexes in the Preview database.
- Final `sqlite_master` verification returned exactly `index = 9` and `table = 19`, matching the canonical schema object counts.
- This confirms Preview schema objects are present. No application records were imported or seeded; this remains schema-only.
- The repeated `CREATE TABLE IF NOT EXISTS` statements in the console history were idempotent and reported successful execution; they do not indicate duplicate tables.
- Production D1 database `watchathome-accounts`, Production Worker branch/deployment, Firebase settings/secrets, and Supabase rollback path were not changed by this Preview schema work.
- Next: inspect Preview runtime secret configuration and its Firebase/Firestore access boundaries before authenticated API testing. Do not copy production secrets into Preview or test against production user data without an explicit, reviewed safe plan. No production deployment or app traffic cutover is authorized by this verification.


## 2026-11-14 — Preview Firebase project isolation configured in Wrangler

- User provided a Firebase Console screenshot confirming the Preview Firebase project ID is exactly `watchathome-preview` (project number `1091456844777`).
- Updated only the `[previews.vars]` value in `wrangler.toml` so Preview uses `FIREBASE_PROJECT_ID = "watchathome-preview"`. Production `[vars]` remains `watchathome-admin`; Preview D1 remains `watchathome-accounts-preview` (ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`); Production D1 remains unchanged.
- Commit: `b3aea6e20dbf557289127524ceaec6d6664b1295`.
- This is a setup-branch source/configuration change only. It does not deploy the Worker or add/change any Firebase/Cloudflare secrets. Preview Worker deployment must rebuild before its runtime uses the new project ID.
- Preview Firebase Console currently shows no registered client apps. Admin Android app config and Preview Worker service-account credentials must be created specifically for `watchathome-preview`; do not reuse Production config/secrets.
- Firestore Preview rules remain deny-all and unpublished changes are not authorized. No Firestore data, Production settings, production deployment, or Supabase rollback path changed.
- Next: register the Admin Android package `com.tapframe.watchathomeadmin` in the Preview Firebase project and download its new `google-services.json`; then configure Preview-only Worker secrets from a Preview-project service account. Review Admin Firestore access before writing Preview rules.


## 2026-11-14 — Read-only Admin diagnostics endpoint

- Added authenticated `GET /v1/admin/diagnostics` on the setup branch. The existing Firebase ID-token verifier runs before this route.
- The endpoint performs read-only checks for service-account project/configuration, Google service authentication, Firestore read access to the caller's `admins/{uid}` document, and active-admin role fields. It does not create premium codes or write Firestore data.
- Response includes per-check pass/fail details, Preview project ID, service-account email, and timestamp; it never returns tokens, private keys, or service-account JSON.
- Source commit: `41551d9f68c09e6fc82fa9c3c595fbce9a3e548c`.
- Preview deployment is still required before the Admin diagnostics screen can use this endpoint. No Production deployment or configuration was changed.


## 2026-11-14 — Diagnostics route formatting correction

- Corrected the diagnostics route insertion after the first TypeScript check caught literal escaped newline characters in the route block.
- Corrected Worker source commit: `caf6ab32edcbe566101c4f4e6be6d77ac5b1e2ff`.
- A new Worker TypeScript/D1 validation run is queued/in progress; do not deploy until it succeeds.


## 2026-11-14 — Restore Cloudflare Worker entry-point export

- Investigated HTTP test failures: the Worker default export containing `fetch()` had been omitted from `src/index.ts` during an earlier source update. TypeScript still compiled, but the HTTP tests received an undefined default module handler.
- Restored the Cloudflare-compatible default export; no HTTP test assertions were weakened or bypassed.
- Source commit: `c7178d6e8256f5f360839d6044d2651241da9172`.
- Full Worker validation rerun pending. Preview deployment remains on hold until checks pass.

## 2026-11-14 — Account bootstrap/device registry source and CI revalidation

- Re-read src/index.ts, src/account-device.ts, wrangler.toml, migrations/0001_initial.sql, and the current account/device tests on the approved setup branch.
- Confirmed route dispatch includes Firebase-token-authenticated POST /v1/account/bootstrap, POST /v1/devices, GET /v1/devices, and DELETE /v1/devices/{installationId}. UID ownership is derived from the verified Firebase ID token; the verifier currently accepts the password sign-in provider and rejects anonymous tokens.
- Bootstrap validates Firebase account metadata via Identity Toolkit, creates/checks the D1 account root idempotently, and initializes the existing Firestore trial flow. Device registry operations require an active D1 account.
- Confirmed production D1 DB binding points to watchathome-accounts (a39fe326-52c2-442c-ae71-5a11908059c7) and Preview DB binding points to isolated watchathome-accounts-preview (38cb13eb-dfbd-403f-92a9-43b545d6375c). Earlier user-provided verification recorded 19 application tables and 9 indexes in each database. This is schema verification, not proof of live API behavior.
- Latest Worker CI run 43545476435 completed successfully: TypeScript and D1 test job passed after restoring the Cloudflare default export. The preceding HTTP test run failed because the default export was absent; the successful rerun resolves that test harness failure. Do not infer real Firebase/Firestore/remote D1 integration from this CI result.
- Device-link start/approval/poll/exchange and full account deletion routes remain absent from current route dispatch. device_link_sessions and account_deletion_jobs are schema only until complete route/state-machine behavior is implemented and tested.
- No new Worker source/runtime, D1 schema/data, secrets, Firebase settings, deployment, or production configuration was changed by this revalidation. Documentation only.



---

# SOURCE DOCUMENT: PREMIUM WORKER — CHANGELOG

**Repository:** `bugoyweak7/WatchAtHomePremiumWorker`  
**Path:** `CHANGELOG.md`  
**Blob SHA at snapshot:** `6e0b1f80f1d0016e48dbca7c7b401f895f205ddf`  
**Original content follows in full.**

# Changelog

## 2026-11-14 — Read-only Admin diagnostics endpoint

- Added authenticated `GET /v1/admin/diagnostics` to report service-account project/configuration, Google service authentication, Firestore read access, and the caller's active-admin record.
- The endpoint performs no Firestore writes and never returns tokens, private keys, or service-account JSON.
- Preview deployment and runtime verification remain pending. Production was not deployed or changed.

## 2026-11-14 — Account bootstrap/device registry evidence revalidation
- Re-verified current Worker account bootstrap and device registry routes, D1 bindings, and successful TypeScript/D1 CI run 43545476435.
- Recorded remaining blockers: no complete device-link flow, no complete account deletion workflow, and no live Firebase/Firestore/D1 integration proof.
- Documentation only; no Worker runtime, D1 data/schema, secrets, Firebase settings, or deployment changed.



---

# SOURCE DOCUMENT: PREMIUM WORKER — ARCHITECTURE

**Repository:** `bugoyweak7/WatchAtHomePremiumWorker`  
**Path:** `ARCHITECTURE.md`  
**Blob SHA at snapshot:** `ba5dfcc2ec8b31818b73d27f3d5e8c8ade66493b`  
**Original content follows in full.**

# WatchAtHome Firebase + Cloudflare setup

## Approved architecture

- Firebase Authentication: email/password identity only.
- Cloud Firestore: premium codes, premium entitlements, immutable trial timestamps, admin roles, and the existing add-ons catalogue.
- Cloudflare Workers: trusted application APIs and Firebase ID-token verification.
- Cloudflare D1: profile-scoped application data and synchronization.
- Cloudflare R2: uploaded images and files. Prefer TMDB-hosted image URLs for catalogue artwork when possible; do not copy the full TMDB catalogue into Firestore.
- Cloudflare Durable Objects: real-time Watch Party coordination.

## Important separation

Premium codes and entitlements remain in Firestore. This Worker continues to use the Firestore REST API for those operations. D1 is for high-volume application data such as profiles, watch progress, history, collections, provider configuration, media-server metadata, device registration, and sync events.

Firebase Authentication is not replaced. The API must verify the Firebase ID token on every authenticated request and derive the UID from the verified token. Never accept a caller-supplied UID as proof of identity.

## D1 database

The initial schema is in `migrations/0001_initial.sql`.

Create the database and bind it only after reviewing the schema:

```bash
npx wrangler d1 create watchathome-app
```

Add the returned database_id to the app-data Worker configuration as a D1 binding named `DB`. Do not put credentials or secrets in source control.

Apply the migration to a non-production database first:

```bash
npx wrangler d1 execute watchathome-app --local --file=./migrations/0001_initial.sql
```

Then inspect the tables and test migrations locally. Only use a remote database after explicit production-data approval.

## Security requirements

- Every D1 query must be scoped by the authenticated Firebase UID through profile ownership joins/conditions.
- Do not expose D1 binding credentials or service secrets to clients.
- Provider credentials and media-server tokens must be encrypted before persistence. The schema deliberately stores encrypted payloads and a key version, not plaintext secrets.
- Never store movie/video binaries or poster image bytes in Firestore or D1.
- Use parameterized SQL; never interpolate user input into SQL.
- Apply bounded pagination and request-size limits.
- Use short retention for temporary TV pairing sessions and sync events; prune expired sessions and old sync events with bounded scheduled jobs.
- Do not use frequent polling. Prefer delta sync, local caching, and batched writes.
- Do not store a full movie catalogue per user. Store only user-specific references and settings.

## Free-tier cost controls

Design for the current free allowances, not unlimited usage:
- Batch related D1 writes.
- Fetch only changed records using sync event cursors.
- Keep payloads compact and paginate.
- Avoid duplicate writes when values have not changed.
- Keep large assets in R2 or use external artwork URLs.
- Add quotas and rate limits at the Worker layer.
- Monitor usage before enabling any paid plan. No billing-plan changes or production deployment are part of this repository setup.

## Existing premium API

The existing premium endpoints and Firestore-backed entitlement logic are preserved. No Firestore collections are migrated to D1 by this schema.


## D1 schema reconciliation — 2026-11-13
- The approved User App Worker modules use the composite ownership model `(user_id, profile_index)` and the 19-table `accounts` schema.
- The older setup-branch migration using `app_users` and `profile_id` did not match those current modules and is superseded before any D1 migration was applied.
- The canonical migration is `migrations/0001_initial.sql`, copied from the reviewed User App schema and validated by local SQLite schema tests.
- Premium codes, entitlements, trial timestamps and admin roles remain Firestore-backed.
- Wrangler binds the already-created `watchathome-accounts` D1 database as `DB`. This source configuration does not apply SQL or deploy the Worker.



---

# SOURCE DOCUMENT: PREMIUM WORKER — README / API REFERENCE

**Repository:** `bugoyweak7/WatchAtHomePremiumWorker`  
**Path:** `README.md`  
**Blob SHA at snapshot:** `1431aeb0e2421a34dc950eb496161e68cdcc9794`  
**Original content follows in full.**

# WatchAtHome Premium API

This Worker uses the existing Firebase project `watchathome-admin`. Firebase Authentication remains the identity provider and Firestore remains the premium source of truth. Cloudflare only hosts trusted server-side operations.

## Endpoints

- `GET /health` — service health.
- `POST /v1/admin/premium-codes` — active Firebase administrators create codes. JSON: `{"count":5,"durationDays":30}`.
- `POST /v1/premium/redeem` — signed-in user redeems JSON: `{"code":"WAH-XXXX-XXXX-XXXX"}`.
- `POST /v1/trial/initialize` — initializes the immutable seven-day trial using Firebase's verified account creation timestamp.
- `GET /v1/premium/status` — signed-in user's current entitlement.

All endpoints except health require a Firebase Authentication ID token in the Authorization Bearer header. Only registered email/password accounts are accepted. Admin code creation additionally checks `admins/{uid}` with `role == "admin"` and `active == true`.

## Firestore documents

- `premium_codes/{sha256(normalizedCode)}` stores code state and the code string for the admin-only code-history screen. Firestore rules must deny all non-admin reads/writes to this collection.
- `users/{uid}` stores premium entitlement and trial timestamps.

Codes have a 24-hour-and-15-minute activation window and a duration selected by the admin. Both day-based codes and minute-based test codes are supported. Redeemed codes are single-use. A new code extends an existing active entitlement rather than shortening it.

## Configure and deploy

1. Install dependencies with `npm install`.
2. Configure `FIREBASE_WEB_API_KEY` as a Worker secret.
3. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a Worker secret.
4. Keep `FIREBASE_PROJECT_ID` set to `watchathome-admin` in `wrangler.toml`.
5. Run `npm run check` before deployment.
6. Deploy only after explicit release approval using `npm run deploy`.

Never commit a service-account key or place it in `[vars]`. The service account's IAM permissions bypass Firestore Security Rules. The Worker therefore performs its own Firebase ID-token and admin-document checks. Keep its IAM role limited to required Firestore data access. Never expose the service-account key to either mobile app.

## Client integration

Mobile clients must fetch a fresh Firebase ID token and call the endpoints over HTTPS. The User app must display premium only from the server response or mirrored user entitlement fields protected by Firestore rules. Do not allow client-side writes to `premium`, `premiumExpiresAt`, or `premium_codes`.

## Admin app configuration

After the Worker is deployed, set its HTTPS base URL when building the Admin app:

```powershell
./gradlew assembleDebug -Pwatchathome.premiumApiBaseUrl=https://YOUR-WORKER.workers.dev
```

The Admin app calls `POST /v1/admin/premium-codes` for code creation and reads the admin-only `premium_codes` collection for history. Do not put service-account credentials in the app.


## D1 application APIs

The Worker also hosts authenticated D1-backed account, device, profile/settings, add-on/plugin/collection, home-catalog, library, watch-progress, watched-items, PIN, provider-credential, and media-server APIs from the approved User App contracts. Every D1 request derives the UID from the verified Firebase token and scopes data by UID/profile index. Existing premium-code, entitlement and trial APIs remain Firestore-backed.

### Required secret configuration
- Firebase: `FIREBASE_WEB_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Encrypted credentials/media-server tokens: `DATA_ENCRYPTION_KEYS_JSON`, `DATA_ENCRYPTION_ACTIVE_VERSION`.
- Profile PIN operations: `PIN_PEPPER_KEYS_JSON`, `PIN_PEPPER_ACTIVE_VERSION`.

Configure secrets through Cloudflare secrets only. Do not commit secret values. No remote D1 migration or deployment is performed by source changes or CI.



---

## 10. Final instruction for future continuation

This master file is a consolidated snapshot and starting point, not permission to modify anything. At the start of each new task:
- read this entire file;
- inspect the current approved branch and relevant source/status files;
- check for commits newer than the snapshot;
- state the evidence and the one safest next action;
- wait for the user's GO before changing anything;
- append documentation/changelog entries for any authorized changes;
- preserve Supabase until evidence and explicit approval make removal safe.

**End of master handover snapshot.**


---

# APPENDED MASTER HANDOVER UPDATE — 2026-11-14
## Supabase migration evidence matrix and reporting-location rule

**Reporting rule:** All future project reports, audit findings, migration matrices, implementation summaries, test results, blockers and handover updates must be recorded inside this `WATCHATHOME_MASTER_HANDOVER.md` file. Do not create separate report documents for new work. Keep this file append-only: add dated sections; do not rewrite or remove historical content. `SETUP_STATUS.md` and `CHANGELOG.md` may receive concise operational pointers required by the project workflow, but the complete report belongs here. Do not duplicate the full report in `REPORT_LOG.md`.

### Supabase migration evidence matrix

The following is the full source-audited migration matrix created on 2026-11-14 and incorporated here as the authoritative report:

# Supabase-to-Firebase/Cloudflare Migration Evidence Matrix

Last reviewed: 2026-11-14 (Asia/Manila)
Repository evidence baseline: `bugoyweak7/WatchAtHomeV2`, branch `setup/firebase-cloudflare-zero-cost`
Scope: source-level migration planning. This document does not claim live endpoint parity or remote legacy data export.

## Decision and safety rules

- Target: remove Supabase from the shipped User App and its runtime/backend dependencies only after every active feature has a verified Firebase/Cloudflare replacement.
- Keep all current Supabase adapters, credentials/configuration and rollback path until each feature is individually cut over and regression-tested.
- Do not delete or reset local user data during failed login, sync, migration, or account deletion.
- Derive account ownership from verified Firebase ID tokens; never trust a client-supplied UID.
- Keep shared Admin Firestore add-on catalogue separate from per-user/profile installed add-ons.
- Do not disable or delete the inherited upstream Supabase service. The user does not own that project; no dashboard/schema/RLS/Edge Function access is available. Remote data migration is therefore unverified.

## Feature-by-feature evidence matrix

| Feature / data | Verified legacy client dependency | Firebase / Cloudflare replacement evidence | Status and remaining gate |
|---|---|---|---|
| Email/password auth and session | Active `AuthRepository` uses Supabase Auth for state, registration, sign-in, refresh, sign-out and invalid-session handling. | GitLive Firebase Auth gateway/session manager exists; Worker verifies Firebase password-provider ID tokens. | **BLOCKED.** Firebase session layer is staged, not wired to active AuthScreen/AppGate. Wire only after protected APIs and account lifecycle are ready; test session persistence, refresh, sign-out and recovery. |
| Anonymous/local UUID access | Active auth flow still supports local UUID/anonymous access and UI entry point. | Approved target is registered Firebase email/password accounts only. | **BLOCKED.** Remove anonymous path only with explicit migration behavior and local-data preservation tests. |
| Account bootstrap and device registry | Supabase identity currently anchors app account and device registration (`register_current_device`). | Worker has Firebase-authenticated `POST /v1/account/bootstrap`, `POST /v1/devices`, `GET /v1/devices`, and `DELETE /v1/devices/{installationId}`; D1 schema and Preview/Production database schema objects are documented as present. | **PARTIAL.** CI/source/schema evidence exists; live Preview endpoint, Firebase token, D1 binding and ownership behavior still require integration verification with a dedicated test account. |
| TV/device-link login | Supabase RPCs `start_device_login_session`, `poll_tv_login_session` and Edge Function `tv-logins-exchange`; client imports Supabase session tokens. | D1 has `device_link_sessions` schema; no complete Worker start/approve/poll/one-time Firebase token exchange flow is verified. | **BLOCKED.** Design nonce-bound, short-lived, one-time pairing, explicit approval, replay protection and Firebase-compatible session exchange. Do not broadly allow custom-provider tokens. |
| Account deletion | Supabase Edge Function `delete-account`; local cleanup follows old session lifecycle. | D1 `account_deletion_jobs` table exists; no complete cross-store deletion state machine is verified. | **BLOCKED.** Implement reauthentication, idempotent job/retry, Firebase Auth deletion, D1/Firestore/R2 cleanup and safe local cleanup only after server success. |
| Profiles and profile locks/PIN | Supabase RPCs `sync_pull_profiles`, `sync_push_profiles`, `sync_delete_profile_data`, `sync_pull_profile_locks`, `verify_profile_pin`, `set_profile_pin`, `clear_profile_pin`, `clear_profile_pin_with_account_password`. | Worker profile CRUD, profile locks and PIN routes/modules exist; D1 profile/PIN schema and tests are present. | **PARTIAL.** Verify active account bootstrap, PIN hashing/pepper secrets, lockout/rate limits, ownership, reauthentication and live Preview parity before wiring the mobile repository. Never store raw PINs. |
| Profile settings | Supabase RPCs `sync_pull_profile_settings_blob` / `sync_push_profile_settings_blob`; profile/platform JSON blob. | Worker GET/PUT profile-settings API and staged Cloudflare adapter; JSON unknown-key preservation and sensitive-key rejection tests documented. | **PARTIAL.** Mobile sync remains on Supabase. Verify live Preview round-trip, platform scoping, conflict/merge semantics, and no incomplete snapshot overwrites before cutover. |
| Per-profile installed add-ons | Supabase PostgREST `addons` table filtered by `profile_id`; RPC `sync_push_addons`; local manifest URLs/enabled state. | Worker D1 per-profile add-on API and local storage exist. Shared Admin Firestore `/addons` catalogue is a separate concept. | **PARTIAL.** Preserve local installed URLs and per-profile enabled/order choices. Complete and test user-installed list sync independently from the shared Admin catalogue. |
| Shared Admin add-on catalogue | Not the same as legacy user-installed add-ons. Admin App writes Firestore `addons/{addonId}` with publish/enabled metadata. | Worker uses service-account Firestore access; public read-only catalogue endpoint is a proposed integration, not yet verified as implemented. | **BLOCKED / separate workstream.** Expose only published+enabled public metadata; Admin writes remain authenticated. Add version/change detection and the User App “Update Catalog” flow without overwriting profile preferences. |
| Plugin repositories | Supabase PostgREST `plugins` table and RPC `sync_push_plugins`; manifest URLs and scraper state are locally managed. | Worker profile plugin APIs and D1 table/tests exist. | **PARTIAL.** Verify platform gating, local cache behavior, manifest refresh and profile ownership. Do not store scraper source as if it were the legacy row payload. |
| Collections | Supabase RPCs `sync_pull_collections`, `sync_push_collections`; collection JSON blob. | Worker D1 collection API; JSON unknown-field round-trip and sensitive-field rejection tests documented. | **PARTIAL.** Live Preview and mobile adapter parity required; preserve unknown JSON keys and delete semantics. |
| Library | Supabase RPC snapshot, cursor, delta, push and delete operations. | Worker D1 snapshot pagination, cursor, delta, upsert and tombstone APIs; staged mobile adapter and guarded repository selection exist. | **PARTIAL.** Cloudflare flag defaults false. Test snapshot/delta ordering, pagination, tombstones, batching, origin metadata, profile isolation and local-first behavior end to end. |
| Watch progress | Supabase RPC snapshot, cursor, delta, push and delete operations. | Worker D1 snapshot/cursor/delta/upsert/delete APIs; staged mobile adapter and guarded selection exist. | **PARTIAL.** Verify stable progress identity, timestamp filters, pagination, delta ordering and tombstones end to end. |
| Watched history | Supabase RPC snapshot, cursor, delta, push and delete operations. | Worker D1 APIs and staged mobile adapter; source notes record content-type identity and legacy delete-key compatibility tests. | **PARTIAL.** Verify current CI and live Preview behavior, including same content ID across media types and delete tombstones. |
| Home catalogue settings | Supabase RPCs `sync_pull_home_catalog_settings` / `sync_push_home_catalog_settings`, profile/platform JSON. | Worker D1 GET/PUT route and staged adapter/source support exist. | **PARTIAL.** Verify platform scoping, JSON merge/unknown fields, local defaults and live integration. |
| Provider credentials | Supabase RPCs `sync_pull_provider_credentials` / `sync_push_provider_credentials`; credential JSON includes provider secrets. | Worker provider-credential API and encrypted D1 storage modules exist; encryption key-ring secrets are required. | **BLOCKED until secret verification.** Verify Preview-only encryption secrets, key rotation, ciphertext-at-rest, no secret logging, ownership and restore behavior. Never copy secrets into source or chat. |
| Media servers | Supabase RPCs `sync_pull_media_servers` / `sync_push_media_servers`; serialized model may contain server token. | Worker media-server API and encrypted D1 storage modules exist; encryption key-ring secrets are required. | **BLOCKED until secret verification.** Inspect exact model/secret fields; verify encryption, redaction, ownership and live round-trip. |
| Device registration | Supabase RPC `register_current_device`. | Worker D1 device registry routes exist. | **PARTIAL.** Verify installation ID stability, revocation semantics, retention and live client integration. |
| Membership/supporter/subscription | Supabase RPCs `get_my_member_access`, `get_my_membership_overview`; response includes entitlement, provider/subscription/billing/grant metadata. | Worker premium/trial APIs exist but do not prove equivalence to the full legacy membership overview. | **BLOCKED.** Identify authoritative entitlement/subscription source and map every visible field/behavior before replacing. |
| Watch Party | Supabase RPCs for party lifecycle, membership, playback, chat and clock; private Realtime presence/broadcast channel `watch-party:<partyId>`. | Durable Objects are the planned realtime target; no equivalent complete Worker/DO route implementation or parity proof is recorded. | **BLOCKED.** Implement private-room auth, presence, reconnect, event fan-out, host controls, chat history and clock semantics; polling alone is not equivalent. |
| Shared member assets / Storage | Supabase Storage integration exists in the User App source inventory. | R2 is the approved target for uploaded user images/files only. | **NEEDS DETAILED INVENTORY.** Identify exact buckets, object paths, metadata, access and lifecycle; do not store movie/video binaries in R2. |
| Runtime configuration and dependencies | `SupabaseProvider`, `SupabaseEndpointConfig`, generated `SupabaseConfig.kt`, Gradle build-time Supabase URL/key/fallback variables, and PostgREST/Auth/Functions/Storage/Realtime libraries remain. | Firebase SDKs and Cloudflare Worker adapters are present. | **BLOCKED until final cutover.** Remove only after repository-wide source/build/runtime scan proves no remaining call sites; verify Android, Android TV and iOS builds. |

## Cross-cutting migration gates

1. **Contract and data gate:** map every legacy request, response, field, ordering rule, pagination/delta cursor, mutation, delete/tombstone, sync-origin value and error behavior. The upstream SQL schema, RLS, triggers, Edge Function code and Realtime authorization are not available; do not invent them.
2. **Identity gate:** Firebase email/password session is active and stable; account bootstrap and every protected Worker route accept the same verified identity. No anonymous/guest account path remains in the approved product behavior.
3. **Security gate:** verify UID/profile ownership, request bounds, rate limits, CORS origin policy, least-privilege Firestore service account, encryption/PIN secrets, no secret logging and abuse controls.
4. **Preview gate:** isolated Preview Firebase project, Preview Worker, Preview D1 binding/schema and Preview-only secrets are verified. Run integration tests with a dedicated test account and no production user data.
5. **Feature cutover gate:** migrate one feature at a time behind an explicit opt-in/rollback switch. Confirm app UI/player behavior, offline/local-first behavior, sync conflict semantics and data integrity.
6. **Platform gate:** Android mobile, Android TV and iOS compile and regression tests pass for each affected feature.
7. **Data/rollback gate:** preserve local data; define an authorized export/import path for only the current user's own legacy data if the inherited service allows it. No remote data migration is currently proven.
8. **Final removal gate:** only after all feature cutovers are verified, run a full recursive scan for Supabase imports, URLs, keys, generated config, Gradle aliases/dependencies, tests, CI variables and runtime paths. Then remove obsolete client code/config/dependencies in a separately reviewed change. Do not delete or disable the inherited upstream Supabase project/service.

## Recommended first implementation sequence

1. Verify Preview Firebase service-account and Web API configuration are Preview-only; inspect the Preview Worker D1 binding and runtime health without exposing secrets.
2. Complete the Worker account lifecycle contract: bootstrap, Firebase session expectations, device-link pairing/exchange and account deletion. Implement missing pieces with tests before changing active mobile auth.
3. Wire Firebase email/password auth into the User App behind a controlled Preview/test-account path. Remove anonymous entry only after migration behavior is validated.
4. Prove account bootstrap, device registration, profiles/PIN and profile settings end to end.
5. Continue with add-ons/plugins/collections, library/progress/watched, home settings, credentials/media servers, membership, storage and Watch Party.
6. Only then perform the final Supabase removal audit and code/dependency cleanup.

## Current evidence conclusion

Supabase is still required by active app paths. The source and test foundation for Firebase/Cloudflare is substantial, but live end-to-end parity, device-link, complete account deletion, full membership parity, Watch Party realtime, sensitive-secret verification, legacy remote data migration and final platform builds remain unresolved. **Do not remove Supabase now.**

## Evidence references

- `docs/LEGACY_BACKEND_SOURCE_COMPATIBILITY_AUDIT.md` — source-level RPC, payload, storage and Realtime contracts; explicitly notes missing upstream server-side definitions.
- `docs/FIREBASE_CLOUDFLARE_ACCOUNT_MIGRATION_CONTRACT.md` — draft account identity, ownership and Worker API contract.
- `SETUP_STATUS.md` — dated repository and infrastructure verification records, including current Preview/Production separation and no-cutover constraints.
- `src/index.ts`, feature API modules, `migrations/0001_initial.sql`, `wrangler.toml` — current Worker routes, schema and environment configuration.


### Reporting workflow from this update

1. Read the current master handover and relevant current source/status files before each task.
2. Append every full report to this master file, including evidence, changed files, test outcomes, unresolved blockers and next safe step.
3. Keep `SETUP_STATUS.md` and `CHANGELOG.md` aligned with concise dated entries; do not create standalone report files.
4. Preserve the append-only rule and all prior handover history.
5. No Supabase removal, feature cutover, cloud mutation or production deployment is authorized merely by this reporting rule. Existing GO/approval gates remain in force.


---

# APPENDED PREVIEW ENVIRONMENT VERIFICATION REPORT — 2026-11-14
## Scope

Authorized next step: verify isolated Preview configuration and account-lifecycle readiness before active Firebase authentication cutover. Read-only source/documentation verification only. No Cloudflare dashboard access, secret-value access, live Preview URL test, source modification, deployment, or cloud mutation was performed.

## Repositories and source checked

- User App: `bugoyweak7/WatchAtHomeV2`, branch `setup/firebase-cloudflare-zero-cost`.
- Premium Worker: `bugoyweak7/WatchAtHomePremiumWorker`, branch `setup/firebase-cloudflare-zero-cost`.
- Read the current `WATCHATHOME_MASTER_HANDOVER.md`, `SETUP_STATUS.md`, and `CHANGELOG.md` before this step.
- Re-fetched current Worker `wrangler.toml`, `src/index.ts`, `package.json`, Worker `SETUP_STATUS.md`, User App debug `google-services.json`, and Android `build.gradle.kts`.

## Verified source configuration

### Firebase project separation

- User App debug `google-services.json` identifies Firebase project `watchathome-preview`, project number `1091456844777`.
- Its registered Android package IDs include `com.nuvio.app`, `com.nuviodebug.com`, and `com.tapframe.watchathomeadmin`.
- Android Gradle config sets the debug application ID to `com.nuviodebug.com`.
- Worker `wrangler.toml` sets Production `FIREBASE_PROJECT_ID = watchathome-admin` and Preview `FIREBASE_PROJECT_ID = watchathome-preview`.
- This verifies repository configuration separation only. It does not verify Firebase Console Auth providers, Firestore rules, service-account permissions, or deployed runtime variables.

### D1 binding separation

- Production Wrangler binding: `DB` → `watchathome-accounts`, database ID `a39fe326-52c2-442c-ae71-5a11908059c7`.
- Preview Wrangler binding: `DB` → `watchathome-accounts-preview`, database ID `38cb13eb-dfbd-403f-92a9-43b545d6375c`.
- Existing project records report that the Preview Worker deployment and Preview D1 schema (19 application tables and 9 indexes) were manually verified by the user on 2026-11-14. This current source check confirms the Wrangler target IDs; it does not independently query Cloudflare's live binding or D1 migration history.
- Production and Preview D1 targets are distinct in the checked-in configuration.

### Worker runtime contract

- Worker environment type requires `FIREBASE_WEB_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON`; optional sensitive-feature secrets include encryption key-ring and PIN pepper configuration.
- Service-account parsing explicitly rejects a project ID that does not match `FIREBASE_PROJECT_ID`.
- Firebase ID-token verification checks issuer/audience against the selected project and requires `sign_in_provider=password`; anonymous/other provider tokens are rejected.
- `GET /health` is implemented before authentication and returns the service health identity. This is source evidence only; no exact Preview deployment URL was available in the checked repository files, so a live Preview HTTP health request was not performed.
- `POST /v1/account/bootstrap` requires the D1 `DB` binding, obtains Firebase account creation time via Identity Toolkit using the Web API key, creates the D1 account root idempotently, and initializes the Firestore trial.
- Device register/list/revoke routes also require the D1 account root.

## Blockers and missing runtime evidence

1. **Preview secrets — NOT VERIFIED.** GitHub source/configuration cannot establish whether Cloudflare Preview has its own `FIREBASE_WEB_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON`. Do not copy Production values. Verify only the secret names/presence in Preview settings; never share their values in chat.
2. **Preview Firestore access — NOT VERIFIED.** Confirm the Preview service account belongs to `watchathome-preview` and has only the required Preview Firestore permissions. Preview Firestore rules and data access must be separately reviewed.
3. **Preview runtime health — NOT LIVE-TESTED.** The route exists in source, but the exact branch Preview URL and its active deployed version were not established in this step.
4. **Account lifecycle remains incomplete.** Worker source has bootstrap and device registry routes, but no complete `/v1/device-link/*` start/approve/poll/one-time Firebase exchange routes were found in the current route dispatcher. No complete account-deletion route/state machine was found.
5. **Active mobile authentication remains Supabase.** Firebase auth gateway/session manager remains staged. Do not wire the active login or enable global Cloudflare sync until account lifecycle and Preview integration pass.

## Result

- **Verified:** Preview and Production project/database IDs are separated in current Wrangler source; Android debug Firebase config targets Preview; Worker auth/bootstrap source contract exists.
- **Not verified:** Preview-only secret presence and correctness, Firebase Console settings/Firestore access, live Preview deployment URL/version/health, real authenticated bootstrap against Preview.
- **Still blocked:** secure TV device-link flow, complete account deletion, and active Firebase auth cutover.
- **Supabase removal:** not safe. Keep all Supabase paths and rollback configuration intact.

## Safest next action

Have the user inspect Cloudflare Worker Preview environment secrets and confirm the presence (names only, no values) of `FIREBASE_WEB_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON`, and confirm the Preview service account is from `watchathome-preview`. After that, obtain the exact Preview deployment URL from the Preview deployment page and perform only unauthenticated `GET /health`. Then implement and test missing device-link and account-deletion Worker flows before wiring active Firebase authentication.

## Change and safety record

- No application source, tests, Wrangler configuration, Firebase project settings, Firestore rules/data, D1 schema/data, Cloudflare secrets/bindings, Supabase configuration/data, or deployments were changed.
- This complete report is recorded here per the user's instruction that all full project reports belong in `WATCHATHOME_MASTER_HANDOVER.md`.
