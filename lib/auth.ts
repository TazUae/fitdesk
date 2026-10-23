import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { userAdditionalFields } from './auth-user-fields'
import { requireAuthSecret } from './auth-secret'
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
// Build scripts supply a process-scoped random compile secret if needed.
// Running servers always require their own configured, strong runtime secret.
const secret = requireAuthSecret()

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
      // Trainer phone — kept in schema; registration input removed in Phase 1A
      ...userAdditionalFields,
    },
  },

  // nextCookies ensures Set-Cookie headers work correctly in Next.js
  // Server Actions and Route Handlers
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
