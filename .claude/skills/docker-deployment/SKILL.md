---
name: docker-deployment
description: Use when writing Dockerfiles, docker-compose files, environment variable configuration, health checks, or production deployment setup for FitDesk.
---

# Docker Deployment Skill

FitDesk must be fully deployable via Docker on a VPS. This skill governs all containerization and deployment configuration work.

---

## Core Rules

- All configuration must come from environment variables — never hardcoded values
- No secrets in the repo (no `.env` files committed, no inline credentials)
- Separate dev and production Docker configurations
- Keep images minimal and production-safe
- Add health checks to all production services
- Assume a reverse proxy (nginx, Caddy, or Traefik) handles TLS termination upstream

---

## Required Environment Variables

Document all required env vars. Minimum set for the Next.js app:

```env
# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.fitdesk.example.com

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# Google OAuth (if used)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ERPNext
ERPNEXT_URL=
ERPNEXT_API_KEY=
ERPNEXT_API_SECRET=

# Evolution API
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=

# Whish Payments
WHISH_API_URL=
WHISH_API_KEY=
WHISH_MERCHANT_ID=
```

- Provide a committed `.env.example` with all keys and no values
- Never commit a `.env` with real values

---

## Dockerfile Pattern (Next.js)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

- Use multi-stage builds to keep the final image small
- Never include `node_modules` or build artifacts from the builder stage in the runner
- Set `output: 'standalone'` in `next.config.ts` for this pattern

---

## docker-compose Pattern (Production)

```yaml
services:
  app:
    image: fitdesk-app:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- Use `restart: unless-stopped` for production services
- Use `env_file` — never inline secrets in compose files
- Keep compose files readable and minimal

---

## Health Check Endpoint

Implement a lightweight health route in the Next.js app:

```ts
// app/api/health/route.ts
export function GET() {
  return Response.json({ status: 'ok' })
}
```

---

## Dev vs Production

| Concern              | Dev                          | Production                  |
|----------------------|------------------------------|-----------------------------|
| Config               | `.env.local`                 | `.env` via env_file         |
| Image                | `next dev` (no Docker)       | Multi-stage Docker build    |
| Secrets              | Local only, never committed  | Injected at runtime         |
| Reverse proxy        | Not needed                   | nginx / Caddy / Traefik     |
| HTTPS                | Not needed locally           | Handled by reverse proxy    |

---

## What to Avoid

- Hardcoded URLs, secrets, or credentials anywhere in Dockerfiles or compose files
- Committing `.env` files with real values
- Installing dev dependencies in the production runner stage
- Running the app as root inside the container
- Bloated images with unnecessary build tools in the final stage
- Development-only settings (source maps, verbose logs) leaking into production builds
