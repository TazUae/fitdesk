# FitDesk

Mobile-first business operating system for personal trainers.
Manage clients, sessions, invoices, payments, and WhatsApp communication — all in one place.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, `output: standalone`) |
| Auth | Better Auth — email/password + Google OAuth |
| Database (auth) | SQLite via LibSQL / Turso |
| Business data | ERPNext / Frappe (source of truth for all financials) |
| WhatsApp | Evolution API |
| Payments | Whish Money (+ Cash, Bank Transfer) |
| AI drafting | Claude API (Anthropic) — optional, degrades to templates |
| Deployment | Docker on VPS, behind a reverse proxy |

---

## Local Development

### Prerequisites

- Node.js 20+
- A running ERPNext instance (or skip ERP setup and the app starts without it)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd fitdesk
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in values — see Environment Variables below

# 3. Create the auth database
npx better-auth migrate

# 4. Start the dev server
npm run dev
```

The app starts at http://localhost:3000.

Without ERPNext credentials the app starts normally — all ERP-backed pages show
"Not Configured" errors which are displayed in the UI rather than crashing.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

### Required (app will not start correctly without these)

| Variable | Description |
|---|---|
| `BETTER_AUTH_SECRET` | Random 32+ char secret. Generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Full public URL of the app, e.g. `https://fitdesk.yourdomain.com` |
| `DATABASE_URL` | LibSQL connection string. Local: `file:./auth.db`. Docker: `file:/app/data/auth.db`. Turso: `libsql://your-db.turso.io` |

### ERPNext (required for all business data)

| Variable | Description |
|---|---|
| `ERPNEXT_BASE_URL` | Base URL of your ERPNext instance, no trailing slash |
| `ERPNEXT_API_KEY` | ERPNext API key from User → API Access |
| `ERPNEXT_API_SECRET` | ERPNext API secret |

To generate ERPNext keys: ERPNext → Settings → Users → select user → API Access → Generate Keys.

### Optional integrations

| Variable | Description | Default behaviour when absent |
|---|---|---|
| `EVOLUTION_API_URL` | Evolution API base URL | WhatsApp sending disabled; drafts still work |
| `EVOLUTION_API_KEY` | Evolution API key | — |
| `EVOLUTION_INSTANCE_NAME` | WhatsApp instance name in Evolution | — |
| `WHISH_API_URL` | Whish Money API base URL | Whish payment links disabled; cash/bank transfer unaffected |
| `WHISH_API_KEY` | Whish API key | — |
| `WHISH_MERCHANT_ID` | Whish merchant ID | — |
| `ANTHROPIC_API_KEY` | Claude API key for AI message drafting | Falls back to professional templates |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Google sign-in hidden from login page |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `DATABASE_AUTH_TOKEN` | Turso auth token (only needed with a remote libsql URL) | — |

### Trainer ERP ID resolution

`lib/trainer.ts` maps auth user IDs to ERPNext Trainer docnames using the
`trainer_mapping` table in `auth.db`. The mapping is created automatically
on registration via the Better Auth `user.create.after` hook, which calls
`createTrainerForUser()` to create an ERPNext Trainer record and store the link.

If ERPNext is unavailable at registration time, the hook logs the error and
continues — the user can register, but will see "Trainer not configured" errors
on the dashboard until ERPNext is reachable and the mapping is created.

---

## Docker Deployment

### Build and run

```bash
# Build the image
docker build -t fitdesk .

# Run with environment file
docker run -d \
  --name fitdesk \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v fitdesk_db:/app/data \
  --env-file .env \
  fitdesk
```

### Docker Compose (recommended)

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f app

# Stop
docker compose down

# Stop and remove the database volume (destructive — loses auth.db data)
docker compose down -v
```

The `docker-compose.yml` binds to `127.0.0.1:3000` only. A reverse proxy handles
external TLS termination.

### Database persistence

When using SQLite (`DATABASE_URL=file:/app/data/auth.db`), the named volume
`db_data` stores the database. It survives `docker compose down` but is removed
by `docker compose down -v`.

For production with multiple instances or zero-downtime deploys, use Turso instead:
```
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=<token>
```

---

## Reverse Proxy Setup

FitDesk binds to `localhost:3000`. A reverse proxy handles HTTPS.

### Caddy (simplest — auto HTTPS)

```caddyfile
fitdesk.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name fitdesk.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/fitdesk.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fitdesk.yourdomain.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Dokploy

