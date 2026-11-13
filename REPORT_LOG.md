# WatchAtHomeV2 Report Log

Append-only engineering activity log. Do not remove or rewrite earlier entries.
Repository: `bugoyweak7/WatchAtHomeV2`
Working branch: `setup/firebase-cloudflare-zero-cost`
Timezone: Asia/Manila

## 2026-11-13 — Staged Firebase email/password authentication foundation

### Objective
Begin Firebase Authentication work without breaking active Supabase-backed application features.

### Source files added
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/FirebaseAuthGateway.kt`
  - Multiplatform adapter over the existing GitLive Firebase Auth 2.8.0 dependency.
  - Email/password account creation and sign-in.
  - Auth-state observation and sign-out.
  - Fresh Firebase ID-token retrieval for future Cloudflare Worker requests.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/FirebaseAuthSessionManager.kt`
  - Separate staged session manager and `FirebaseAuthRepository` API.
  - Maps registered Firebase accounts to the existing shared AuthState model.
  - Rejects and signs out anonymous Firebase sessions.
  - Does not erase local account data.
- `composeApp/src/commonTest/kotlin/com/nuvio/app/core/auth/FirebaseAuthSessionManagerTest.kt`
  - Six tests with a fake gateway: restore session, reject anonymous account, register/sign in, validate inputs, retrieve fresh ID token, and sign out.

### CI added
- `.github/workflows/watchathome-firebase-auth-check.yml`
- Runs an Android Play Store debug compile when the staged auth source/build inputs change.
- Run ID: `43387942928`.
- Initial observed state: `in_progress`; final result pending. Do not treat this as a passing build yet.

### Migration safety decisions
- Did not replace the active `AuthRepository` or change `AuthScreen`.
- Did not remove the existing anonymous/local UUID UI path yet; removal must happen as part of the coordinated auth cutover.
- Did not connect account bootstrap because the current Worker route requires D1, while `premium-worker/wrangler.toml` has no D1 binding and the schema remains draft-only.
- Kept all Supabase adapters and dependencies.
- This staged layer is not yet used by the app UI and does not constitute a completed authentication migration.

### Verification and limits
- GitLive Firebase Auth 2.8.0 and Android Firebase Auth dependencies were already declared before this change.
- Android Firebase configuration and iOS GoogleService-Info.plist already exist in the repository.
- Six common tests are added but not yet CI-executed.
- No live Firebase Auth provider settings, Firestore rules, Cloudflare resources, D1 database/binding, secrets, deployments, Supabase data, or production user data were changed.

### Commit references
- Gateway: `300b4381b1d56a8b7929265aae0e42acff45cfea`
- Session manager: `1a8d8d9a16b16a6c7861f5b3ff8044478990d1f3`
- Tests: `ae672a57c6283b9faa53570dc74350dd50411356`
- CI workflow: `afccedb4cb2d3503259cc5a9b4fc84c15ffca88e`

### Next gates
1. Confirm Android compile workflow result and resolve any compiler errors.
2. Add/run the common auth tests in CI.
3. Complete D1 provisioning/schema approval and verify Worker account bootstrap readiness before enabling registration flow.
4. Migrate profile/data APIs, device-link and account deletion before wiring Firebase into the active auth UI.


## 2026-11-13 — Android compile check failure and Gradle correction

- First Firebase Auth build workflow run `43387942928` failed at Gradle script configuration, before Kotlin compilation or test execution.
- Exact failure: `composeApp/build.gradle.kts:455` reported `Unresolved reference 'platform'` for the pre-existing `implementation(platform(libs.firebase.bom))` declaration inside the Android source-set dependency handler.
- Updated that declaration to `implementation(project.dependencies.platform(libs.firebase.bom))`. This preserves the intended Firebase BOM dependency alignment and uses the project-level Gradle DependencyHandler explicitly.
- New validation run `43388218215` was queued by commit `4db2c6c59448e039c4cf36cad718f79a01bdafd9`; status pending.
- The first failure is a build-script configuration issue and is not evidence that the new Kotlin Firebase Auth source compiles or fails.
- Verified iOS Firebase initialization/linking from source: Swift app startup calls `FirebaseApp.configure()`; Xcode project references FirebaseCore, FirebaseAuth and FirebaseFirestore; `GoogleService-Info.plist` is present.


