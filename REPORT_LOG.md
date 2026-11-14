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

- CI follow-up: run 43416885505 has moved from queued to in progress. The focused Firebase/Auth + Cloudflare adapter host-test step is currently running; Android Play Store debug compilation is pending. No pass is claimed yet.


## 2026-11-13 — Authentication dependency audit (read-only)

### Findings
- Active email sign-up/sign-in, session initialization, anonymous access, sign-out and account deletion are owned by Supabase-backed `AuthRepository`; `AuthScreen` calls this repository and `AppGate` observes its state.
- `ProfileRepository` depends on Supabase RPCs for profile synchronization, profile deletion, PIN operations and profile-lock synchronization.
- Device linking depends on Supabase RPCs `start_device_login_session` and `poll_tv_login_session`, plus Edge Function `tv-logins-exchange` and Supabase session import. Device registration calls `register_current_device`.
- Membership access and membership overview use Supabase RPCs. Account deletion invokes `delete-account`.
- Firebase gateway/session manager exist but remain staged and are not wired into the active app flow.

### Decision / safety
- Do not connect Firebase as the only active provider until these identity-dependent APIs have a deliberate migration or trusted Firebase-to-backend identity bridge. A UI-only login switch would create authenticated-state/API mismatches and risk locking users out of profiles, device linking, membership, and account management.
- No source or production changes were made in this audit. Supabase remains active; Cloudflare sync flag remains false by default.
- Android CI run 43416885505 was still in progress at the latest check (unit tests running; Play Store debug compilation pending).

### Next work
- Map all Supabase-backed operations and their SQL/Edge Function authorization assumptions, then define one migration strategy that preserves existing account identity and user-owned data before implementation.


## 2026-11-13 — Backend identity and Worker route audit (read-only)

### CI result
- GitHub Actions run `43416885505` completed successfully. The Firebase Auth session-manager unit-test step and Android Play Store debug compilation both have `success` conclusions.

### Worker findings
- The in-repository `premium-worker/src/index.ts` verifies Firebase ID tokens against the configured Firebase project and currently requires `firebase.sign_in_provider == password`.
- Source includes Firebase-protected account bootstrap/device registration, profile, profile PIN, add-on/plugin/collection, library, watch-progress, premium, and trial routes. This confirms implementation in source only, not production deployment.
- No Firebase device-link start/poll/approve/exchange route is present in the Worker router. The active mobile pairing implementation remains coupled to Supabase RPCs and the `tv-logins-exchange` Edge Function.
- `premium-worker/schema/0001_account_data.draft.sql` is explicitly draft-only and `premium-worker/wrangler.toml` has no D1 binding. D1-backed account/profile sync is not live-verified.

### Migration blockers / decision
- No Supabase SQL migrations, RLS policy source, or Edge Function source were found in the scanned WatchAtHomeV2 repository tree. A trusted Supabase schema/function export is required to map legacy UID ownership and authorization accurately.
- Do not map accounts by email alone, create parallel Firebase/Supabase identities, switch the active login repository, or enable Cloudflare sync until an explicit verified identity-mapping and session/device-link design is implemented and tested.
- No source or production configuration changed in this audit. Supabase remains active; `CLOUDFLARE_SYNC_ENABLED` remains false.

### Next step
- Obtain/inspect the authorized Supabase schema, RLS policies, RPC definitions, and Edge Function contracts; then define a deterministic legacy-account linking process and a device-link compatibility plan before implementation.


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


## 2026-11-13 — Profile adapter implementation and verification plan

- Source scan confirmed Worker profile metadata endpoints already exist for listing, upserting, and deleting profiles, with D1 ownership checks and rate limits.
- Implemented a separate mobile HTTP adapter using the Worker endpoint shapes and Firebase ID-token bearer authentication. It enforces HTTPS, validates profile index/count constraints, and bounds response size.
- Added focused unit tests and CI workflow coverage. These tests verify client request construction; they do not prove live Firebase, Worker, or D1 connectivity.
- The existing app `ProfileRepository` still uses Supabase RPCs. No repository routing or login behavior was changed because `AuthRepository` is still Supabase-backed.
- CI status for the earlier Android run `43421702839` remained pending when checked. A later workflow run must verify the new profile adapter tests and Android build.


