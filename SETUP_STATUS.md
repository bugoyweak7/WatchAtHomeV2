# WatchAtHome Setup Status — Handoff Notes

Last reviewed: 2026-11-13 (Asia/Manila)
Working branch: `setup/firebase-cloudflare-zero-cost`
Base branch: `repair/firebase-entitlements-and-auth`

## Approved architecture
- Firebase Authentication: email/password identity.
- Cloud Firestore: premium codes, user entitlements, immutable 7-day trial, admin roles, and the existing shared add-ons catalogue.
- Cloudflare Workers: trusted APIs and Firebase ID-token verification.
- Cloudflare D1: high-volume app data and sync.
- Cloudflare R2: user-uploaded images/files. Use external TMDB artwork URLs where possible; do not copy entire TMDB catalogue into Firestore.
- Cloudflare Durable Objects: Watch Party realtime state/messaging.
- Target is $0 using Firebase Spark and Cloudflare free allowances. Free tiers have limits; no unlimited/guaranteed zero-cost promise.

## What was scanned
- Repository tree: 2,395 entries; complete Git tree returned (not truncated).
- Authentication: `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthRepository.kt`.
- Backend provider: `core/network/SupabaseProvider.kt`, `SupabaseEndpointConfig.kt`.
- Android Firebase bridge: `core/network/FirebaseBackend.android.kt` exposes FirebaseAuth and FirebaseFirestore.
- Membership currently calls Supabase RPCs `get_my_member_access` and `get_my_membership_overview`.
- Watch Party currently calls Supabase RPCs and Supabase Realtime.
- SyncManager coordinates profile settings, provider credentials, add-ons, plugins, library, collections, home catalogue settings, and media servers.
- Prior source audit also identified Supabase dependencies for profiles, add-ons, library, watch progress, watched items, collections, device registration/linking, media servers, provider credentials, and account deletion.
- No Firestore rules file or Supabase database migrations/Edge Function source were found in this repository scan.

## Important current-state finding
This user app is NOT yet migrated to Firebase/Cloudflare. The Firebase Android bridge exists, but AuthRepository and SupabaseProvider still use Supabase. Do not remove Supabase until every current feature and API contract has a replacement and migration tests pass. Preserve email/password-only registered-account policy; no anonymous/guest auth.

## Data placement
- Firestore: `admins/{uid}`, `users/{uid}`, `premium_codes/{sha256(code)}`, existing `addons/{addonId}`, small app config.
- D1: profiles, profile settings, user add-ons sync (if distinct from admin catalogue), library references, watch progress, watched items, collections, home catalog settings, encrypted provider credentials, media-server metadata, registered devices, TV pairing sessions, sync events/cursors.
- R2: uploaded images/files only. Do not store movie/video binaries or image bytes in Firestore/D1.
- Durable Objects: party presence, coordination and messages.

## Existing business rules to preserve
- Registered Firebase email/password accounts only; no anonymous access.
- Trial is 7 days from verified account creation timestamp, immutable and non-resettable.
- Premium code is single-use, activation window 24h + 15min, selected duration; redemption extends an existing active entitlement.
- Existing product access/entitlement UI must remain compatible during migration.

## Cost and read/write controls
- Cache add-on/configuration reads; refresh only when changed.
- Never poll Firestore frequently for entitlement status; fetch on login, redemption, renewal, or controlled refresh.
- Keep watch progress/history/high-frequency sync in D1, batch writes, use delta cursors and bounded pagination.
- Avoid full per-user movie catalog copies. Store only user-specific references/settings.
- Use R2 or remote artwork URLs for image assets.
- Apply retention to pairing sessions and sync events; add Worker rate limits and request bounds.

## Work created in this setup branch
- A copy of the initial D1 schema is in the Premium Worker repository under `migrations/0001_initial.sql`.
- A detailed architecture note is in the Premium Worker repository as `ARCHITECTURE.md`.
- This file is the User App handoff note only. No app code migration has been performed.

## Not done / do not assume
- No Cloudflare account resources were created or inspected: D1 database, R2 bucket, Durable Object namespace, Worker deployment, routes, secrets, and bindings remain unverified.
- No Firebase Console state/rules/usage/billing were inspected or changed.
- No Firestore rules were published or validated.
- No D1 migration has been applied.
- No app build, automated test, integration test, or deployment was run in this handoff.
- No production data or billing configuration was changed.

