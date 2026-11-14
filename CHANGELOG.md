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


## 2026-11-14 — Configure Preview Firebase for Android debug builds
- Replaced only `androidApp/src/debug/google-services.json` with the supplied `watchathome-preview` configuration, including all three registered Android package IDs.
- Kept the root `androidApp/google-services.json` Production configuration unchanged.
- No auth implementation, Supabase integration, Worker, cloud resource, secret, or deployment changed. This does not yet switch the app's active authentication to Firebase.


## 2026-11-14 — Supabase migration evidence matrix

- Added `docs/SUPABASE_MIGRATION_EVIDENCE_MATRIX.md` documenting source-verified legacy dependencies, replacement evidence, blockers and cutover gates across all major User App features.
- Distinguished the shared Admin Firestore add-on catalogue from per-profile installed add-ons.
- Recorded missing upstream Supabase server-side definitions and the fact that remote user-data migration is not yet verified.
- Conclusion: keep Supabase active as rollback; no removal or feature cutover is safe yet.
- Documentation-only change; no application code, dependencies, cloud settings, secrets, data or deployments changed.


## 2026-11-14 — Full migration report consolidated into master handover

- Appended the complete Supabase migration evidence matrix and the user's reporting-location rule to `WATCHATHOME_MASTER_HANDOVER.md`.
- Future full reports/audits/test results/blockers/handovers belong in the master handover; do not create separate report documents. Keep status/changelog entries concise.
- Preserved the prior standalone matrix file as historical evidence; no history was deleted.
- Documentation only; no app code, cloud resources, secrets, data or deployments changed.


## 2026-11-14 — Preview environment verification

- Verified Preview/Production Firebase and D1 identifiers in current Wrangler source and Preview Firebase project/package identifiers in Android debug config.
- Confirmed Worker source contracts for Firebase password-provider token verification, service-account project matching, health and account bootstrap.
- Preview secrets and live runtime health remain unverified; TV device-link and complete account deletion remain missing. Supabase stays active.
- Full report appended to `WATCHATHOME_MASTER_HANDOVER.md`; no source or cloud resources changed.


## 2026-11-14 — TV device-link client implementation gate
- Re-audited User App and Premium Worker source before the approved client implementation.
- Confirmed the Worker pairing routes and restricted `tv_linked=true` custom-token verification are ready, but the active User App session, device registration, and existing feature adapters still depend on Supabase.
- A Firebase-only client cutover would not preserve current app behavior; Firebase/Supabase account identity linkage and the intended Android TV target are not yet established.
- No runtime source changes or tests were made. Full findings and the next approval gate are appended to `WATCHATHOME_MASTER_HANDOVER.md`.

## 2026-11-14 — Firebase/Supabase identity migration design
- Appended the identity-link design, staged client flow, security constraints, blockers and acceptance gates to `WATCHATHOME_MASTER_HANDOVER.md`.
- Confirmed the existing Worker endpoint verifies both sessions but does not persist an identity link; active User App authentication and device-link remain Supabase-backed.
- Documentation only. No app code, dependencies, backend routes, D1 schema/data, Firebase/Supabase settings, secrets, deployments or production resources changed.



## 2026-11-14 — Worker identity-link backend source implementation

- Added the additive D1 identity-link schema, dual-session Worker link route, and conflict/idempotency tests in the Premium Worker setup branch.
- The backend source requires recent Firebase password reauthentication, verified Firebase email, an active D1 account, and a valid non-anonymous legacy session. Existing links cannot be reassigned.
- CI for the latest source/test commit was pending when recorded. No D1 application or deployment was performed.
- User App authentication remains Supabase-backed; no runtime client cutover, Production operation, or Supabase data/settings change.


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


## 2026-11-14 — Staged Firebase email-verification foundation

- Extended the existing GitLive Firebase Auth gateway with send-verification and reload-current-user operations, and added the Firebase `isEmailVerified` snapshot field.
- Staged Firebase registration now sends a verification email after account creation. The session manager exposes verification status, supports resend while unverified, and reloads the Firebase user to detect a completed verification link.
- Added focused tests for verification-email delivery, resend, refreshed verified status, mismatched/missing sessions, anonymous rejection and sign-out state cleanup.
- Kept the active `AuthRepository`, `AuthScreen`, Supabase adapters/dependencies, Worker routes, account bootstrap and Production configuration unchanged. This is a foundation only; it does not block the current Supabase login or yet connect verification to Worker bootstrap.
- Source commits: `7467a697f715690700c1410206f0e681aa55ceae`, `01382cf0e03dfba4260403c301adfe6ea64a56d3`, `fc3ba156be2c2c88557a38fa0e5b7165492788da`.
- Test execution/CI result is pending; source commits are not treated as build verification. No Preview/Production deployment, Firebase Console change, secret/configuration change, D1/Firestore mutation, Supabase service/data change, or user-account operation occurred.
- Next gate: run focused common tests and Android/iOS compilation; fix any compile/test issues before implementing the separate Worker bootstrap integration.

## 2026-11-14 — Staged Firebase email-verification settings UI

