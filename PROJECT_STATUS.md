# WatchAtHomeV2 Project Status

Last verified: 2026-11-13 (Asia/Manila)
Repository: `bugoyweak7/WatchAtHomeV2`
Baseline branch: `setup/firebase-cloudflare-zero-cost`
Verified branch head: `c4b106b8b994154208d2672f381750cf29665352`
Status: Migration in progress. This document records verified repository state, not live Firebase or Cloudflare account state.

## Repository scope

- User App: `bugoyweak7/WatchAtHomeV2`
- Admin App: `bugoyweak7/WatchAtHomeAdmin`
- The old `WatchAtHomeV2-Firebase-Migration` repository is not the active baseline.
- Admin source was inspected on its `main` branch. Its app module uses Firebase Authentication and Cloud Firestore.

## Verified User App state

### Firebase

- Android Firebase configuration exists at `androidApp/google-services.json` and `androidApp/src/debug/google-services.json`.
- The configuration identifies Firebase project `watchathome-admin`.
- Firebase Auth and Firestore dependencies are declared for Android.
- `FirebaseBackend.android.kt` exposes Android `FirebaseAuth` and `FirebaseFirestore` instances.
- The main `AuthRepository` has not migrated: it still calls `SupabaseProvider` for session status, email/password sign-up/sign-in, sign-out and session validation.
- `AuthRepository.signInAnonymously()` and local anonymous-user ID handling remain in source.
- Common-source GitLive Firebase Auth/Firestore dependencies are declared, but the inspected main authentication repository still uses Supabase.

### Remaining Supabase dependencies

- `SupabaseProvider.kt` still creates the Supabase client and installs Auth, Postgrest, Functions, Storage and Realtime.
- Runtime configuration still generates `SupabaseConfig.kt` from Supabase URL/key settings.
- Profile, library and watch-progress Supabase adapters remain in the repository.
- Supabase dependencies remain in the version catalog and common source-set dependencies.
- Do not remove these until replacement behavior, tests, and cutover are verified independently.

### Cloudflare Worker and premium

- Worker source: `premium-worker/src/index.ts`.
- Worker config: `premium-worker/wrangler.toml`.
- Worker package: `premium-worker/package.json`.
- Worker uses Firebase ID-token verification and Firestore REST operations for premium codes, trial initialization and premium status.
- Worker code includes account bootstrap, device registration/listing, profile APIs, profile settings, add-ons, plugins, collections, profile PINs, provider credentials and media-server routes.
- The Worker requires a Firebase service-account JSON secret. Repository source does not prove that the secret is configured in the live Cloudflare account.
- The Worker reads/writes D1 through an optional `DB` binding in its environment. The inspected `wrangler.toml` has no D1 database binding.
- Draft D1 schema and Worker modules exist. Existing changelog records explicitly say D1 is draft-only and unprovisioned.
- `workers_dev = true` is present in configuration. This is not proof that the current source has been deployed or that a production route is active.
- Worker token validation currently requires Firebase `sign_in_provider == "password"`. Device-link/custom-token support is not implemented in the inspected route set.

### Firestore and rules

- Worker premium operations use the `users/{uid}`, `admins/{uid}` and `premium_codes/{codeHash}` documents in project `watchathome-admin`.
- The Worker README requires non-admin reads/writes to `premium_codes` to be denied by Firestore rules.
- No `firebase.json` or Firestore rules file was found in the inspected User App branch tree.
- No Firestore rules file was found at the standard root paths inspected in the Admin repository. Live deployed rules have not been inspected; repository absence does not establish the live rules state.

## Verified Admin App state

- Repository: `bugoyweak7/WatchAtHomeAdmin`, inspected on `main`.
- `app/build.gradle.kts` declares Firebase Auth and Firestore.
- `app/google-services.json` identifies the same `watchathome-admin` Firebase project and Admin package `com.tapframe.watchathomeadmin`.
- `MainActivity.kt` uses Firebase Auth and Firestore.
- Add-ons management source reads and writes the shared `addons` Firestore collection and reports that active admin authorization is expected through `admins/{uid}` with `role=admin` and `active=true`.
- The Admin repository's latest inspected main-branch commit is `d3d0147317a1a27a0dfe8260735a7997a6920aa5` (2026-11-11). This is repository commit evidence, not a live deployment/build check.