### Firebase Auth SDK API correction — 2026-11-13
- Re-read actual CI logs for run `43388218215`; build failed at Kotlin compilation with three exact errors in `FirebaseAuthGateway.kt`: unresolved `Firebase.apps`, unresolved `Firebase.initialize`, and unresolved `.token` after `getIdToken`.
- Checked GitLive Firebase Kotlin SDK tag `v2.8.0` source: `FirebaseUser.getIdToken(forceRefresh)` directly returns `String?`. Its common API declares `Firebase.apps(context)` and `Firebase.initialize(context)`, while Android default-app initialization is automatically handled by FirebaseInitProvider with Google Services configuration. This app already invokes `FirebaseApp.configure()` in iOS startup.
- Removed the invalid no-context initialization block and corrected token retrieval. Commit: `6cf909beab6bcf7301614f6cfc9d6784e2116d60`.
- Validation is pending on the commit-triggered workflow. No production services or user data were modified.


## 2026-11-13 — Firebase Auth unit-test CI integration
- Change: workflow now executes `:composeApp:testAndroidHostTest` before Android Play Store debug compilation.
- Commit: `4629adb63172064bf29c546e178cf8f2c0f57f1b`.
- CI: [run 43399716638](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43399716638) was in progress when recorded; results remain pending.
- Scope guard: active Supabase authentication and app UI were not changed; no production cloud resources or credentials were touched.


## 2026-11-13 — Isolated Firebase Auth tests in CI
- Initial CI run [43399716638](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43399716638) ran 2,052 Android host tests and failed only on two unrelated existing tests: `AndroidDownloadLifecycleTest` and `WatchProgressIdentityTest`.
- Adjusted `.github/workflows/watchathome-firebase-auth-check.yml` to filter execution to `com.nuvio.app.core.auth.FirebaseAuthSessionManagerTest`.
- Commit: `9a89838d131cf1427e2ea5816db276ce9ce739ef`. Focused run has not yet been verified.
- No app authentication/UI, Supabase, Firebase production configuration, or Cloudflare resources changed.


## 2026-11-13 — Generic JSON secret-field protection
- Added `premium-worker/src/json-security.ts`; integrated it into profile settings and collections write paths.
- Added regression tests for nested API-key/access-token rejection and preservation of safe future fields.
- Worker CI [run 43401302072](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401302072) was in progress at the time of recording.
- No production resources, secrets, D1 schema, user data, or mobile adapters changed.


## 2026-11-13 — Generic JSON security guard verified
- [Worker CI run 43401302072](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401302072) completed successfully: TypeScript compilation passed and 63 tests passed with 0 failures.
- Includes nested sensitive-key rejection tests for profile settings and collections, while retaining safe unknown-field compatibility.
- Verification uses local SQLite and mocked Worker/Firebase auth; no live D1/Cloudflare/Firebase integration or deployment was performed.


## 2026-11-13 — Home catalog settings API
- Added `GET/PUT /v1/profiles/:profileIndex/home-catalog?platform=home_catalog_shared` with verified UID ownership, profile ownership, rate limiting, bounded JSON, versioned writes and sensitive-field rejection.
- Added SQLite tests for JSON round-trip, profile/user/platform isolation, empty replacement, malformed/oversized payloads and nested secret rejection.
- CI runs: module addition `43401753132` passed; route wiring `43401792563` and final test addition `43401818613` were pending at the time of this entry.
- No app client migration, live D1, Cloudflare secrets or production deployment.


## 2026-11-13 — Home catalog CI test fixture correction
- Worker CI [run 43401818613](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401818613) failed in the new round-trip test fixture due to duplicate account seeding for the second profile; TypeScript and other test suites passed.
- Fixed the fixture by inserting the second profile row under the already-seeded account. Verification run [43401962345](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401962345) queued.


## 2026-11-13 — Home catalog API verification
- [Worker CI run 43401962345](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43401962345) succeeded: TypeScript compilation passed and 65 tests passed across 10 suites with zero failures.
- New home catalog endpoint and its 11 tests are included in the passing profile sync suite.
- Endpoint remains source-only; mobile home catalog sync remains on Supabase until all migration gates and deployment approvals are satisfied.