## 2026-11-13 — Profile settings adapter staging

- Verified the Worker profile-settings route contract and implemented a separate Kotlin adapter for the mobile settings blob.
- Added GET decode and PUT payload tests, including preservation of an unknown future settings key and rejection before network access when no Firebase token is available.
- Added the new adapter and test to the Android Play Store CI workflow.
- This remains client-contract test coverage only. The active `ProfileSettingsSync` still uses Supabase RPCs and must not switch until Firebase authentication and the Worker/D1 deployment are verified end to end.


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


## 2026-11-13 — Premium API 404 test report

- Test evidence: user screenshot from installed Admin APK shows `Premium service request failed (HTTP 404)` on the Premium page after successful Admin login.
- No code generation was initiated, so this test did not intentionally create premium-code records.
- Source audit confirms Admin calls `POST /v1/admin/premium-codes`; the current Worker source defines that exact method/path after Firebase token verification. Admin base URL and Wrangler Worker name are consistent in repository configuration.
- Root cause is not yet proven. Deployment mismatch, incorrect workers.dev account subdomain, or stale/different deployed script remain candidates. Do not label any one as confirmed.
- Live health request was blocked by environment DNS/network resolution. No live deployment or production mutation was performed.


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


## 2026-11-14 — Isolated Preview Firebase debug configuration

### Change
- Replaced `androidApp/src/debug/google-services.json` with the user-supplied Preview Firebase configuration (`watchathome-preview`).
- Included registered Android package IDs `com.nuvio.app`, `com.nuviodebug.com`, and `com.tapframe.watchathomeadmin`; the debug variant's application ID is `com.nuviodebug.com`.
- Left `androidApp/google-services.json` untouched; it remains configured for Production project `watchathome-admin`.

### Verification and limits
- Parsed the supplied JSON successfully and verified its project ID, project number, and three package registrations before writing.
- Re-fetched and checked the existing debug/root configurations and Gradle debug application ID before the change.
- No Gradle build was run. No auth flow, Supabase integration, app source, Worker, cloud resource, secret, or deployment was changed.
- Firebase Preview configuration alone does not enable Firebase account creation; the active app auth repository still uses Supabase.


## 2026-11-14 — Preview-only Firebase test access

### Change
- Added a Firebase Preview Test button to the unauthenticated login screen, visible only when generated PreviewFirebaseAccessConfig.ENABLED is true.
- The button opens a scrollable dialog containing the existing FirebaseAccountVerificationCard, including Firebase email/password auth, verification status refresh/resend, and verified-email-gated Cloudflare account initialization.
- Added WATCHATHOME_PREVIEW_FIREBASE_ACCESS as an explicit generated build setting. Its default is false; the Preview APK workflow sets it true in local.properties for that workflow run.
- Updated the existing manual Preview APK workflow only. It remains branch-restricted and uses the configured Preview Worker endpoint.

### Preserved behavior and boundaries
- AuthRepository, AppGate, active Supabase authentication, account identity, and existing data repositories were not changed.
- No Firebase Console settings, Firebase data, Cloudflare Worker deployment, D1/R2 resource, secret, Production endpoint, or Supabase project setting was changed.
- No local machine or OneDrive files were accessed.

### Validation
- GitHub commits were created on setup/firebase-cloudflare-zero-cost: 7a12abc0cd98e72b799ae33f5577db32f3b5d50d, de876999f8b233fca1d18eba79e899cff0536c26, and 63d50a99d43aca3a349482734bd89c2c42c2f276.
- The workflow has not yet been executed against these changes. Kotlin compilation, focused Firebase Auth tests, APK artifact creation, and runtime/device verification remain pending; do not report this implementation as build-verified.


## 2026-11-15 — Preview Firebase trial status display

- Updated the Preview Firebase account flow to parse the trial details returned by the existing `/v1/account/bootstrap` response.
- The Preview tools now display whether the Cloudflare account is active, whether the 7-day trial is initialized, and the returned trial start and expiry timestamps.
- The existing bootstrap endpoint remains unchanged; its create-only trial initialization behavior is preserved. No new endpoint, polling, production deployment, cloud configuration, or Supabase cutover was performed.
- Pending verification: run Firebase Auth unit tests and Android Play Store debug compilation on the approved setup branch, then rebuild the Preview APK before installing this UI update.

 
## 2026-11-15 — Preview trial on-device verification and Phase 1 auth audit