## Existing test evidence

The existing `CHANGELOG.md` records GitHub Actions run `43382547116` passing TypeScript compilation and 61 Worker tests on 2026-11-13. This is historical CI evidence from the changelog, not a new test run performed during this audit.

## Next safe work

1. Complete a source-level inventory of every Supabase auth, account, profile, sync, membership and Watch Party call.
2. Define and test Firebase email/password authentication and account bootstrap before switching the app.
3. Preserve local account data and sync behavior throughout cutover; do not delete legacy adapters yet.
4. Complete and test each Worker route against the legacy contract before switching its adapter.
5. Decide whether D1 is actually needed for each data class; keep the lowest-cost viable Firebase Spark/Cloudflare Free design and do not provision resources without a separate reviewed decision.
6. Add and validate Firestore rules before relying on client Firestore access.
7. Verify live Cloudflare bindings, secrets, deployment and Firebase settings separately; repository files alone cannot prove live account state.

## Change control

- Project status and changelog are append-only records.
- Never remove or rewrite historical entries.
- Preserve existing app behavior unless a specific change is approved.
- No code, Firebase rules, Cloudflare resources, secrets, or deployments were changed by this status audit.


## 2026-11-13 — Supabase migration source inventory

- Added `docs/SUPABASE_FIREBASE_CLOUDFLARE_MIGRATION_MAP.md`, based on direct source inspection of the selected branch.
- Mapped AuthRepository, device-link, profile/PIN, profile settings, provider credentials, media servers, add-ons, plugins, collections, library, watch progress, watched items, membership/premium, and Watch Party dependencies.
- Confirmed library, watch-progress, watched-items, membership parity, account deletion, device-link custom-token, and Watch Party realtime routes are still missing from the inspected Worker dispatch; the design contract alone does not implement them.
- Confirmed the current Worker route set covers account bootstrap/devices, profiles/settings/PIN, add-ons/plugins/collections, provider credentials/media servers, and premium/trial operations.
- Recorded the safe migration order and the requirement to preserve local caches, sync cursors, tombstones, and offline behavior.
- Documentation-only update. No application source, Firebase rules, Cloudflare resources, secrets, deployments, or Supabase data changed.


## 2026-11-13 — Staged Firebase email/password authentication layer

- Added `FirebaseAuthGateway.kt` using the already-declared GitLive Firebase Auth 2.8.0 dependency. It exposes registered-account creation/sign-in, auth-state observation, sign-out, and fresh Firebase ID-token retrieval.
- Added `FirebaseAuthSessionManager.kt` and the public `FirebaseAuthRepository` entry point. Anonymous Firebase sessions are rejected and signed out.
- Added six common tests using a fake gateway for session restoration, anonymous rejection, registration/sign-in, input validation, ID-token access, and sign-out.
- Added `.github/workflows/watchathome-firebase-auth-check.yml` to compile the Android Play Store debug variant when the staged auth files change.
- This is a parallel/staged auth layer only. It is not wired into `AuthScreen` and does not replace `AuthRepository`. The active app still uses Supabase authentication.
- Reason: current profile/data sync, device-link and account-deletion paths still require Supabase sessions. A login-only cutover would break those features.
- The Worker account-bootstrap endpoint currently depends on an unconfigured D1 binding and is not ready for app registration flow. No app-to-Worker bootstrap call was added.
- CI run `43387942928` started for the Android compile workflow; result pending at the time of this note.
- No Firebase Console settings, Firestore rules, Cloudflare resources/secrets/deployments, D1 database, production data, or Supabase services were changed.


### Build verification follow-up — Firebase BOM Gradle DSL correction

