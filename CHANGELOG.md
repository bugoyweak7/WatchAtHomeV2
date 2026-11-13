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
