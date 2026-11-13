# Legacy Backend Compatibility Audit — Source Evidence

Date: 2026-11-13 (Asia/Manila)
Repository: `bugoyweak7/WatchAtHomeV2`
Branch: `setup/firebase-cloudflare-zero-cost`
Purpose: Record verified client-side Supabase contracts and inspect the existing Worker before backend replacement. This is source evidence, not proof of upstream server-side SQL/RLS behavior.

## Scope and method

Inspected the actual files in this repository branch, including the existing `premium-worker/` implementation and the current common Kotlin repositories/adapters. The GitHub code-search index returned no matches for broad Supabase queries, so targeted file reads were used. No other repository was accessed.

## Existing Worker: verified implementation

Files:
- `premium-worker/src/index.ts`
- `premium-worker/wrangler.toml`
- `premium-worker/package.json`
- `premium-worker/tsconfig.json`
- `premium-worker/README.md`

The Worker currently implements:
- `GET /health`
- `POST /v1/admin/premium-codes`
- `POST /v1/premium/redeem`
- `POST /v1/trial/initialize`
- `GET /v1/premium/status`

Authenticated endpoints validate Firebase ID tokens using Google's Secure Token JWKS, require RS256, expected issuer and audience, a valid subject/auth_time, and Firebase `sign_in_provider=password`. Admin code creation additionally checks `admins/{uid}` for `role=admin` and `active=true`. Firestore is accessed by the Worker using a service-account credential stored as a Cloudflare secret. The current Wrangler config declares only `FIREBASE_PROJECT_ID=watchathome-admin`; no D1 or Durable Object binding is declared.

The current Worker does not implement:
- Account registration/bootstrap lifecycle beyond trial initialization.
- Device pairing start, approval, TV polling, or one-time token exchange.
- Full account deletion across Firebase Auth, Firestore, and future D1 data.
- The profile/library/watch-history/collection/add-on/provider/media-server APIs.
- Watch Party APIs or Durable Object realtime coordination.

### Worker hardening observations

These are source-level observations requiring correction/review before expanding the Worker; they are not claims of an exploited vulnerability:
- CORS currently returns `access-control-allow-origin: *`; no explicit origin allowlist is present.
- There is no visible per-user/IP rate limiting or request-body size bound in the Worker source.
- There is no D1 binding or durable state layer for pairing/session workflows.
- The Firestore service-account OAuth scope is the broad Datastore scope; IAM permissions still need least-privilege verification in the actual Google Cloud project.
- Error handling intentionally hides internal details from clients, but there is no visible structured operational logging/observability in the inspected entry point.
- Premium redemption uses a Firestore transaction and update-time preconditions; retain its concurrency protection when refactoring.
- Trial initialization uses create-only/update-time preconditions and rereads the document after a conflict; preserve the immutable registration-time trial rule.

Do not deploy or change account settings based on this audit alone.

## Verified legacy client contracts

### Profiles

Source: `features/profiles/ProfileRepository.kt`

Verified RPCs:
- `sync_pull_profiles`
- `sync_push_profiles`

Push parameters include:
- `p_client_max_profiles`
- `p_profiles` (serialized profile payloads)
- sync-origin client ID metadata

Profile pull decodes a list of `NuvioProfile`. Profiles are ordered by `profileIndex`. Profile data includes profile-specific selection/state and avatar/background-related properties. Exact database columns, validation and RLS remain unknown.

### Add-ons

Source: `features/addons/AddonRepository.kt`

Verified behavior:
- Reads the `addons` PostgREST table filtered by `profile_id`, ordered by `sort_order`.
- Row fields consumed by the client include `url`, `name`, `enabled`, and `sort_order`.
- Push uses RPC `sync_push_addons` with profile/add-on payload and sync-origin metadata.
- The repository also keeps local installed manifest URLs and enabled state; the server stores user/profile selection, not the add-on manifest contents themselves.

The shared admin catalogue in Firestore is a separate product concept and must not be conflated with a user's installed add-on list.

