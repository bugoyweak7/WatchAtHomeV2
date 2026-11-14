# Supabase-to-Firebase/Cloudflare Migration Evidence Matrix

Last reviewed: 2026-11-14 (Asia/Manila)
Repository evidence baseline: `bugoyweak7/WatchAtHomeV2`, branch `setup/firebase-cloudflare-zero-cost`
Scope: source-level migration planning. This document does not claim live endpoint parity or remote legacy data export.

## Decision and safety rules

- Target: remove Supabase from the shipped User App and its runtime/backend dependencies only after every active feature has a verified Firebase/Cloudflare replacement.
- Keep all current Supabase adapters, credentials/configuration and rollback path until each feature is individually cut over and regression-tested.
- Do not delete or reset local user data during failed login, sync, migration, or account deletion.
- Derive account ownership from verified Firebase ID tokens; never trust a client-supplied UID.
- Keep shared Admin Firestore add-on catalogue separate from per-user/profile installed add-ons.
- Do not disable or delete the inherited upstream Supabase service. The user does not own that project; no dashboard/schema/RLS/Edge Function access is available. Remote data migration is therefore unverified.

## Feature-by-feature evidence matrix

| Feature / data | Verified legacy client dependency | Firebase / Cloudflare replacement evidence | Status and remaining gate |
|---|---|---|---|
| Email/password auth and session | Active `AuthRepository` uses Supabase Auth for state, registration, sign-in, refresh, sign-out and invalid-session handling. | GitLive Firebase Auth gateway/session manager exists; Worker verifies Firebase password-provider ID tokens. | **BLOCKED.** Firebase session layer is staged, not wired to active AuthScreen/AppGate. Wire only after protected APIs and account lifecycle are ready; test session persistence, refresh, sign-out and recovery. |
| Anonymous/local UUID access | Active auth flow still supports local UUID/anonymous access and UI entry point. | Approved target is registered Firebase email/password accounts only. | **BLOCKED.** Remove anonymous path only with explicit migration behavior and local-data preservation tests. |
| Account bootstrap and device registry | Supabase identity currently anchors app account and device registration (`register_current_device`). | Worker has Firebase-authenticated `POST /v1/account/bootstrap`, `POST /v1/devices`, `GET /v1/devices`, and `DELETE /v1/devices/{installationId}`; D1 schema and Preview/Production database schema objects are documented as present. | **PARTIAL.** CI/source/schema evidence exists; live Preview endpoint, Firebase token, D1 binding and ownership behavior still require integration verification with a dedicated test account. |
| TV/device-link login | Supabase RPCs `start_device_login_session`, `poll_tv_login_session` and Edge Function `tv-logins-exchange`; client imports Supabase session tokens. | D1 has `device_link_sessions` schema; no complete Worker start/approve/poll/one-time Firebase token exchange flow is verified. | **BLOCKED.** Design nonce-bound, short-lived, one-time pairing, explicit approval, replay protection and Firebase-compatible session exchange. Do not broadly allow custom-provider tokens. |
| Account deletion | Supabase Edge Function `delete-account`; local cleanup follows old session lifecycle. | D1 `account_deletion_jobs` table exists; no complete cross-store deletion state machine is verified. | **BLOCKED.** Implement reauthentication, idempotent job/retry, Firebase Auth deletion, D1/Firestore/R2 cleanup and safe local cleanup only after server success. |
| Profiles and profile locks/PIN | Supabase RPCs `sync_pull_profiles`, `sync_push_profiles`, `sync_delete_profile_data`, `sync_pull_profile_locks`, `verify_profile_pin`, `set_profile_pin`, `clear_profile_pin`, `clear_profile_pin_with_account_password`. | Worker profile CRUD, profile locks and PIN routes/modules exist; D1 profile/PIN schema and tests are present. | **PARTIAL.** Verify active account bootstrap, PIN hashing/pepper secrets, lockout/rate limits, ownership, reauthentication and live Preview parity before wiring the mobile repository. Never store raw PINs. |
| Profile settings | Supabase RPCs `sync_pull_profile_settings_blob` / `sync_push_profile_settings_blob`; profile/platform JSON blob. | Worker GET/PUT profile-settings API and staged Cloudflare adapter; JSON unknown-key preservation and sensitive-key rejection tests documented. | **PARTIAL.** Mobile sync remains on Supabase. Verify live Preview round-trip, platform scoping, conflict/merge semantics, and no incomplete snapshot overwrites before cutover. |
| Per-profile installed add-ons | Supabase PostgREST `addons` table filtered by `profile_id`; RPC `sync_push_addons`; local manifest URLs/enabled state. | Worker D1 per-profile add-on API and local storage exist. Shared Admin Firestore `/addons` catalogue is a separate concept. | **PARTIAL.** Preserve local installed URLs and per-profile enabled/order choices. Complete and test user-installed list sync independently from the shared Admin catalogue. |
| Shared Admin add-on catalogue | Not the same as legacy user-installed add-ons. Admin App writes Firestore `addons/{addonId}` with publish/enabled metadata. | Worker uses service-account Firestore access; public read-only catalogue endpoint is a proposed integration, not yet verified as implemented. | **BLOCKED / separate workstream.** Expose only published+enabled public metadata; Admin writes remain authenticated. Add version/change detection and the User App “Update Catalog” flow without overwriting profile preferences. |
| Plugin repositories | Supabase PostgREST `plugins` table and RPC `sync_push_plugins`; manifest URLs and scraper state are locally managed. | Worker profile plugin APIs and D1 table/tests exist. | **PARTIAL.** Verify platform gating, local cache behavior, manifest refresh and profile ownership. Do not store scraper source as if it were the legacy row payload. |
| Collections | Supabase RPCs `sync_pull_collections`, `sync_push_collections`; collection JSON blob. | Worker D1 collection API; JSON unknown-field round-trip and sensitive-field rejection tests documented. | **PARTIAL.** Live Preview and mobile adapter parity required; preserve unknown JSON keys and delete semantics. |
| Library | Supabase RPC snapshot, cursor, delta, push and delete operations. | Worker D1 snapshot pagination, cursor, delta, upsert and tombstone APIs; staged mobile adapter and guarded repository selection exist. | **PARTIAL.** Cloudflare flag defaults false. Test snapshot/delta ordering, pagination, tombstones, batching, origin metadata, profile isolation and local-first behavior end to end. |
| Watch progress | Supabase RPC snapshot, cursor, delta, push and delete operations. | Worker D1 snapshot/cursor/delta/upsert/delete APIs; staged mobile adapter and guarded selection exist. | **PARTIAL.** Verify stable progress identity, timestamp filters, pagination, delta ordering and tombstones end to end. |
| Watched history | Supabase RPC snapshot, cursor, delta, push and delete operations. | Worker D1 APIs and staged mobile adapter; source notes record content-type identity and legacy delete-key compatibility tests. | **PARTIAL.** Verify current CI and live Preview behavior, including same content ID across media types and delete tombstones. |
| Home catalogue settings | Supabase RPCs `sync_pull_home_catalog_settings` / `sync_push_home_catalog_settings`, profile/platform JSON. | Worker D1 GET/PUT route and staged adapter/source support exist. | **PARTIAL.** Verify platform scoping, JSON merge/unknown fields, local defaults and live integration. |
| Provider credentials | Supabase RPCs `sync_pull_provider_credentials` / `sync_push_provider_credentials`; credential JSON includes provider secrets. | Worker provider-credential API and encrypted D1 storage modules exist; encryption key-ring secrets are required. | **BLOCKED until secret verification.** Verify Preview-only encryption secrets, key rotation, ciphertext-at-rest, no secret logging, ownership and restore behavior. Never copy secrets into source or chat. |
| Media servers | Supabase RPCs `sync_pull_media_servers` / `sync_push_media_servers`; serialized model may contain server token. | Worker media-server API and encrypted D1 storage modules exist; encryption key-ring secrets are required. | **BLOCKED until secret verification.** Inspect exact model/secret fields; verify encryption, redaction, ownership and live round-trip. |
| Device registration | Supabase RPC `register_current_device`. | Worker D1 device registry routes exist. | **PARTIAL.** Verify installation ID stability, revocation semantics, retention and live client integration. |
| Membership/supporter/subscription | Supabase RPCs `get_my_member_access`, `get_my_membership_overview`; response includes entitlement, provider/subscription/billing/grant metadata. | Worker premium/trial APIs exist but do not prove equivalence to the full legacy membership overview. | **BLOCKED.** Identify authoritative entitlement/subscription source and map every visible field/behavior before replacing. |
| Watch Party | Supabase RPCs for party lifecycle, membership, playback, chat and clock; private Realtime presence/broadcast channel `watch-party:<partyId>`. | Durable Objects are the planned realtime target; no equivalent complete Worker/DO route implementation or parity proof is recorded. | **BLOCKED.** Implement private-room auth, presence, reconnect, event fan-out, host controls, chat history and clock semantics; polling alone is not equivalent. |
| Shared member assets / Storage | Supabase Storage integration exists in the User App source inventory. | R2 is the approved target for uploaded user images/files only. | **NEEDS DETAILED INVENTORY.** Identify exact buckets, object paths, metadata, access and lifecycle; do not store movie/video binaries in R2. |
| Runtime configuration and dependencies | `SupabaseProvider`, `SupabaseEndpointConfig`, generated `SupabaseConfig.kt`, Gradle build-time Supabase URL/key/fallback variables, and PostgREST/Auth/Functions/Storage/Realtime libraries remain. | Firebase SDKs and Cloudflare Worker adapters are present. | **BLOCKED until final cutover.** Remove only after repository-wide source/build/runtime scan proves no remaining call sites; verify Android, Android TV and iOS builds. |

