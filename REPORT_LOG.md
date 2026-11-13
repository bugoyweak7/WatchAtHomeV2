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