## Next steps
1. Inventory Firebase project, Spark plan, Authentication providers, Firestore collections, current rules, indexes, and usage (read-only first).
2. Inspect Cloudflare account resources and free-plan availability (read-only first).
3. Finish mapping every Supabase API/RPC/Realtime/Edge Function contract before replacing any adapter.
4. Build a Cloudflare application Worker with Firebase token verification and D1 ownership enforcement.
5. Test locally against local D1; add migration/rollback and export/backup plan.
6. Migrate feature adapters incrementally; preserve all player/add-on/subtitle/catalog functionality.
7. Run tests and builds; no production deployment without separate approval.

## 2026-11-13 — Authentication migration execution audit (GO authorized)

### Additional source files verified
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthRepository.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthModels.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/AuthStorage.kt`
- `composeApp/src/androidMain/kotlin/com/nuvio/app/core/auth/AuthStorage.android.kt`
- `composeApp/src/iosMain/kotlin/com/nuvio/app/core/auth/AuthStorage.ios.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/DeviceLinkAuthRepository.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/auth/AuthScreen.kt`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/storage/LocalAccountDataCleaner.kt`
- `composeApp/src/androidMain/kotlin/com/nuvio/app/core/network/FirebaseBackend.android.kt`
- `composeApp/build.gradle.kts` and `gradle/libs.versions.toml`

### Confirmed Firebase readiness
- GitLive Firebase Auth and Firestore dependencies (2.8.0) are already declared in commonMain.
- Native Firebase Auth and Firestore dependencies are already declared for Android.
- Android Google Services configuration identifies project `watchathome-admin`.
- iOS `GoogleService-Info.plist` exists in the repository.
- The common auth repository can use the existing multiplatform Firebase SDK, subject to initialization and platform build verification.

### Confirmed authentication behavior and migration blockers
- `AuthRepository` still uses Supabase session status, email/password sign-in/up, session refresh, sign-out, and Supabase Edge Function account deletion.
- A locally generated anonymous UUID is accepted as an authenticated app state; this violates the approved registered-account-only policy.
- `AuthScreen` still exposes “Continue without account” and calls `signInAnonymously()`.
- `DeviceLinkAuthRepository` currently obtains and imports a Supabase access/refresh-token session. It is not compatible with Firebase Auth without a server-side Firebase token-exchange/device-link flow.
- Existing data repositories and sync still depend on Supabase authentication and Supabase RLS/RPC/Edge Functions. Switching only the login provider would leave authenticated data operations without a valid Supabase session.
- Account deletion currently calls the Supabase `delete-account` function. Replacing this with Firebase Auth user deletion alone would leave backend data orphaned and would not provide a complete account-deletion workflow.
- Existing local account cleanup wipes substantial user data. It must only run after the new server-side account/session action succeeds, and must not run during a failed migration/sign-in.

### Execution decision
- GO authorization received for Priority 1.
- No application source code, Firebase project settings, backend resources, or production data were changed in this audit.
- Do NOT replace `AuthRepository` in isolation. That would break Supabase-backed data sync, device-link login, and account deletion.
- The safe implementation sequence is:
  1. Define and implement the Cloudflare authentication/device-link/account lifecycle contract, including Firebase ID-token verification and ownership.
  2. Add Firebase email/password auth and session state to the User App using the already-declared GitLive dependency.
  3. Remove the anonymous/local-UUID sign-in path and its “Continue without account” UI.
  4. Migrate device-link exchange to Firebase-compatible authentication before removing its Supabase session dependency.
  5. Replace Supabase account deletion with a server-authorized deletion workflow covering D1/Firestore and Firebase Auth.
  6. Keep Supabase data adapters until each corresponding API/RLS/RPC dependency has a tested Cloudflare replacement.
  7. Run Android and iOS compilation plus auth/session/device-link/account-deletion tests before marking migration complete.

### Next implementation gate
Build the Firebase-authenticated Cloudflare account/device-link lifecycle endpoints and document the API contract before changing the User App authentication provider. Preserve the existing player, add-on, subtitle, catalogue, profile, and sync behavior throughout.