## Cross-cutting migration gates

1. **Contract and data gate:** map every legacy request, response, field, ordering rule, pagination/delta cursor, mutation, delete/tombstone, sync-origin value and error behavior. The upstream SQL schema, RLS, triggers, Edge Function code and Realtime authorization are not available; do not invent them.
2. **Identity gate:** Firebase email/password session is active and stable; account bootstrap and every protected Worker route accept the same verified identity. No anonymous/guest account path remains in the approved product behavior.
3. **Security gate:** verify UID/profile ownership, request bounds, rate limits, CORS origin policy, least-privilege Firestore service account, encryption/PIN secrets, no secret logging and abuse controls.
4. **Preview gate:** isolated Preview Firebase project, Preview Worker, Preview D1 binding/schema and Preview-only secrets are verified. Run integration tests with a dedicated test account and no production user data.
5. **Feature cutover gate:** migrate one feature at a time behind an explicit opt-in/rollback switch. Confirm app UI/player behavior, offline/local-first behavior, sync conflict semantics and data integrity.
6. **Platform gate:** Android mobile, Android TV and iOS compile and regression tests pass for each affected feature.
7. **Data/rollback gate:** preserve local data; define an authorized export/import path for only the current user's own legacy data if the inherited service allows it. No remote data migration is currently proven.
8. **Final removal gate:** only after all feature cutovers are verified, run a full recursive scan for Supabase imports, URLs, keys, generated config, Gradle aliases/dependencies, tests, CI variables and runtime paths. Then remove obsolete client code/config/dependencies in a separately reviewed change. Do not delete or disable the inherited upstream Supabase project/service.

