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