### Library

Source: `features/library/sync/SupabaseLibrarySyncAdapter.kt`

Verified RPCs:
- `sync_pull_library`
- `sync_get_library_delta_cursor`
- `sync_pull_library_delta`
- `sync_push_library_items`
- `sync_delete_library_items`

Pull uses bounded offset/limit pagination. Delta pulls use `p_profile_id`, `p_since_event_id`, and `p_limit`. Mutations carry `p_profile_id`, serialized item/key batches, and sync-origin metadata.

Client item fields include content ID/type, name, poster, poster shape, background, logo, description, release info, IMDb rating, genres, add-on base URL, and added timestamp. Preserve the distinction between snapshot and delta semantics.

### Watch progress

Source: `features/watching/sync/SupabaseProgressSyncAdapter.kt`

Verified RPCs:
- `sync_get_watch_progress_delta_cursor`
- `sync_pull_watch_progress_delta`
- `sync_pull_watch_progress`
- `sync_push_watch_progress`
- `sync_delete_watch_progress`

Client records include content ID/type, video ID, season/episode, playback position, duration, last-watched timestamp, and progress key. Pull supports optional `p_since_last_watched` and `p_limit`; delta uses event cursor and limit. Push/delete carry sync-origin metadata.

### Watched history

Source: `features/watching/sync/SupabaseWatchedSyncAdapter.kt`

Verified RPCs:
- `sync_get_watched_items_delta_cursor`
- `sync_pull_watched_items_delta`
- `sync_pull_watched_items`
- `sync_push_watched_items`
- `sync_delete_watched_items`

Client records include content ID/type, title, optional season/episode, and watched timestamp. Snapshot pulls are page-number/page-size based; delta pulls use event IDs. Delete keys identify content and optional season/episode.

### Collections

Source: `features/collection/CollectionSyncService.kt`

Verified RPCs:
- `sync_pull_collections`
- `sync_push_collections`

The client expects a collection-blob response and reads a JSON `collections` payload; push sends `p_profile_id`, `p_collections_json`, and sync-origin metadata. The collection JSON is locally preserved/normalized, so replacement storage must preserve unknown JSON fields rather than destructively reserialize only known model fields.

### Watch Party

Source: `features/party/PartyApi.kt` and `features/party/PartyRepository.kt`

Verified RPCs and client parameter names:
- `watch_party_create`
- `watch_party_join`
- `watch_party_link_profile`
- `watch_party_preview`
- `watch_party_heartbeat`
- `watch_party_update`
- `watch_party_leave`
- `watch_party_end`
- `watch_party_set_host_only`
- `watch_party_remove_member`
- `watch_party_send_message`
- `watch_party_list_messages`
- `watch_party_clock`
- `watch_party_enabled`

The client also opens Supabase Realtime channels for party events/presence. Party messages include a client-generated message ID; playback state includes sequence, member, paused/position/rate/time/media key/waiting fields. Presence, state, status, control, member join/leave, ended, media, stream and chat events are handled by the client. A simple REST polling replacement would not be behaviorally equivalent; the planned Durable Object design must preserve these event semantics and authorization.

## Compatibility requirements inferred from verified client behavior

- Scope all personal data by authenticated Firebase UID and profile ID on the server. Never trust a client-supplied UID as ownership proof.
- Preserve profile-specific data separation and profile switching.
- Preserve snapshot, delta cursor, pagination, mutation batching, delete/tombstone, and sync-origin semantics.
- Preserve local-first operation and collection unknown-field round-tripping.
- Keep the shared Firestore add-on catalogue separate from each account's installed add-ons.
- Watch Party needs authenticated membership checks, presence, event delivery, host controls, chat history and clock coordination.
- Do not remove Supabase adapters until each replacement endpoint has parity tests and mobile integration tests.

## Evidence limitations and next source-audit targets

