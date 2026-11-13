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
