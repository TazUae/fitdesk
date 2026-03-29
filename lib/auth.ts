import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { userAdditionalFields } from './auth-user-fields'
import { db } from './db'
import { createTrainerForUser } from './trainer'

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
const secret = process.env.BETTER_AUTH_SECRET
if (!secret || secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be set and at least 32 chars')
}

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

  /**
   * Auto-provision an ERPNext Trainer record for every new user.
   *
   * Fires after email/password registration AND Google OAuth sign-up.
   * Wrapped in try/catch so a failing ERPNext connection never blocks
   * registration — the trainer sees a "not configured" error on first
   * dashboard load instead, which is recoverable.
   */
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await createTrainerForUser(user.id, user.name ?? user.email, user.email)
          } catch (err) {
            console.error('[trainer-provision] failed for user', user.id, err)
          }
        },
      },
    },
  },

  // nextCookies ensures Set-Cookie headers work correctly in Next.js
  // Server Actions and Route Handlers
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