1. Create a new **Docker Compose** service.
2. Paste the contents of `docker-compose.yml`.
3. Set the domain in the Dokploy UI — it handles Traefik labels and SSL automatically.
4. Set environment variables in the Dokploy UI (do not commit `.env`).
5. Important: in Dokploy, change the port binding from `127.0.0.1:3000:3000` to
   just `3000` (no host binding) and let Traefik route traffic.

---

## ERPNext Setup

FitDesk expects the following DocTypes to exist in ERPNext.
Standard Frappe DocTypes (`Sales Invoice`, `Payment Entry`) require no changes.

### Custom DocTypes required

| DocType | Purpose |
|---|---|
| `Client` (or `Contact`) | Client records — confirm name in `lib/erpnext/client.ts` |
| `PT Session` | Training session records — confirm name in `lib/erpnext/client.ts` |
| `Trainer` | Trainer records for multi-trainer scoping |

### Custom fields required

| DocType | Field | Type | Purpose |
|---|---|---|---|
| Client | `trainer` | Link → Trainer | Links client to trainer |
| Client | `total_sessions` | Int | Session count (updated by hooks) |
| Client | `goal` | Small Text | Fitness goal (optional) |
| PT Session | `client` | Link → Client | Session client |
| PT Session | `trainer` | Link → Trainer | Session trainer |
| PT Session | `session_date` | Datetime | Session date/time |
| PT Session | `session_time` | Time | Session time (optional) |
| PT Session | `duration` | Int | Duration in minutes |
| PT Session | `session_fee` | Currency | Per-session fee (optional) |

---

## Health Check

```
GET /api/health
```

Returns 200 with:
```json
{
  "status": "ok",
  "service": "fitdesk",
  "version": "1.0.0",
  "env": "production",
  "timestamp": "2026-03-24T10:00:00.000Z",
  "uptime": 3600,
  "configured": {
    "erpnext": true,
    "evolution": false,
    "whish": false,
    "claude": false
  }
}
```

The `configured` map shows which integrations have credentials set.
All values can be `false` without the app crashing — features degrade gracefully.

---

## Architecture Notes

```
Browser → Next.js (App Router)
           │
           ├── Server Components   → fetch data via server actions
           ├── Server Actions      → call typed adapters
           │                           ├── lib/erpnext/client.ts  → ERPNext REST API
           │                           ├── lib/evolution.ts       → Evolution API (WhatsApp)
           │                           ├── lib/whish.ts           → Whish Money
           │                           └── lib/claude.ts          → Claude API
           └── Client Components   → display data, handle interaction
                                       (never call external APIs directly)
```

All external API calls are server-side. Client components receive pre-fetched,
normalised data and call server actions for mutations.

---

## Project Structure

```
fitdesk/
├── app/
│   ├── api/
│   │   ├── auth/[...all]/    # Better Auth handler
│   │   └── health/           # Health check endpoint
│   ├── auth/
│   │   ├── login/            # Sign in page
│   │   └── register/         # Registration page
│   ├── dashboard/
│   │   ├── clients/          # Client list, detail, edit
│   │   ├── schedule/         # Session schedule, booking
│   │   ├── invoices/         # Invoice list, creation, payment
│   │   └── messages/         # WhatsApp message composer
│   ├── error.tsx             # Global error boundary
│   ├── not-found.tsx         # 404 page
│   └── layout.tsx            # Root layout (fonts, Toaster)
├── actions/                  # Server actions (auth-gated data layer)
│   ├── clients.ts
│   ├── sessions.ts
│   ├── invoices.ts
│   └── messages.ts
├── components/
│   └── modules/              # Feature UI components
├── lib/
│   ├── auth.ts               # Better Auth config
│   ├── auth-client.ts        # Better Auth client
│   ├── claude.ts             # AI message generation
│   ├── db.ts                 # LibSQL / Drizzle setup
│   ├── erpnext/              # ERPNext adapter (normalises ERP → app types)
│   ├── evolution.ts          # WhatsApp via Evolution API
│   ├── trainer.ts            # Auth user → ERP trainer ID resolver
│   └── whish.ts              # Payment provider abstraction
├── types/
│   └── index.ts              # Shared domain types
└── middleware.ts             # Route protection (dashboard requires auth)
```