- Added a separate Firebase account-preparation card to Account Settings for authenticated non-anonymous legacy users.
- Added create/sign-in, resend verification email, and reload verification-status actions using the staged Firebase repository.
- Kept active Supabase authentication and all legacy data adapters unchanged. The UI does not perform identity linking or Worker bootstrap.
- Updated Firebase Auth workflow path filters to validate the new settings UI with focused tests and Android Play Store debug compilation.
- Commits: `bd727edf26d5953f23aa733f6186d4c10312407c`, `ff7c0593c8f586a7ab0fb46b84b1885f7320de2c`, `a5e66fe88c5072053cc7ad501cd52ff7b2c6a368`. CI pending.
- No cloud, Preview/Production, secret, Supabase service/data, or user-account changes.

## 2026-11-14 — Firebase-only User App dependency audit
- Recorded a GitHub-source audit of remaining inherited Supabase dependencies and corrected the migration sequence for a Firebase-only account identity. Active auth/device-link, data sync, realtime, membership/assets and SDK removal remain pending feature-by-feature replacement and Preview regression testing.
- Documentation only. No application code, Worker source, D1/Firestore data, secrets, deployment or Production resource changed. Full audit is in WATCHATHOME_MASTER_HANDOVER.md.


## 2026-11-14 — Staged Firebase account bootstrap client

- Added verified-email-gated Cloudflare `/v1/account/bootstrap` client call from the staged Firebase session.
- Added explicit Account Settings action and success confirmation; requires HTTPS Worker URL and `accountReady: true` response.
- Active Supabase auth and data adapters remain unchanged. No deployment/cloud resource changes.
- Build/CI validation pending; see `WATCHATHOME_MASTER_HANDOVER.md`.


## 2026-11-14 — Preview APK workflow prepared

- Added manual Play Store debug APK workflow with Preview Worker URL configured only for that build; focused Firebase Auth tests run before APK compilation and APK artifact retention is seven days.
- Commit: `7ca6abac1d9369c65ecc9edd9aa0f971481079c4`.
- Dispatch and APK artifact are pending; no build or installation claimed. See `WATCHATHOME_MASTER_HANDOVER.md`.


## 2026-11-14 — Preview-only Firebase access from login screen

- Added a Firebase Preview Test entry point to AuthScreen, reusing the existing Firebase account verification and Cloudflare bootstrap UI.
- Added generated PreviewFirebaseAccessConfig; the flag defaults to disabled and is enabled only in the Preview APK workflow.
- Updated .github/workflows/watchathome-preview-apk.yml to set WATCHATHOME_PREVIEW_FIREBASE_ACCESS=true for that Preview build only.
- Existing Supabase login and active account/data paths remain unchanged. Build, tests, APK artifact, and device verification are pending.


## 2026-11-15 — Preview Firebase trial status display

- Updated the Preview Firebase account flow to parse the trial details returned by the existing `/v1/account/bootstrap` response.
- The Preview tools now display whether the Cloudflare account is active, whether the 7-day trial is initialized, and the returned trial start and expiry timestamps.
- The existing bootstrap endpoint remains unchanged; its create-only trial initialization behavior is preserved. No new endpoint, polling, production deployment, cloud configuration, or Supabase cutover was performed.
- Pending verification: run Firebase Auth unit tests and Android Play Store debug compilation on the approved setup branch, then rebuild the Preview APK before installing this UI update.

 
## 2026-11-15 — Preview trial verification and Firebase auth migration audit

- Recorded successful Preview APK workflow run `43617004862` and artifact `14122798970`; user screenshot confirms the Firebase verification, Cloudflare Active state, and 7-day trial dates are displayed on-device.
- Recorded successful Firebase Auth Build run `43615293783` (session-manager tests and Android Play Store debug compilation).
- Audited active User App authentication call sites. Supabase remains active in `AuthRepository`, normal `AuthScreen` submission, `AppGate`, device-link RPC/token exchange, and shared Supabase client services.
- Firebase auth/session manager and Firebase repository remain staged and separate. Active auth cutover is deferred until dependent services and lifecycle behavior are migrated and tested.
- Documentation-only entry; no runtime source, cloud resource, deployment, secret, Firebase/Supabase data, or Production setting changed.
- Future report/handover updates must explicitly answer: What is happening? Are we building right now? Do you need to do anything? What is the next step?

 
## 2026-11-15 — Firebase auth session lifecycle tests

- Added tests for repeated initialize, stop/reinitialize observer lifecycle, auth-state observer updates, and sign-out failure preserving the authenticated state for retry.
- Commit: `bc9e56b634edaf39a16eafb2d278d82a1c92e6a7`.
- Test-only change; active Supabase login and all app/cloud behavior remain unchanged. CI verification pending.

## 2026-11-15 — Add authenticated account status API

- Added `GET /v1/account`, returning only the verified caller's D1 account status and lifecycle timestamps.
- Added `getAccount` in `premium-worker/src/account-device.ts` and mocked-D1 tests covering owner UID, active/deletion-pending state, and 404 for missing account.
- Commits: `ef03d2e4625b470d419c6f9dab0a4aa5b3d3b3f3`, `4b89425a590c1f2141a3d54ab90c1fa2d93067d7`, `28a2770219496d60e3d7a136ab8e314d10bffb47`.
- No deployment, D1 mutation, APK build, Supabase cutover, or production change. CI pending.

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