- First Android compile run `43387942928` failed during Gradle script configuration before Kotlin source compilation. The reported error was pre-existing at `composeApp/build.gradle.kts:455`: `platform` was unresolved inside the Kotlin Multiplatform Android source-set dependency handler.
- Corrected the existing BOM declaration to `implementation(project.dependencies.platform(libs.firebase.bom))`, preserving the same Firebase BOM alignment intent.
- A second compile run `43388218215` was queued from the fix commit; its result is pending.
- This first failure does not indicate a Firebase Auth source compilation failure because compilation never began.


### Firebase Auth SDK API correction — 2026-11-13
- Android build run `43388218215` completed with failure during Kotlin compilation (not Gradle configuration).
- Exact compiler errors in `FirebaseAuthGateway.kt`: `Firebase.apps()` and `Firebase.initialize()` were unresolved, and `getIdToken(...).token` referenced a nonexistent `token` property.
- Verified the repository's declared GitLive Firebase SDK version `2.8.0` against its tagged public API source. `FirebaseUser.getIdToken(forceRefresh)` already returns `String?`; Android default Firebase initialization is handled by FirebaseInitProvider when the Google Services plugin/configuration is present, while iOS startup calls `FirebaseApp.configure()`.
- Corrected the gateway to use the already-initialized `Firebase.auth` instance and return `getIdToken(forceRefresh)` directly. Change committed as `6cf909beab6bcf7301614f6cfc9d6784e2116d60`.
- A new Android compile workflow is expected from this source change; no successful build is claimed until that run completes.
- Active Supabase auth remains unchanged; no Cloudflare/Firebase production resources or data were changed.


## 2026-11-13 — Firebase Auth test automation added
- Updated `.github/workflows/watchathome-firebase-auth-check.yml` to run `:composeApp:testAndroidHostTest` before the Android Play Store debug compilation.
- CI run `43399716638` is currently in progress; the unit-test outcome and subsequent app compilation are not yet verified.
- No production Firebase, Supabase, Cloudflare, D1, secrets, or deployment settings were changed. Active app authentication remains Supabase.


## 2026-11-13 — Isolate Firebase Auth CI test suite
- CI run `43399716638` executed 2,052 Android host tests; 2 unrelated existing tests failed (`AndroidDownloadLifecycleTest` and `WatchProgressIdentityTest`). The staged Firebase Auth test class was not among the reported failures.
- Updated the Firebase Auth workflow to filter the test task to `com.nuvio.app.core.auth.FirebaseAuthSessionManagerTest`, preventing unrelated project test failures from blocking this focused check.
- New workflow commit: `9a89838d131cf1427e2ea5816db276ce9ce739ef`. Awaiting its CI result; do not mark the suite passed until verified.


## 2026-11-13 — Generic JSON secret-field guard
- Added `premium-worker/src/json-security.ts` to recursively reject secret-bearing keys in generic JSON payloads while preserving unknown non-sensitive fields.
- Applied the guard to profile-settings and collection writes. Sensitive keys include passwords, secrets, tokens, credentials, API keys, authorization/bearer fields, PIN values/hashes, and the known AnimeSkip client ID credential.
- Added regression tests proving nested credential fields are rejected and non-sensitive future settings fields still round-trip.
- Worker CI runs `43401267225`, `43401273786`, `43401294134`, and `43401302072` were triggered by sequential commits; final result for the latest commit is pending.
- No D1 binding/schema deployment, secrets, production data, app adapter switch, or Supabase change was made.


## 2026-11-13 — Generic JSON guard verified
- Worker CI run `43401302072` passed TypeScript compilation and all 63 tests across schema, account/device, HTTP/auth, crypto, credentials, PIN, rate limiting, profile/settings, and profile-sync suites.
- The new nested-secret rejection tests passed; safe unknown settings fields continue to round-trip.
- This is local SQLite/mock Worker verification only. No live D1, Firebase, Firestore, or Cloudflare deployment integration was tested.


