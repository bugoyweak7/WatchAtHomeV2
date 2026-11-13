# WatchAtHome D1 Security Review

**Date:** 2026-11-13  
**Scope:** Draft `premium-worker/schema/0001_account_data.draft.sql`, current Worker account/device endpoints, and proposed account migration routes.  
**Status:** Review findings documented. No D1 database exists, the SQL remains a draft, and no production resource was changed.

## Executive decision

The draft is a reasonable structural starting point, but it is **not ready to apply to a live D1 database**. The first account/device routes can remain disabled until the blocking controls below are implemented and tested. Do not store provider credentials, media-server tokens, or profile PIN verifier data in D1 until the relevant cryptographic and abuse-control designs are finalized.

## Findings and required controls

### Critical before storing secrets

1. **Provider credentials and media-server tokens have storage columns but no encryption implementation yet.**
   - Tables: `provider_credentials`, `media_servers`.
   - Required: authenticated encryption (AES-GCM or an equivalently reviewed AEAD), server-held key material in Cloudflare secrets, explicit key versioning/rotation, a fresh unique nonce per encryption, and authenticated additional data bound to UID/profile/provider-or-server key.
   - Never log plaintext credentials, return them to another profile, or put them in generic JSON metadata.
   - Keep token fields all-null or all-present; reject incomplete tuples. Add ciphertext/nonce length constraints before applying the schema.

2. **Profile PIN verifier format is unresolved.**
   - Table: `profile_pin_credentials`.
   - Legacy hash algorithm and server-side semantics are unknown.
   - Select a modern password/PIN KDF with per-record salt and reviewed work factor; do not store raw PINs or reversible PIN encryption.
   - Enforce per-profile and per-account attempt throttling, persisted lockout, constant-time verifier comparison, generic failure responses, and a recovery path requiring recent Firebase reauthentication where applicable.
   - The database columns alone do not provide these controls.

### High priority before device-link implementation

3. **Device-link secrets need stronger design than plain hashes alone.**
   - Table: `device_link_sessions`.
   - Device/user code and nonce generation must have sufficient entropy; short human-readable user codes need keyed HMAC storage or equivalent protection plus strict per-session/IP/account rate limits because a plain hash of a low-entropy code can be brute-forced after a database leak.
   - Enforce expiry, one-time consumption, nonce binding, failed-attempt lockout, replay rejection, and atomic state transitions.
   - Validate `redirect_base_url` against an explicit HTTPS origin allowlist. Never use arbitrary user-provided URLs for server-side fetches or redirects.
   - Firebase custom-token exchange must carry a server-issued claim proving a one-time approved device-link flow; do not weaken the email/password-only token policy globally.

### High priority before generic profile/sync APIs

4. **Worker ownership is the authorization boundary; D1 has no per-user row policy.**
   - Every query and mutation must bind UID from the verified Firebase token, never from request JSON/query parameters.
   - Profile routes must resolve `profile_index` under the same verified UID and use composite ownership keys. Test cross-account reads, writes, deletes, and guessed profile IDs.
   - Keep batches, payload sizes, page sizes, and JSON depth/shape bounded. Validate allowlisted fields per resource.

5. **Generic JSON columns can accidentally become secret containers.**
   - Columns include `profiles.payload_json`, `profile_settings.payload_json`, `collections.collections_json`, `home_catalog_settings.settings_json`, and `media_servers.metadata_json`.
   - Explicitly exclude PINs, provider credentials, media-server access tokens, Firebase tokens, and session secrets from these blobs. Keep sensitive values in dedicated encrypted/verifier columns.
   - Enforce schema versions and reject unexpected secret-bearing fields rather than blindly accepting arbitrary client JSON.

6. **Device inventory is not remote sign-out.**
   - `registered_devices` stores metadata and a revocation timestamp, but current Firebase bearer-token verification is not installation-bound and does not revoke refresh tokens.
   - Do not expose a "revoke device" promise until session binding, Firebase refresh-token revocation/claims strategy, and subsequent request rejection are implemented and tested.
   - Add device-count limits and rate limits before public registration is enabled.

### Lifecycle, retention, and operational controls

