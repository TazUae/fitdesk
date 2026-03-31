# Use Docker Hub official Node image by default.
# You can override NODE_BASE_IMAGE at build time if needed.
ARG NODE_BASE_IMAGE=node:20-slim
FROM ${NODE_BASE_IMAGE} AS base
WORKDIR /app

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM base AS builder

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next.config.mjs must set output: 'standalone'
RUN npm run build

# ─── Stage 3: Production runtime ──────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Bind to all interfaces so Docker can route traffic in.
# Without HOSTNAME=0.0.0.0 the standalone server binds localhost-only.
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Create the data directory for the local SQLite auth database
# (only used when DATABASE_URL=file:/app/data/auth.db — Turso replaces this in prod)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts         ./scripts

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "scripts/start-with-migrations.mjs"]
