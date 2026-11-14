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


## 2026-11-13 — Active authentication dependency audit

- Confirmed the active app still initializes and observes Supabase `AuthRepository`; the login UI calls its sign-up/sign-in methods. FirebaseAuthRepository is staged, not active.
- Supabase identity is consumed by profile RPCs (sync, deletion, PIN and lock operations), device-link session RPCs/exchange function, device registration, membership access/overview RPCs, and account deletion function.
- Firebase-only login cannot safely be enabled until these APIs accept and validate the new identity and existing account/data ownership is preserved.
- No code or production configuration changed during this read-only audit. Existing Supabase login remains active; Cloudflare sync remains disabled by default.
- Android CI 43416885505 was still running: auth/adapter tests in progress; Play Store debug compile pending.


## 2026-11-13 — Backend migration audit and CI confirmation

- Android CI run `43416885505` is now successful, including Firebase Auth session-manager unit tests and Android Play Store debug compilation.
- The Cloudflare Worker source already has Firebase password-token verification and partial Firebase-authenticated account/profile/library/watch-progress APIs. Its token verifier currently rejects non-password providers.
- The Worker router does not yet implement the Firebase device-link session flow needed to replace the app's current Supabase TV pairing RPCs and `tv-logins-exchange` function.
- D1 account schema is still draft-only and no D1 binding is present in `wrangler.toml`; no live D1 deployment is verified.
- The scanned app repository does not contain the legacy Supabase SQL migrations, RLS policies, or Edge Function source. These are required to preserve legacy account identity and authorization correctly.
- No app source or production settings changed. Supabase remains active and Cloudflare sync remains disabled by default.


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


## 2026-11-13 — Profile metadata migration progress

- Added staged mobile Cloudflare profile metadata adapter for profile snapshot retrieval, batch save, and delete.
- Added tests and Android CI workflow coverage.
- Current active app profile operations remain Supabase-backed; adapter is not wired into `ProfileRepository`.
- Remaining blockers before cutover: Firebase must become the active app auth session, all Supabase-dependent profile/PIN/settings/device/account operations need replacements, and live Worker+D1 must be provisioned and tested. No cutover or live resource changes occurred.


## 2026-11-13 — Profile settings migration progress

- Added a staged Cloudflare profile-settings HTTP adapter with Firebase bearer auth and unknown-field-preserving JSON payload handling.
- Added tests and CI workflow coverage. Active profile settings sync remains Supabase-backed and the adapter is not wired into the app.
- No live D1/Worker provisioning, deployment, secrets, or production data migration occurred.


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


## 2026-11-13 — Premium-code generation integration status

- Admin APK login: user-tested successfully.
- Admin Premium screen: user observed HTTP 404 when the app attempted the premium service request.
- Admin source request path, configured Worker base URL, Worker source route, and Wrangler Worker name have been rechecked and are internally consistent.
- Premium code generation remains blocked pending confirmation of the deployed Cloudflare Worker hostname/version and successful unauthenticated `/health` response.
- No code was generated; no Cloudflare deployment/settings/secrets or Firebase/Firestore production data were changed.


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


## 2026-11-14 — Preview Firebase Android configuration
- `androidApp/src/debug/google-services.json` now identifies Firebase project `watchathome-preview` and includes registrations for `com.nuvio.app`, `com.nuviodebug.com`, and `com.tapframe.watchathomeadmin`.
- The Gradle debug variant application ID is `com.nuviodebug.com`; this package is registered in the Preview configuration.
- The root `androidApp/google-services.json` remains on Production project `watchathome-admin` and was not modified.
- Active app authentication remains Supabase-backed. No Firebase auth cutover or account bootstrap was performed.


## 2026-11-14 — TV device-link client integration gate
- Worker Preview pairing backend is verified, and the Worker verifier accepts custom Firebase tokens carrying `tv_linked=true`.
- User App active identity remains Supabase. Its device-link and device registration clients also remain Supabase-backed; FirebaseAuthRepository is staged and not wired into the app runtime.
- Firebase-only TV login cannot safely activate the current app because existing profile/data/sync features still require Supabase sessions. Mobile approval additionally requires a verified Firebase-to-app-account identity design.
- No separate Android TV target was found in the authorized User App repository. No runtime code or tests were changed in this gate.
- Full source evidence and next gate are in `WATCHATHOME_MASTER_HANDOVER.md`. Supabase remains active; no Production or cloud changes.

