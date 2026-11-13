# WatchAtHomeV2 Changelog

Entries are append-only. Do not rewrite or remove earlier records.

## 2026-11-13 — Profile backend APIs

- Added authenticated profile list/upsert/delete and profile-lock routes to the existing Cloudflare Worker.
- Added profile-settings GET/PUT synchronization with JSON round-trip preservation, including unknown/future keys.
- Enforced Firebase UID ownership, active-account/profile checks, six-profile bounds, request-size limits and rate limiting; enabled PUT/DELETE in Worker CORS.
- Added profile storage and HTTP tests. GitHub Actions run 43381569837 passed TypeScript and all 52 tests (0 failures).
- D1 remains draft-only and unprovisioned. No mobile Supabase adapter, production setting, secret, or deployment was changed.