## 2026-11-13 — Home catalog settings API implementation
- Added D1-backed `GET/PUT /v1/profiles/:profileIndex/home-catalog?platform=home_catalog_shared` in the Worker. The route verifies the Firebase caller, requires an owned active profile, rate-limits access, validates bounded JSON, rejects nested sensitive keys, and stores a versioned settings blob in the existing `home_catalog_settings` table.
- Added SQLite-backed tests for full JSON round-trip (including future fields), per-user/profile/platform isolation, empty snapshot replacement, malformed payloads, invalid platform, body size limit, and nested secret rejection.
- Worker CI runs `43401753132` passed the API module addition before route wiring; route wiring run `43401792563` and final test run `43401818613` were queued/in progress at documentation time. Verify the final run before marking this endpoint passed.
- Existing mobile `HomeCatalogSettingsSyncService` remains on Supabase. No mobile adapter switch or production D1 deployment was made.


## 2026-11-13 — Home catalog test fixture correction
- First full Worker run `43401818613` passed TypeScript and all preceding suites but exposed a fixture setup error in the new home-catalog round-trip test: the test attempted to seed the same account row twice while adding a second profile. The implementation itself compiled; the second malformed-payload test passed.
- Corrected the fixture to create the second profile under the existing account. New CI run `43401962345` is queued; wait for its result before marking the home-catalog test suite verified.


## 2026-11-13 — Home catalog API verified
- Follow-up Worker CI run `43401962345` completed successfully. TypeScript compilation passed and all 65 tests across 10 suites passed (0 failures).
- The home-catalog suite now passes 11 tests, including the new round-trip/profile-platform isolation test and malformed/oversized/sensitive payload rejection.
- `GET/PUT /v1/profiles/:profileIndex/home-catalog?platform=home_catalog_shared` is source-implemented and locally/mock verified. It is not deployed; the app remains on Supabase for this sync resource.


## 2026-11-13 — Staged Firebase Auth CI fully passed
- Focused workflow run `43400761852` completed successfully. The `FirebaseAuthSessionManagerTest` Gradle task passed, followed by successful Android Play Store debug compilation (`BUILD SUCCESSFUL`).
- The six staged Firebase Auth session-manager tests are now verified in CI; Android source compiles with the staged integration.
- This does not verify live Firebase project configuration, actual Firebase registration/login against production, or app UI wiring. Active `AuthRepository` and Supabase login remain unchanged.


## 2026-11-13 — Device registry revocation endpoint staged
- Added `DELETE /v1/devices/:installationId`, deriving UID from verified Firebase token, requiring an active account, applying per-account/IP rate limiting, and setting `revoked_at` only on the caller's matching active registry row.
- Added data-access and Worker HTTP tests for idempotence, owner isolation, hidden revoked inventory, and unrelated account preservation.
- Initial CI runs exposed two implementation/test issues: an over-escaped route regex and an over-escaped whitespace validator. Both were corrected. Latest verification run `43402508386` queued; do not mark passed until completed.
- Important limitation: this only revokes the device inventory record. It does not revoke Firebase refresh tokens or remotely sign out a running app; no such claim is made.


## 2026-11-13 — Device registry revoke route verified
- Worker CI run `43402508386` passed TypeScript and all 67 tests across 10 suites (0 failures).
- The data-access suite now has 7 passing tests and the HTTP/auth suite has 12 passing tests, including owner-scoped device DELETE behavior.
- The endpoint only updates the D1 device registry and hides revoked rows; it does not invalidate Firebase refresh tokens or remotely log out the device.


## 2026-11-13 — Device registry revocation API verified
- Added owner-scoped `DELETE /v1/devices/:installationId` to revoke a device installation. The Worker derives the owner exclusively from the verified Firebase ID token, checks active account status, applies a route-specific rate limit, validates the installation ID, and soft-revokes the matching device row. Repeated revocation is idempotent and returns `{ revoked: false }` when no active owned row matches.
- Added unit and HTTP tests for owner isolation, idempotence, revoked-device exclusion from inventory, and attempted cross-account revocation.
- Final Worker CI run `43402508386` passed TypeScript and 67 tests across 10 suites (0 failures), including 12 authenticated HTTP/Firebase tests and 7 account/device module tests.
- This is source and local SQLite/mock verification only. No D1 resource, production Worker deployment, mobile device-management UI, or active auth migration was performed.