## 2026-11-14 — Firebase/Supabase identity migration design
- Identity migration design completed and appended to `WATCHATHOME_MASTER_HANDOVER.md`.
- Decision: explicit dual-session proof and one-to-one persistent mapping; no email-only auto-linking; keep Supabase active during incremental feature migration.
- No runtime source, D1 schema/data, cloud settings/secrets, deployments, or production resources changed.



## 2026-11-14 — Identity-link backend implementation status

- Premium Worker setup branch now includes the source-only additive D1 identity-link migration and dual-session link endpoint.
- Mapping is one-to-one, insert-only, idempotent for the exact pair, and rejects either-side reassignment. Tests cover schema constraints, success/retry, conflicts, stale auth, and missing bootstrap.
- Latest CI run was pending at the time of this entry; see `WATCHATHOME_MASTER_HANDOVER.md` for commit references and exact scope.
- Preview D1 schema has not been upgraded and Worker has not been redeployed. User App login remains Supabase-backed; Production and Supabase services/data are unchanged.


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


## 2026-11-14 — Preview Firebase login entry point (implementation committed; validation pending)

- The Firebase verification/bootstrap card was previously behind Settings, which could not be reached while AppGate required the active Supabase session. Added a Preview-only entry point directly to the login screen.
- The dialog reuses the existing Firebase account UI for email/password sign-up or sign-in, email verification, and the user-initiated Cloudflare bootstrap.
- Build-time gate: generated PreviewFirebaseAccessConfig.ENABLED, default false; only .github/workflows/watchathome-preview-apk.yml sets WATCHATHOME_PREVIEW_FIREBASE_ACCESS=true.
- Existing Supabase login and active data repositories are untouched. The Preview Worker URL remains workflow-configured.
- Commits: 7a12abc0cd98e72b799ae33f5577db32f3b5d50d, de876999f8b233fca1d18eba79e899cff0536c26, 63d50a99d43aca3a349482734bd89c2c42c2f276.
- No build or test result is claimed yet. A successful updated Preview workflow run is required before APK installation and device testing.


## 2026-11-15 — Preview Firebase trial status display

- Updated the Preview Firebase account flow to parse the trial details returned by the existing `/v1/account/bootstrap` response.
- The Preview tools now display whether the Cloudflare account is active, whether the 7-day trial is initialized, and the returned trial start and expiry timestamps.
- The existing bootstrap endpoint remains unchanged; its create-only trial initialization behavior is preserved. No new endpoint, polling, production deployment, cloud configuration, or Supabase cutover was performed.
- Pending verification: run Firebase Auth unit tests and Android Play Store debug compilation on the approved setup branch, then rebuild the Preview APK before installing this UI update.

 
## 2026-11-15 — Firebase Preview verified; active authentication remains Supabase

- Preview APK workflow `43617004862` completed successfully and uploaded artifact `watchathome-preview-playstore-debug-apk` (ID `14122798970`). User's on-device screenshot verifies Firebase email Verified, Cloudflare account Active, 7-day trial Initialized, and displayed start/expiry timestamps.
- Firebase Auth Build `43615293783` passed the Firebase session-manager tests and Android Play Store debug compilation.
- Read-only audit: normal login and app gate still use Supabase-backed `AuthRepository`; device-link flow and shared Supabase client also remain active. FirebaseAuthRepository is not wired into normal app authentication.
- Current decision: no active login cutover and no Supabase SDK removal. First strengthen/test Firebase repository/session lifecycle in isolation; migrate dependent account/data/device-link services before any active switch.
- No source or cloud changes in this status update.
- Required report status questions: What is happening? Are we building right now? Do you need to do anything? What is the next step?

 
## 2026-11-15 — Firebase session lifecycle tests added; CI pending

- Added regression coverage for Firebase auth observer lifecycle, state updates, and sign-out failure behavior in `FirebaseAuthSessionManagerTest.kt`.
- Commit: `bc9e56b634edaf39a16eafb2d278d82a1c92e6a7`.
- This is test-only. Active Supabase authentication, AppGate, account/data services, and cloud resources are unchanged.
- CI result is pending; do not treat the new tests as passed until GitHub Actions completes.
- What is happening? Lifecycle regression tests are committed.
- Are we building right now? Await CI status; no APK build is requested.
- Do you need to do anything? No.
- What is the next step? Verify Firebase Auth tests and Android compilation.