## 2026-11-13 — Firebase Auth tests and Android build passed
- [Workflow run 43400761852](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43400761852) completed successfully: focused `FirebaseAuthSessionManagerTest` task passed and Android Play Store debug compilation returned `BUILD SUCCESSFUL`.
- Six staged Firebase Auth session-manager test cases are now verified by the focused suite. This is compile/unit-test validation only; live Firebase auth and UI wiring remain untested and inactive.


## 2026-11-13 — Device registry revoke API
- Added `DELETE /v1/devices/:installationId` with verified UID ownership, active account requirement, rate limiting and idempotent `revoked_at` update.
- Added SQLite data-access test and Worker HTTP test for cross-account isolation.
- Initial CI failures revealed an over-escaped route matcher and whitespace regex; both corrected. [Final run 43402508386](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43402508386) pending.
- Scope is registry inventory only; Firebase refresh-token revocation/remote logout is not implemented.


## 2026-11-13 — Device registry revoke route verification
- [Worker CI run 43402508386](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43402508386) completed successfully: TypeScript passed and 67 tests passed across 10 suites with zero failures.
- Includes the new data-access and Worker HTTP tests for owner-scoped, idempotent device registry revocation.
- Scope remains registry inventory only, not remote logout/session invalidation. No production D1 or Worker deployment.