## Recommended first implementation sequence

1. Verify Preview Firebase service-account and Web API configuration are Preview-only; inspect the Preview Worker D1 binding and runtime health without exposing secrets.
2. Complete the Worker account lifecycle contract: bootstrap, Firebase session expectations, device-link pairing/exchange and account deletion. Implement missing pieces with tests before changing active mobile auth.
3. Wire Firebase email/password auth into the User App behind a controlled Preview/test-account path. Remove anonymous entry only after migration behavior is validated.
4. Prove account bootstrap, device registration, profiles/PIN and profile settings end to end.
5. Continue with add-ons/plugins/collections, library/progress/watched, home settings, credentials/media servers, membership, storage and Watch Party.
6. Only then perform the final Supabase removal audit and code/dependency cleanup.

## Current evidence conclusion

Supabase is still required by active app paths. The source and test foundation for Firebase/Cloudflare is substantial, but live end-to-end parity, device-link, complete account deletion, full membership parity, Watch Party realtime, sensitive-secret verification, legacy remote data migration and final platform builds remain unresolved. **Do not remove Supabase now.**

## Evidence references

- `docs/LEGACY_BACKEND_SOURCE_COMPATIBILITY_AUDIT.md` — source-level RPC, payload, storage and Realtime contracts; explicitly notes missing upstream server-side definitions.
- `docs/FIREBASE_CLOUDFLARE_ACCOUNT_MIGRATION_CONTRACT.md` — draft account identity, ownership and Worker API contract.
- `SETUP_STATUS.md` — dated repository and infrastructure verification records, including current Preview/Production separation and no-cutover constraints.
- `src/index.ts`, feature API modules, `migrations/0001_initial.sql`, `wrangler.toml` — current Worker routes, schema and environment configuration.