The source files reveal client-visible calls and serialization models only. They do not reveal upstream SQL schemas, constraints, triggers, RPC implementation details, RLS policies, Edge Function implementation, or Realtime authorization. The user does not own the upstream Supabase project, so do not request its dashboard credentials as a prerequisite.

Still to inspect from the actual User App source:
- Profile PIN/lock RPCs and their request/response models.
- Profile settings and sync-origin/event behavior.
- Provider credentials and encryption boundaries.
- Plugin repository storage and synchronization.
- Home catalogue settings.
- Media-server metadata and device registration.
- Membership access/overview RPC response models.
- Device-link legacy exchange and account deletion request behavior.
- All remaining Supabase imports and platform-specific adapters.

Remote data migration is a separate question. Only investigate an authorized export of the current user's own data if the legacy endpoint is reachable and the user already has a valid session. Do not use a shared public/anon key to bypass RLS or read other users' records.

## Change record

Documentation only. No application source, Worker runtime, SQL migration, Firebase configuration, Cloudflare resource, production data, or deployment was changed by this audit.


## Additional source contracts verified in the continuation

### Profile settings blob

Source: `core/sync/ProfileSettingsSync.kt`

Verified RPCs:
- `sync_pull_profile_settings_blob`
- `sync_push_profile_settings_blob`

Parameters include `p_profile_id`, `p_platform`, `p_settings_json`, and sync-origin metadata. The client reads/writes a single profile settings JSON blob and compares signatures before applying it. Its payload includes theme settings, poster/card style settings, custom poster settings, card-depth settings, player settings, stream-badge settings, debrid settings, TMDB settings, MDBList settings, metadata-screen settings, collection mobile settings, continue-watching settings, Trakt settings/comments, and episode-release notification settings. Preserve unknown JSON keys and avoid overwriting a remote blob with an incomplete local snapshot.

### Provider credentials

Source: `core/sync/ProviderCredentialSync.kt`

Verified RPCs:
- `sync_pull_provider_credentials`
- `sync_push_provider_credentials`

Push parameters include `p_profile_id`, `p_credentials` (array entries with `provider` and `credential_json`), and sync-origin metadata. The credential snapshot aggregates debrid provider API keys and credentials/settings from TMDB, MDBList, and player-related provider configuration. These are sensitive account/profile data. The replacement must define encryption in transit and at rest, strict UID/profile ownership, no logging of credential payloads, and least-privilege access. The inspected client adapter serializes credential JSON; it does not establish the upstream server's at-rest encryption behavior.

### Media-server metadata

Source: `core/sync/MediaServerSync.kt`

Verified RPCs:
- `sync_pull_media_servers`
- `sync_push_media_servers`

Pull sends `p_profile_id` and decodes `servers_json`; push sends `p_profile_id`, `p_servers`, and sync-origin metadata. The repository merges synced server metadata with local state. Inspect the complete `SyncedServer` model and its secret fields before deciding what may be synchronized or stored server-side.

### Membership access

Sources:
- `features/membership/MemberAccessRemoteDataSource.kt`
- `features/membership/MembershipOverviewRemoteDataSource.kt`

Verified RPCs:
- `get_my_member_access`
- `get_my_membership_overview`

The access response exposes a tier and entitlement list. The overview response includes status/tier, verification/supporter timestamps, provider connection, subscription presence/status/access, billing provider, membership level, current period end, cancellation-at-period-end, monthly amount/currency, and active/lifetime grant metadata. These RPCs are user-context reads in the client; replacement must derive identity from the Firebase token and must not accept a client-selected UID as the authority for membership.

### Profile PINs and profile locks

Source: `features/profiles/ProfileRepository.kt`

Additional verified RPCs:
- `sync_delete_profile_data` with `p_profile_id` and sync-origin metadata.
- `verify_profile_pin` with `p_profile_id` and `p_pin`; response includes an `unlocked` result.
- `set_profile_pin` with `p_profile_id`, `p_pin`, and optional `p_current_pin`.
- `clear_profile_pin` with `p_profile_id` and optional `p_current_pin`.
- `clear_profile_pin_with_account_password` with `p_account_password` and `p_profile_id`.
- `sync_pull_profile_locks`.