## 2026-11-13 — Device registry revocation implementation and CI
- Added `DELETE /v1/devices/:installationId`; verified Firebase UID controls ownership, active account is required, route is rate-limited, revoked records are hidden from active device inventory, and repeated/cross-owner requests do not revoke another user's installation.
- Added account-device module and HTTP authentication regression tests.
- [Worker CI run 43402508386](https://github.com/bugoyweak7/WatchAtHomeV2/actions/runs/43402508386) passed TypeScript and 67 tests across 10 suites, 0 failures.
- Local/mock validation only; no live D1 or Worker deployment.


## 2026-11-13 — D1 library snapshot and delta API

### Objective
Implement the Worker-side replacement contract for the existing LibrarySyncAdapter without switching the app away from Supabase.

### Source changes
- Added premium-worker/src/library-sync-api.ts.
- Added profile-scoped snapshot pagination and a library-specific delta cursor/event stream using library_items and sync_events.
- Added item upsert and delete-by-key operations. Deletes are represented as tombstones and emit delete events; repeated deletes do not create duplicate events.
- Preserved p_origin_client_id on sync events and the exact fields emitted by LibraryItem.toSyncItem().
- Added authenticated Worker dispatch for snapshot, push, cursor, delta, and delete operations.

### Tests and verification
- Added SQLite tests for snapshot paging, cursor progression, upsert/delete event payloads, validation, duplicate keys, and bounded batch size.
- Added Worker HTTP tests for authenticated writes/reads and cross-account profile denial.
- CI run 43405997252 passed TypeScript compilation and all 70 tests across 10 suites (0 failures).

### Scope and limitations
- The app's LibraryRepository.syncAdapter still points to SupabaseLibrarySyncAdapter; no mobile adapter cutover occurred.
- D1 schema remains draft-only; no live database, binding, secret, deployment, or production data was changed.
- Before cutover, implement and test the Worker HTTP client adapter, confirm cursor/snapshot behavior under concurrent multi-device mutations, add event-retention cleanup, and verify against live D1.


## 2026-11-13 — D1 watch-progress snapshot and delta API

### Objective
Implement the Worker-side replacement contract for the existing ProgressSyncAdapter while leaving active Supabase sync unchanged.

### Source changes
- Added premium-worker/src/watch-progress-sync-api.ts.
- Added profile-scoped snapshot, cursor, delta, batch upsert and delete-tombstone operations using the existing watch_progress and sync_events draft tables.
- Preserved the legacy wire fields and stable progress_key identity, including season/episode pairing validation and p_origin_client_id event metadata.
- Added authenticated Worker routes for snapshot, push, cursor, delta and delete.

### Tests and verification
- Added SQLite tests for snapshot filters, cursor progression, event payloads, upsert/delete behavior, duplicate/malformed identities, negative values and bounded batch size.
- Added HTTP tests for Firebase token authentication, profile ownership, snapshot and delta retrieval.
- Final Worker CI run 43411656192 passed TypeScript compilation and 73 tests across 10 suites with 0 failures.

### Scope and limitations
- SupabaseProgressSyncAdapter remains the active mobile implementation.
- No D1 database/binding, production Worker deployment, Firebase production settings or user data were changed.
- Before client cutover, compare all fields and ordering with the existing Supabase RPC implementation, implement Worker HTTP adapter, validate timestamp pagination edge cases and concurrent updates, and add sync-event retention cleanup.


## 2026-11-13 — Staged mobile Cloudflare library adapter

### Objective
Implement the mobile side of the Worker library sync contract while preserving the active Supabase path.

### Source changes
- Added `composeApp/src/commonMain/kotlin/com/nuvio/app/features/library/sync/CloudflareLibrarySyncAdapter.kt`.
- Implements snapshot pagination, delta cursor/read, item upsert, and delete operations against the Worker routes.
- Uses FirebaseAuthRepository fresh ID-token retrieval and the existing multiplatform Ktor client.
- Enforces HTTPS Worker base URL, requires a Firebase token, caps response reads, and splits mutation batches by encoded request size.
- Added optional `CLOUDFLARE_WORKER_BASE_URL` generated runtime config. No real URL was supplied or assumed.
- Added four MockEngine tests and expanded the Android test workflow to include them.

### Verification
- Android workflow run 43413914695 started on the adapter/test commit; final result pending at the time of this entry.
- Previous Worker-side route verification remains run 43405997252 (70 tests, 0 failures).

### Scope and limitations
- `LibraryRepository.syncAdapter` still points to `SupabaseLibrarySyncAdapter`.
- No active auth cutover, production Worker URL, D1 provisioning/binding/schema application, deployment, or production data change.
- Next gates: CI pass, verify delta/delete merge semantics against local sync-state behavior, test live D1-backed Worker once provisioned, and only then consider wiring behind an explicit rollout gate.


## 2026-11-13 — Staged mobile Cloudflare watch-progress adapter

### Objective
Implement the mobile HTTP client for the already-staged D1 watch-progress routes without switching the active repository.

### Source changes
- Added `composeApp/src/commonMain/kotlin/com/nuvio/app/features/watching/sync/CloudflareProgressSyncAdapter.kt`.
- Implements snapshot, delta cursor, delta events, upserts and delete tombstones using Firebase ID-token Bearer auth.
- Snapshot requests page by deterministic offset. Worker snapshot query orders by `last_watched_at, progress_key` and validates offset; existing timestamp filtering remains available.
- Request payloads are size-batched below the Worker bound; response reads are capped. Worker URL uses the optional blank-by-default `CLOUDFLARE_WORKER_BASE_URL` config.
- Added four MockEngine tests and extended Android CI.

### Verification
- Worker pagination change CI run 43414785430 passed TypeScript and the Worker test suite.
- Android CI run 43414877340 pending at the time of this entry.

### Scope and limitations
- `WatchProgressRepository.syncAdapter` still points to `SupabaseProgressSyncAdapter`.
- No live D1 provisioning, production Worker URL, deployment, auth cutover or production data change.
- Next gates: Android CI pass, mutation request assertions, live D1 verification, and merge/conflict behavior validation.


### Follow-up verification note — 2026-11-13
- Added an authenticated Worker HTTP test for the offset snapshot query; run 43415195896 passed.
- Added client test coverage for progress PUT and POST route/methods.
- Android run 43414877340 was cancelled by the subsequent test commit; latest replacement run 43415270909 is queued. Mobile adapter verification remains pending.

### Guarded mobile sync adapter wiring — 2026-11-13

- Added generated CloudflareWorkerConfig.SYNC_ENABLED, sourced from CLOUDFLARE_SYNC_ENABLED and defaulting to false.
- LibraryRepository.syncAdapter and WatchProgressRepository.syncAdapter now select the Cloudflare implementations only when the explicit flag is true and CLOUDFLARE_WORKER_BASE_URL begins with HTTPS.
- With the default build configuration, both repositories continue using their existing Supabase adapters.
- The Cloudflare selection path requires an authenticated Firebase user and a provisioned/deployed D1-backed Worker. Those prerequisites are not yet verified; do not enable the flag in production yet.
- Previous Android workflow 43415270909 was cancelled before app compilation; its focused Firebase Auth test step passed. Fresh CI verification is pending.

- Fresh Android CI run 43416885505 was triggered by the final adapter/config source commit and is currently queued; do not mark the mobile wiring build-verified until this run completes successfully.