7. **Account deletion spans systems outside D1.**
   - D1 cascades cover D1-owned rows only. They do not remove R2 objects, Durable Object party state, Firestore membership/premium data, Firebase Auth identity, or other external resources.
   - Implement an idempotent deletion worker/state machine using `account_deletion_jobs`; mark account deletion pending and block access first, clean each external resource with retryable steps, and delete Firebase Auth identity only at the approved final stage.
   - Ensure logs and tombstones retain only the minimum necessary identifiers and expire them under a documented policy.

8. **Sync tombstones and idempotency records need explicit retention.**
   - `sync_events` and soft-deleted rows must remain long enough for offline clients to receive deletes, then be pruned by a scheduled, bounded cleanup.
   - `idempotency_keys` need bounded TTL cleanup and response-size limits.
   - Define cursor expiry/reset behavior before mobile sync is switched.

9. **Request-level abuse controls are incomplete in the existing Worker.**
   - Current CORS allows `*`; bearer-token mobile requests do not require cookie credentials, but web Admin origins should be restricted to configured origins before browser use.
   - Premium-code creation/redemption currently parse JSON without the bounded parser used by device registration. Add body limits, structured 400 responses, and rate limits before broader exposure.
   - Add rate limits to public party preview, code redemption, device-link polling, PIN verification, and device registration.
   - Consider Firebase token revocation/disabled-user checks for sensitive operations; current JWT signature/issuer/audience validation is not a full per-request Firebase revocation check.

10. **Operational configuration is incomplete for the new endpoints.**
    - `wrangler.toml` currently has no D1 binding. `Env.DB` is optional and new D1 routes fail closed with 503.
    - `FIREBASE_SERVICE_ACCOUNT_JSON` must remain a Cloudflare secret with least-privilege Firestore IAM.
    - `FIREBASE_WEB_API_KEY` is required by the account bootstrap registration lookup; confirm it is configured as a Worker variable/secret before enabling bootstrap. It is not present in the committed `wrangler.toml`.
    - Do not add real secrets to Git or the repository.

## Draft schema hardening recommended before migration

- Add database-level length/format checks for device IDs and SHA-256/HMAC digest columns.
- Add nonce/ciphertext length checks for AEAD fields (for example, 12-byte AES-GCM nonce and at least 16-byte authentication tag).
- Add PIN hash/salt non-empty/minimum-length checks once the selected KDF is finalized.
- Add temporal/state consistency checks for device-link sessions (`expires_at > created_at`, approved/consumed timestamps consistent with state).
- Add timestamp and TTL constraints where they can be defined without breaking legitimate legacy payloads.
- Add tests for every new CHECK/FK and for deletion retries/retention.

## What passed and what remains unverified

- GitHub Actions run `43377044568` passed TypeScript compilation and 20 tests (9 schema, 6 SQLite-backed D1 mock, 5 Worker HTTP/Firebase-token tests).
- Tests use generated test signing keys and in-memory SQLite. They are not live Firebase, Firestore, or Cloudflare D1 integration tests.
- No D1 database or binding exists; the draft has not been applied.
- No real user data, credentials, Firebase configuration, Cloudflare settings, mobile adapters, or production deployment were changed.

## Approval gates

1. Resolve the critical encryption and PIN-verifier designs.
2. Add the schema constraints and tests.
3. Complete deletion, retention, rate-limit, and device-link contracts.
4. Obtain explicit approval to create the D1 database, add its binding, and apply the reviewed migration.
5. Run a live D1 smoke test with test-only data before enabling app adapters.


## Implementation update — AES-GCM primitive available, integration still blocked

The Worker now contains `premium-worker/src/data-crypto.ts`, a versioned AES-256-GCM primitive. It uses a fresh 12-byte nonce, 128-bit tag, and authenticated additional data bound to Firebase UID, profile index, resource, and record key. New encryption uses the active key version; decryption can retain older key versions during rotation.

CI run `43377463012` passed 5 encryption tests covering round-trip, cross-user/profile/record substitution rejection, ciphertext tampering, key rotation, and invalid/missing keys. This reduces the cryptographic implementation gap but does not close it: the primitive is not yet integrated into credential/media-server routes, key-ring secrets are not configured, D1 columns are still draft-only, and no secret data has been stored. Keep the critical gate open until integration and route-level tests pass.