Do not store raw profile PINs or implement PIN verification as a client-only check. The replacement needs server-side PIN hashing/verification, throttling/lockout policy, account-password reauthentication where required, and tests for profile ownership and recovery behavior. Exact legacy hash format and server-side policy remain unknown from client source.

### Device-link and account deletion

Sources:
- `core/auth/DeviceLinkAuthRepository.kt`
- `core/auth/AuthRepository.kt`

Device-link client contract:
- `start_device_login_session` receives `p_device_nonce`, `p_redirect_base_url`, `p_device_name`, and `p_device_type`.
- Start response contains `device_code`, `user_code`, `verification_uri_complete`, and `poll_interval_seconds`.
- `poll_tv_login_session` receives `p_code` and `p_device_nonce`; client handles pending/approved/expired states.
- Approved sessions call Edge Function `tv-logins-exchange` with `code` and `device_nonce`; response contains Supabase access/refresh tokens, expiry, token type, and optionally user details. The client imports this Supabase session.
- Polling is bounded (up to 120 attempts) with 2–10 second interval and a limit on consecutive failures.

Account deletion invokes Supabase Edge Function `delete-account` before local session sign-out/cleanup. The replacement must define an authenticated, server-side deletion lifecycle and must not simply delete the Firebase Auth identity while leaving D1/Firestore/user-owned data behind. Device pairing requires a Firebase-compatible, one-time exchange and explicit user approval; it is not equivalent to copying the old Supabase token exchange.

## Additional evidence limitation

The above confirms client parameters and expected response shapes, not upstream implementation details. PIN hashing, credential encryption at rest, membership entitlement source-of-truth, profile deletion cascade, device-code entropy/expiry/replay protection, and account-deletion cascade remain unverified until server-side definitions or authorized behavior tests are available.


## 2026-11-13 — Remaining sync, plugin, device-registration, and realtime audit

### Plugins

Source: `composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginRepository.kt`

- Pull reads the PostgREST `plugins` table, filters by `profile_id`, and orders by `sort_order`.
- Push uses RPC `sync_push_plugins` with `p_profile_id` and a serialized plugin-repository list, plus sync-origin client metadata.
- The client stores repository manifest URLs and scraper state locally; it fetches manifest/scraper code from those repository URLs and caches scraper code locally. Do not assume scraper source code is stored in the Supabase row.
- The inspected Android Play Store and iOS App Store platform actuals are no-op/unavailable implementations for plugin repository operations; the full implementation is in `fullCommonMain`. Preserve current platform gating rather than assuming every target supports plugins.

### Home catalogue settings

Source: `features/home/HomeCatalogSettingsSyncService.kt`

Verified RPCs:
- `sync_pull_home_catalog_settings` with `p_profile_id` and `p_platform`.
- `sync_push_home_catalog_settings` with `p_profile_id`, `p_platform`, `p_settings_json`, and sync-origin metadata.

The payload includes catalogue ordering/enabled state/custom titles and collection entries. The client merges remote and local JSON keys and preserves local defaults for absent fields. The server replacement must retain platform scoping and merge/unknown-field behavior.

### Media-server credentials and metadata

Sources: `features/servers/ServerRepository.kt`, `features/servers/ServerSync.kt`, and `core/sync/MediaServerSync.kt`.

- Sync uses `sync_pull_media_servers` and `sync_push_media_servers`; pull sends `p_profile_id`, while push sends `p_profile_id`, `p_servers`, and sync-origin metadata.
- The serialized `SyncedServer` model includes a `token` field alongside provider/server/user identifiers, address, username, library selection, and settings. The repository separately stores local credentials under a credential reference, but the sync snapshot resolves those credentials into the serialized token field.
- Treat this as a high-sensitivity secret: replacement storage must encrypt tokens at rest, never log them, enforce Firebase UID/profile ownership, and use a narrowly scoped API. The legacy source does not reveal whether upstream storage encrypts these values.

