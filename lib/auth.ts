import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { userAdditionalFields } from './auth-user-fields'
import { db } from './db'

/**
 * Better Auth — server instance.
 *
 * Database: SQLite via LibSQL (file:./auth.db locally, Turso in production).
 * Auth methods: email/password + Google OAuth.
 *
 * To create the auth tables on first run:
 *   npx better-auth generate   → outputs SQL
 *   npx better-auth migrate    → applies it to DATABASE_URL
 */
/**
 * Resolves BETTER_AUTH_SECRET for Better Auth.
 *
 * Phase 5.0.1 / 5.0.2 contract:
 *   - All env validation (placeholder detection, dev-only-* rejection,
 *     min-length enforcement) lives in lib/env.ts and runs at startup
 *     via scripts/start-with-migrations.mjs.
 *   - This function is the LAST RESORT — by the time it's called the
 *     env validator has already failed if the value is unsafe.
 *   - The build-only placeholder is only returned during `next build`
 *     where Next.js evaluates server modules to collect page data
 *     before deployment secrets are present.
 */
function resolveAuthSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (s && s.length >= 32) {
    return s
  }
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'build-only-placeholder-not-for-production-min-32-chars'
  }
  throw new Error('BETTER_AUTH_SECRET must be set and at least 32 chars (validated at startup in lib/env.ts)')
}

const secret = resolveAuthSecret()


export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
  }),

  secret,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // enable once email provider is configured
  },

  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : {}),
  },

  user: {
    additionalFields: {
      // Trainer phone — collected at registration, synced to ERPNext on first login
      ...userAdditionalFields,
    },
  },

  // nextCookies ensures Set-Cookie headers work correctly in Next.js
  // Server Actions and Route Handlers
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