## 2026-11-13 — D1 library snapshot and delta API staged

- Added premium-worker/src/library-sync-api.ts with profile-scoped D1 library snapshot paging, delta cursor lookup, delta event paging, upsert requests, and delete-by-key tombstones.
- Added authenticated Worker routes:
  - GET /v1/profiles/:profileIndex/library?limit=&offset= — active library snapshot page.
  - PUT /v1/profiles/:profileIndex/library — upsert up to 500 serialized library items.
  - GET /v1/profiles/:profileIndex/library/cursor — current library event cursor.
  - GET /v1/profiles/:profileIndex/library/delta?since=&limit= — ordered upsert/delete events.
  - POST /v1/profiles/:profileIndex/library/delete — tombstone selected content keys.
- Contract follows the actual LibrarySyncAdapter serializer: content_id, content_type, name/artwork/description metadata, release info, rating, genres, add-on base URL, and saved timestamp. Stable keys use lowercased content type plus content ID, matching libraryItemKey.
- Upserts and deletes append sync_events rows for cursor-based reconciliation; deletes preserve tombstones and are idempotent. p_origin_client_id is preserved in event metadata.
- Added local SQLite tests for pagination, cursor progression, upsert/delete event payloads, duplicate/malformed/oversized requests, plus Worker HTTP tests for authenticated route access and profile ownership.
- Worker CI run 43405997252 passed TypeScript compilation and all 70 tests across 10 suites (0 failures).
- This is Worker source and local SQLite/mock verification only. LibraryRepository still uses SupabaseLibrarySyncAdapter; no mobile adapter switch, live D1 provisioning, production deployment, or Supabase data change occurred.
- Before production use: reconcile snapshot/delta behavior with real multi-device traffic, add/verify sync-event retention cleanup and live D1 integration, and implement the mobile adapter behind the existing LibrarySyncAdapter interface.


## 2026-11-13 — D1 watch-progress snapshot and delta API verified

- Added premium-worker/src/watch-progress-sync-api.ts for D1-backed watch-progress snapshot reads, event cursor/delta reads, batch upserts, and delete tombstones.
- Added authenticated profile routes:
  - GET /v1/profiles/:profileIndex/watch-progress?sinceLastWatched=&limit=
  - PUT /v1/profiles/:profileIndex/watch-progress
  - GET /v1/profiles/:profileIndex/watch-progress/cursor
  - GET /v1/profiles/:profileIndex/watch-progress/delta?since=&limit=
  - POST /v1/profiles/:profileIndex/watch-progress/delete
- Wire payload matches the existing SupabaseProgressSyncAdapter fields: content_id, content_type, video_id, season, episode, position, duration, last_watched, and progress_key. Stable progress_key is retained as the server identity.
- Upserts and deletes append resource-specific sync_events. Delete operations soft-delete records and emit tombstones; origin client metadata is preserved.
- Added local SQLite tests for snapshot filters, delta/cursor progression, upsert/delete behavior, invalid/duplicate keys, negative values, batch limits, and HTTP auth/profile ownership.
- Worker CI runs 43411619931 and 43411656192 passed TypeScript and the full Worker suite. Final run 43411656192: 73 tests across 10 suites, 0 failures.
- This is Worker source and local SQLite/mock verification only. SupabaseProgressSyncAdapter remains active; no mobile adapter switch, live D1 provisioning, deployment, or production data change occurred.
- Remaining: compare behavior against the legacy Supabase RPC contract using production-safe fixtures, implement mobile Worker adapter and merge parity tests, address timestamp pagination tie cases, add sync-event retention, and complete live D1 validation before cutover.