### Verified results
- GitHub Actions workflow **WatchAtHome Preview APK**, run `43617004862`, branch `setup/firebase-cloudflare-zero-cost`, commit `f37a1a625429b95861d6ec06beb9a5f96a19cfe6`: completed successfully.
- Uploaded artifact: `watchathome-preview-playstore-debug-apk`, ID `14122798970`.
- Firebase Auth Build run `43615293783`, commit `78034fa69b39671e0c51d330d8f26f107acdc538`: Firebase session-manager tests and Android Play Store debug compilation passed.
- User supplied screenshot from the Preview app shows Firebase email Verified, Cloudflare account Active, 7-day trial Initialized, trial start `2026-11-14T07:29:34.752Z`, and expiry `2026-11-21T07:29:34.752Z`. This is user-provided device evidence.

### Read-only active-auth audit
- `AuthRepository.kt`: Supabase session status, signup/sign-in, session validation/refresh, sign-out, invalid-session recovery, and account deletion.
- `AuthScreen.kt`: normal sign-in/sign-up continues to call the active `AuthRepository`.
- `AppGate.kt`: initializes and observes `AuthRepository` to determine the authentication gate.
- `DeviceLinkAuthRepository.kt`: uses Supabase RPCs, the `tv-logins-exchange` function and imports Supabase sessions.
- `SupabaseProvider.kt`: configures Supabase Auth, PostgREST, Functions, Storage and Realtime.
- Firebase session manager/repository are staged and are not yet the active app authentication provider.

### Decision / next gate
Do not wire Firebase into the active app gate or replace `AuthRepository` until dependent account/data/device-link services have a tested Firebase/Worker path. Next limited work: strengthen and test Firebase repository/session lifecycle in isolation, retaining the current implementation as rollback. No source, Worker, cloud resource, deployment, secret, Firebase/Supabase data, or Production change occurred in this audit/report update.

### Mandatory handover status
1. What is happening? Preview Firebase bootstrap/trial is verified; active-auth audit is complete.
2. Are we building right now? No. This entry is documentation-only.
3. Do you need to do anything? No.
4. What is the next step? Continue isolated Firebase repository/session lifecycle work after reviewing latest source and tests; no active cutover yet.

 
## 2026-11-15 — Firebase auth lifecycle regression tests added

- Source commit: `bc9e56b634edaf39a16eafb2d278d82a1c92e6a7`.
- Added tests covering idempotent initialization, `stop()` cancellation and reinitialization, state observer transitions between authenticated/unauthenticated, and sign-out failure retaining the authenticated state for retry.
- No production source, active Supabase login, AppGate, device-link flow, Worker, cloud configuration, secrets, or account data changed.
- CI validation is pending. This test-only change is expected to trigger `WatchAtHome Firebase Auth Build` through its existing path filter.
- What is happening? Firebase session lifecycle test coverage is expanded.
- Are we building right now? Check the workflow; no Preview APK is being requested.
- Do you need to do anything? No.
- What is the next step? Confirm focused tests and Android Play Store debug compilation pass.

## 2026-11-15 — Account status API implementation

### Change
Added `GET /v1/account` to the Premium Worker. It queries the `accounts` row using the UID from the already verified Firebase token and returns `uid`, `status`, `createdAt`, `updatedAt`, and `deletedAt`. Missing accounts return 404. The endpoint does not bootstrap accounts or mutate state.

### Tests
Added mocked-D1 coverage for active account response, deletion-pending state, and missing-account handling. CI is pending; no test pass is claimed yet.

### Scope and safety
No Worker deployment, D1 migration/application, Firebase/Supabase configuration, account data, secrets, active Supabase login, or APK build was changed.

### Mandatory status
1. What is happening? The read-only authenticated account-status route and tests are committed.
2. Are we building right now? Worker CI is expected; no APK build.
3. Do you need to do anything? No.
4. What is the next step? Verify Worker CI before further implementation.

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