### Device registration

Source: `core/auth/DeviceSessionRegistration.kt`

- Authenticated non-anonymous clients call RPC `register_current_device`.
- Parameters: `p_installation_id`, `p_client_name`, `p_client_version`, `p_platform`, and `p_device_name`.
- Registration is throttled locally by an interval unless forced. The replacement should use a stable installation identifier, derive UID from the Firebase token, and define device revocation/retention behavior.

### Watch Party realtime transport details

Source: `features/party/PartyChannel.kt` and `features/party/PartyRepository.kt`.

- The client opens a private Supabase Realtime channel named `watch-party:<partyId>`.
- Broadcast acknowledgements and own-broadcast delivery are disabled. Presence uses the party member ID as its key.
- The subscribed event set is `state`, `state_request`, `status`, `control`, `member_joined`, `member_left`, `ended`, `media`, `stream`, and `chat`. The companion event set is `chat`, `media`, `member_left`, and `ended`.
- The client tracks presence, broadcasts JSON payloads, monitors subscription state, and removes the channel on close. Durable Objects must preserve private-room membership checks, presence join/leave semantics, event fan-out, reconnect behavior, and the existing payload/event contract.

### Add-on and plugin storage distinction reaffirmed

- User-installed add-ons are read from the profile-filtered `addons` table and pushed through `sync_push_addons`.
- Plugin repositories are read from the profile-filtered `plugins` table and pushed through `sync_push_plugins`.
- Both are separate from the shared admin-managed Firestore `addons/{addonId}` catalogue. The migration must not collapse these three concepts into one collection.

### Remaining uncertainty

These are verified client calls and serialized fields only. The upstream SQL schema, RLS policies, trigger behavior, secrets-at-rest controls, device registration lifecycle, and Realtime authorization remain unknown. No upstream account/dashboard access was used or assumed.


## 2026-11-13 — Supabase Storage and member-asset compatibility audit

### Profile avatar catalog and protected assets

Source: `features/profiles/AvatarRepository.kt`

Verified client operations:
- `get_avatar_catalog` returns the standard avatar catalogue.
- `get_member_profile_avatar_catalog` returns supporter/member avatar metadata including ID, display name, storage path, category, sort order, background color, and asset version.
- Member avatar binary assets are downloaded from Supabase Storage bucket `membership-profile-avatars` using authenticated downloads and cached locally.
- For sharing a member-only avatar, the client creates a signed URL with a one-day lifetime. Standard avatar URL handling is separate from this member-only signed-URL path.
- The app caches catalogue metadata and downloaded assets, and gates member avatars on membership entitlements.

### Profile background catalog and protected assets

Source: `features/membership/ProfileBackgroundRepository.kt`

Verified client operations:
- `get_member_profile_background_catalog` returns metadata including ID, display name, landscape storage path, optional portrait storage path, and asset version.
- Landscape and optional portrait images are downloaded from Supabase Storage bucket `membership-profile-backgrounds` using authenticated downloads and cached locally.
- If a portrait asset cannot be loaded, the client falls back to the landscape image.
- The repository preloads/caches images and updates local presentation from cached assets.

### Replacement requirements

- Add explicit Worker API routes for the two catalogue reads and protected asset access, or another reviewed delivery mechanism with equivalent authorization.
- Store only metadata and object references in D1/Firestore; store image objects in R2, not image bytes in D1.
- Preserve member entitlement gating, asset version/cache invalidation, portrait-to-landscape fallback, and one-day sharing semantics where sharing is supported.
- Do not make supporter assets public merely to simplify migration. Use authenticated short-lived delivery URLs or a Worker authorization proxy.
- Preserve existing local caches during transition so an unavailable remote asset does not erase a previously downloaded image.
- No upstream Supabase bucket policy, object ACL, or signed URL validation configuration was available from client source. Those legacy server-side rules remain unknown.
