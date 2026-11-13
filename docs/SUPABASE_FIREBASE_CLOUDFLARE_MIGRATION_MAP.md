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
