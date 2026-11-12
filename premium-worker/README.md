# WatchAtHome Premium API

This Worker uses the existing Firebase project `watchathome-admin`. Firebase Authentication remains the identity provider and Firestore remains the premium source of truth. Cloudflare only hosts trusted server-side operations.

## Endpoints

- `GET /health` — service health.
- `POST /v1/admin/premium-codes` — active Firebase administrators create codes. JSON: `{"count":5,"durationDays":30}`.
- `POST /v1/premium/redeem` — signed-in user redeems JSON: `{"code":"WAH-XXXX-XXXX-XXXX"}`.
- `GET /v1/premium/status` — signed-in user's current entitlement.

All endpoints except health require a Firebase Authentication ID token in the Authorization Bearer header. Admin code creation additionally checks `admins/{uid}` with `role == "admin"` and `active == true`.

## Firestore documents

- `premium_codes/{sha256(normalizedCode)}` stores code state. Raw codes are returned once at creation and are not stored.
- `users/{uid}` stores `premium`, `premiumExpiresAt`, and `premiumUpdatedAt`.

Codes have a 24-hour activation window and a duration selected by the admin. Redeemed codes are single-use. A new code extends an existing active entitlement rather than shortening it.

## Configure and deploy

1. In Google Cloud Console for project `watchathome-admin`, create a dedicated service account for this Worker.
2. Grant only the Firestore permissions needed to read/write `admins`, `premium_codes`, and `users`, and use the project service-account credentials only as a Cloudflare secret. Do not commit the JSON key.
3. From this directory run `npm install`.
4. Run `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` and paste the complete service-account JSON.
5. Run `npm run check`, then `npm run deploy`.

The service account's IAM permissions bypass Firestore Security Rules. The Worker therefore performs its own Firebase ID-token and admin-document checks. Never expose the service-account key to either mobile app.

## Client integration

Mobile clients must fetch a fresh Firebase ID token and call the endpoints over HTTPS. The User app must display premium only from the server response or the mirrored user entitlement fields protected by Firestore rules. Do not allow client-side writes to `premium`, `premiumExpiresAt`, or `premium_codes`.

This Worker is not deployed by committing it to GitHub. Configure the secret and deploy it from Cloudflare after reviewing the required IAM permissions.
