# WatchAtHomeV2 Project Status

Last verified: 2026-11-13 (Asia/Manila)
Repository: `bugoyweak7/WatchAtHomeV2`
Baseline branch: `setup/firebase-cloudflare-zero-cost`
Verified branch head: `c4b106b8b994154208d2672f381750cf29665352`
Status: Migration in progress. This document records verified repository state, not live Firebase or Cloudflare account state.

## Repository scope

- User App: `bugoyweak7/WatchAtHomeV2`
- Admin App: `bugoyweak7/WatchAtHomeAdmin`
- The old `WatchAtHomeV2-Firebase-Migration` repository is not the active baseline.
- Admin source was inspected on its `main` branch. Its app module uses Firebase Authentication and Cloud Firestore.

## Verified User App state

### Firebase

- Android Firebase configuration exists at `androidApp/google-services.json` and `androidApp/src/debug/google-services.json`.
- The configuration identifies Firebase project `watchathome-admin`.
- Firebase Auth and Firestore dependencies are declared for Android.
- `FirebaseBackend.android.kt` exposes Android `FirebaseAuth` and `FirebaseFirestore` instances.
- The main `AuthRepository` has not migrated: it still calls `SupabaseProvider` for session status, email/password sign-up/sign-in, sign-out and session validation.
- `AuthRepository.signInAnonymously()` and local anonymous-user ID handling remain in source.
- Common-source GitLive Firebase Auth/Firestore dependencies are declared, but the inspected main authentication repository still uses Supabase.

### Remaining Supabase dependencies

- `SupabaseProvider.kt` still creates the Supabase client and installs Auth, Postgrest, Functions, Storage and Realtime.
- Runtime configuration still generates `SupabaseConfig.kt` from Supabase URL/key settings.
- Profile, library and watch-progress Supabase adapters remain in the repository.
- Supabase dependencies remain in the version catalog and common source-set dependencies.
- Do not remove these until replacement behavior, tests, and cutover are verified independently.

### Cloudflare Worker and premium

- Worker source: `premium-worker/src/index.ts`.
- Worker config: `premium-worker/wrangler.toml`.
- Worker package: `premium-worker/package.json`.
- Worker uses Firebase ID-token verification and Firestore REST operations for premium codes, trial initialization and premium status.
- Worker code includes account bootstrap, device registration/listing, profile APIs, profile settings, add-ons, plugins, collections, profile PINs, provider credentials and media-server routes.
- The Worker requires a Firebase service-account JSON secret. Repository source does not prove that the secret is configured in the live Cloudflare account.
- The Worker reads/writes D1 through an optional `DB` binding in its environment. The inspected `wrangler.toml` has no D1 database binding.
- Draft D1 schema and Worker modules exist. Existing changelog records explicitly say D1 is draft-only and unprovisioned.
- `workers_dev = true` is present in configuration. This is not proof that the current source has been deployed or that a production route is active.
- Worker token validation currently requires Firebase `sign_in_provider == "password"`. Device-link/custom-token support is not implemented in the inspected route set.

### Firestore and rules

- Worker premium operations use the `users/{uid}`, `admins/{uid}` and `premium_codes/{codeHash}` documents in project `watchathome-admin`.
- The Worker README requires non-admin reads/writes to `premium_codes` to be denied by Firestore rules.
- No `firebase.json` or Firestore rules file was found in the inspected User App branch tree.
- No Firestore rules file was found at the standard root paths inspected in the Admin repository. Live deployed rules have not been inspected; repository absence does not establish the live rules state.

## Verified Admin App state

- Repository: `bugoyweak7/WatchAtHomeAdmin`, inspected on `main`.
- `app/build.gradle.kts` declares Firebase Auth and Firestore.
- `app/google-services.json` identifies the same `watchathome-admin` Firebase project and Admin package `com.tapframe.watchathomeadmin`.
- `MainActivity.kt` uses Firebase Auth and Firestore.
- Add-ons management source reads and writes the shared `addons` Firestore collection and reports that active admin authorization is expected through `admins/{uid}` with `role=admin` and `active=true`.
- The Admin repository's latest inspected main-branch commit is `d3d0147317a1a27a0dfe8260735a7997a6920aa5` (2026-11-11). This is repository commit evidence, not a live deployment/build check.

## Existing test evidence

The existing `CHANGELOG.md` records GitHub Actions run `43382547116` passing TypeScript compilation and 61 Worker tests on 2026-11-13. This is historical CI evidence from the changelog, not a new test run performed during this audit.

## Next safe work

1. Complete a source-level inventory of every Supabase auth, account, profile, sync, membership and Watch Party call.
2. Define and test Firebase email/password authentication and account bootstrap before switching the app.
3. Preserve local account data and sync behavior throughout cutover; do not delete legacy adapters yet.
4. Complete and test each Worker route against the legacy contract before switching its adapter.
5. Decide whether D1 is actually needed for each data class; keep the lowest-cost viable Firebase Spark/Cloudflare Free design and do not provision resources without a separate reviewed decision.
6. Add and validate Firestore rules before relying on client Firestore access.
7. Verify live Cloudflare bindings, secrets, deployment and Firebase settings separately; repository files alone cannot prove live account state.

## Change control

- Project status and changelog are append-only records.
- Never remove or rewrite historical entries.
- Preserve existing app behavior unless a specific change is approved.
- No code, Firebase rules, Cloudflare resources, secrets, or deployments were changed by this status audit.
