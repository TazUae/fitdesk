# Environment Variable Reference

Single source of truth for FitDesk runtime config. Validated at container startup by `scripts/env-validate.mjs` (mirrored in `lib/env.ts` for Next.js runtime use).

**No values are stored here.** Names and behavior only. Real values live in `.env` (never committed). Local dev defaults live in `.env.example`.

## Required (production strict)

These vars MUST be set with a real, non-placeholder value when `NODE_ENV=production`. Startup throws otherwise. In non-production, missing values are warnings, not errors.

| Name | Min length | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | 32 | Better Auth signing secret. Generate with `openssl rand -base64 32`. |
| `DATABASE_URL` | — | libsql/SQLite URL for the auth + app DB. `file:./auth.db` (local), `file:/app/data/auth.db` (Docker), `libsql://...turso.io` (production multi-instance). |
| `CONTROL_PLANE_URL` | — | Internal URL of the Control Plane API. Local: `http://localhost:4000`. Docker: `http://cp-api:4000`. |
| `CONTROL_PLANE_API_KEY` | 16 | API key for CP management endpoints (`/tenants`, `/jobs`). **MUST match the same value on the Control Plane.** Mismatch → 403 from CP. |
| `FITDESK_JWT_SECRET` | 32 | HMAC-HS256 secret used to sign per-tenant JWTs for the ERP proxy. **MUST match the same value on the Control Plane.** Mismatch → 401 from CP on ERP calls. Generate with `openssl rand -hex 32`. |

## Placeholder rejection

The startup validator rejects any required value matching:
- `/^dev-only-/i`
- `/^build-only-placeholder-/i`
- `/^REPLACE-?ME/i`
- `/^changeme/i`
- `/^your-/i`

In production. Always-allowed in non-production (so a contributor's `.env.example`-derived `.env` doesn't block local dev).

## Optional (warn if missing in production)

| Name | Effect when missing |
|---|---|
| `EVOLUTION_API_URL` | WhatsApp send disabled. Settings page shows "WhatsApp not configured". |
| `EVOLUTION_API_KEY` | Same as above. |
| `WHISH_API_URL` | Whish payment links disabled. Cash and bank transfer remain. |
| `WHISH_API_KEY` | Same as above. |
| `WHISH_MERCHANT_ID` | Same as above. |
| `ANTHROPIC_API_KEY` | Message composer falls back to professional templates instead of Claude-generated drafts. |
| `TRAINER_DEFAULT_TIMEZONE` | Defaults to `UTC` when Trainer Settings has no timezone. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in disabled. Email/password still works. |

## Pilot mode (5.0.6)

| Name | Default | Description |
|---|---|---|
| `PILOT_MODE` | `false` | When `true`: dashboard banner, **all** WhatsApp message types require explicit confirm, allowlist enforcement (below). |
| `FITDESK_ALLOWED_TEST_PHONE` | — | Pilot mode only: exact-match destination allowlist. E.164 digits only, no `+`. Example: `971501234567`. |
| `FITDESK_ALLOWED_TEST_PHONE_PREFIXES` | — | Pilot mode only: comma-separated prefix allowlist. E.164 digits only. Example: `+961,+1555` is wrong — use `961,1555`. Prefix matching is opt-in. |
| `PILOT_ALLOW_EXTERNAL_PAYMENTS` | `false` | Pilot mode safety flag for any future external payment-write paths (link generation is fine; record-payment hits ERP only). Today no-op; documented for forward compatibility. |

**Pilot allowlist behavior:**
- `PILOT_MODE=true` and **neither** allowlist env set → all sends blocked with: `"Pilot mode: no allowlisted test phone configured."`
- `PILOT_MODE=true` and destination matches **neither** exact nor any prefix → blocked with: `"Pilot mode: target phone is not on the test allowlist."`
- Blocks are inserted into `message_log` with `status='failed'` so they're visible in the in-app history.

## Build-time (Next.js inlines into client bundle)

These are baked at `next build` time and cannot be changed by container env:

| Name | Used for |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Auth redirects, email links. Public — safe to inline. |
| `NEXT_PUBLIC_API_URL` | Same-origin client requests; keep `/api`. |

If you change either, you MUST rebuild the image.

## Internal / advanced

| Name | Description |
|---|---|
| `INTERNAL_API_URL` | Used by middleware for self-calls. Keep on plain HTTP inside the container/network even when the public URL is HTTPS. |
| `BETTER_AUTH_URL` | Must match `NEXT_PUBLIC_APP_URL` exactly. No trailing slash. |
| `APP_VERSION` | Optional. Surfaced in `/api/health` for deployment identification. |
| `FITDESK_SERVER_ENTRYPOINT` | Override the standalone server entry. Defaults to `server.js`. |
| `DATABASE_AUTH_TOKEN` | Required when `DATABASE_URL` is a Turso `libsql://` URL. |
| `NODE_ENV` | `production` enables strict env validation, the `/api/dev/**` 404 gate, and Next.js production behavior. |

## Cross-container consistency

Several values MUST match across services. Any mismatch is a known footgun (operator changes `.env`, recreates one container without `--no-deps` peers).

| Value | Containers that must agree |
|---|---|
| `CONTROL_PLANE_API_KEY` | `axis-local-fitdesk` ↔ `axis-local-cp-api`, `axis-local-cp-worker` |
| `FITDESK_JWT_SECRET` | `axis-local-fitdesk` ↔ `axis-local-cp-api` |
| Postgres credentials | `axis-local-cp-postgres` data volume ↔ `axis-local-cp-api`, `axis-local-cp-worker` connection string. **Postgres credentials live in the data volume — recreating just the container does NOT update them.** Use `ALTER USER` if rotating. |

When rotating any of these, recreate **all** dependent containers with `docker compose up -d --force-recreate <a> <b> <c>` in one shot. Don't use `--no-deps` unless you're sure the peers don't share the rotated value.