## 2026-11-13 — Staged Cloudflare mobile LibrarySyncAdapter added

- Added `CloudflareLibrarySyncAdapter` as a separate implementation of the existing `LibrarySyncAdapter` interface. It covers snapshot pagination, delta cursor, delta reads, batched upserts, and delete tombstones using the already-tested Worker route contract.
- Firebase ID tokens are retrieved through the staged `FirebaseAuthRepository` and sent as Bearer authorization. Requests use the existing multiplatform Ktor HTTP client and bounded response-body reader.
- Added optional `CLOUDFLARE_WORKER_BASE_URL` runtime configuration from local.properties or environment. It defaults to blank; no endpoint was guessed or committed.
- Mutation batches are split by encoded body size below the Worker 256 KiB limit; the mobile adapter caps each request at 192 KiB.
- Added MockEngine tests for bearer token/route, snapshot field mapping, HTTP error handling, and missing-token behavior. Android CI run 43413914695 was started; final result pending at this entry.
- Safety: `LibraryRepository.syncAdapter` remains `SupabaseLibrarySyncAdapter`. No active auth switch, live D1, Worker deployment, production data, or Supabase removal occurred.
- Remaining before mobile cutover: verify CI, complete parity and delta-merge tests, configure the real Worker URL only after endpoint confirmation, and test against a provisioned D1-backed Worker.


## 2026-11-13 — Watch-progress mobile adapter staged; snapshot paging hardened

- Added `CloudflareProgressSyncAdapter.kt` as a separate implementation of the existing `ProgressSyncAdapter` contract: snapshot pull, delta cursor/read, upsert, and delete tombstones.
- Snapshot reads use deterministic `last_watched_at, progress_key` ordering with bounded offset pages. The Worker snapshot route now accepts validated `offset` while preserving the existing `sinceLastWatched` filter.
- Added a Worker regression assertion for offset paging. Worker CI run 43414785430 passed TypeScript and all Worker tests (result: success).
- Added four MockEngine tests for Firebase Bearer auth, snapshot field mapping, delta delete mapping, and missing-token behavior. Android CI run 43414877340 pending.
- Active `WatchProgressRepository.syncAdapter` remains `SupabaseProgressSyncAdapter`; no auth switch, production Worker URL, live D1, deployment, or production data changes.
- Before cutover: complete Android CI, add mutation payload/route tests, verify merge behavior and timestamp/filter semantics against production-safe fixtures, and test live D1-backed Worker.


## 2026-11-13 — Progress adapter mutation tests and HTTP paging verification

- Added progress adapter test assertions for PUT upsert and POST delete route/method selection.
- Added authenticated Worker HTTP coverage for snapshot offset requests. Worker CI run 43415195896 passed.
- Android run 43414877340 was cancelled by a subsequent branch push; replacement run 43415270909 is queued. Do not treat the mobile adapter as CI-verified until the replacement completes successfully.

## 2026-11-13 — Library and watch-progress adapters connected behind a disabled-by-default gate

- Generated CloudflareWorkerConfig.SYNC_ENABLED from CLOUDFLARE_SYNC_ENABLED; default is false.
- Wired both repositories to choose the existing Cloudflare adapter only when explicitly enabled and an HTTPS Worker base URL is configured.
- Default behavior remains on Supabase, so no account/data cutover occurs from this commit.
- Do not enable until Firebase auth is active in the mobile app, production D1 schema is applied, Worker deployment/bindings/secrets are verified, and live integration/parity tests pass.
- No production resources, data, credentials, or deployments changed. Android CI must be rerun because run 43415270909 was cancelled before the APK compile step.

- Fresh Android CI run 43416885505 was triggered by the final adapter/config source commit and is currently queued; do not mark the mobile wiring build-verified until this run completes successfully.

- CI follow-up: run 43416885505 has moved from queued to in progress. The focused Firebase/Auth + Cloudflare adapter host-test step is currently running; Android Play Store debug compilation is pending. No pass is claimed yet.
