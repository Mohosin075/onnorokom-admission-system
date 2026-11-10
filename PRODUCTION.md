# Production deployment and operations

## Required real configuration

Populate the ignored `.env` from `.env.example` using the institution's own values. Keep provider secrets in the deployment environment/secret manager and restrict access to that environment and Docker host. Never commit `.env`, upload data, database dumps or data-protection keys.

The production Compose overlay explicitly disables local demo account provisioning. `.invalid` account logins and sessions are rejected outside Development/Testing. Keep `DEMO_ACCOUNTS_ENABLED=false` and omit its password on the production host. Use a fresh production database with institution-owned accounts.

- `INSTITUTION_NAME`: real institution name printed on receipts/cards.
- `PUBLIC_DOMAIN`: public hostname, without scheme or path. Point its DNS to the server and permit inbound ports 80/443.
- `PUBLIC_URL`: `https://` plus that hostname. Used in emails and Stripe return URLs.
- `TLS_EMAIL`: real contact email for TLS certificate issuance.
- `POSTGRES_PASSWORD`: unique random database password. Changing this variable does not change an existing PostgreSQL user's password; rotate it in PostgreSQL too.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: real administrator. Bootstrap creates it only if that email is absent, and does not promote an existing student account. Remove the bootstrap password after initial provisioning and restart the backend.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`: authenticated TLS SMTP. Configure SPF/DKIM/DMARC with the provider. Registration remains unavailable without SMTP; verification cannot be bypassed by the UI.
- `STRIPE_SECRET_KEY`: a live `sk_live_` key belonging to the institution's eligible Stripe merchant account. Stripe account eligibility, BDT charge support and fees must be confirmed with Stripe for that merchant; this application cannot provision a merchant account.
- `STRIPE_WEBHOOK_SECRET`: the live endpoint signing secret, beginning `whsec_`.
- Optional `SMS_API_KEY`, `SMS_SENDER_ID`: BulkSMSBD credentials. Confirmed admissions queue SMS; unconfigured/failed SMS stays visibly pending and eventually failed, never falsely delivered. Other SMS providers require their own adapter.

Start with:

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml up --build -d --wait
```

The Caddy gateway obtains TLS certificates and proxies `/api/` directly to the backend. Cookies are Secure/HttpOnly, mutations require antiforgery tokens, and production Swagger is disabled. Only configured reverse proxies (`172.29.210.4` and `.5`) may supply forwarded client addresses/protocol. The Docker network uses `172.29.210.0/24`; if that subnet conflicts with existing infrastructure, change the Compose network/static IPs and the trusted proxies in `PortalSetup.cs` together. Do not expose port 8080 publicly or bypass the TLS gateway.

## Stripe commissioning

Register `https://YOUR_REAL_DOMAIN/api/payments/stripe/webhook` in the institution's live Stripe dashboard for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Use the endpoint's own signing secret, not a different endpoint or a local Stripe CLI secret. Signed payloads have a five-minute freshness tolerance and use the unmodified request body. The server independently retrieves the Checkout Session, requires live paid status, checks the saved checkout ID, exact BDT amount and application payment reference, and serializes seat confirmation using PostgreSQL locks.

Checkout creation uses a persisted idempotency key. Duplicate callbacks cannot confirm or notify twice. A payment received after the hold has expired is recorded as `RefundRequired` and automatically refunded through Stripe using a separate stable idempotency key. A refund that is pending or rejected remains in the administrator Payments queue for retry; staff must investigate it in Stripe. Do not manually allocate a seat beyond its capacity to resolve a late payment.

Use the institution's approved acceptance process for any real payment verification. No real charge is executed by setup or automated tests. Before accepting applicants, verify the full live checkout/webhook/refund flow with authorized real details and real-domain callbacks. See [Stripe fulfillment documentation](https://docs.stripe.com/checkout/fulfillment) and [webhook signature verification](https://docs.stripe.com/webhooks/signatures).

## Data protection and backups

Back up `portal_data` (PostgreSQL), `portal_uploads` (private documents), and `portal_keys` (cookie/data-protection keys). Keep an encrypted off-machine copy under institution-controlled access, set a retention policy for student documents, and perform a restore drill before launch. Caddy certificate state is in `caddy_data`/`caddy_config`. Database and document volumes must be on encrypted storage; data-protection key files require restricted access. Supply an institution-managed certificate/KMS integration for key encryption at rest if required by its environment.

`docker compose down` preserves volumes. `down --volumes` intentionally deletes admissions and documents and must not be used in production. PostgreSQL credentials are for the private Compose network; no database port is published. For a managed database, configure a restricted application database role and TLS connection string outside Compose.

The outbox uses `FOR UPDATE SKIP LOCKED`, retries with exponential backoff and exposes failures. Provider acceptance is recorded as sent; inbox/SMS-device delivery is ultimately the provider's responsibility. SMTP can deliver a duplicate if the process stops after provider acceptance but before its database commit, so notification text must remain safe to repeat.

Document upload permits PNG/JPEG signatures only, enforces size limits, stores random filenames outside the web root and serves authenticated image previews and attachment downloads with `nosniff`. Each upload creates an immutable version; a submitted application references the exact selected files and profile snapshot. Unsubmitted uploads do not enter the admin review queue. Review happens before reservation, without consuming seat capacity. Application decisions require the expected submission version, document acknowledgment for approval, and feedback for corrections/rejection. This is not an antivirus scanner or government birth-registry verification. If institutional policy requires malware scanning or content-disarm processing, provision it before accepting documents.

## Launch boundary

The code and isolated tests can be verified without external credentials. Actual merchant activation, email/SMS delivery, public-domain TLS issuance, institutional document review, restore testing and production acceptance remain external deployment work. A supplied credential is not evidence that its provider is operational.
