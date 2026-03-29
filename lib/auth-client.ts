import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { userAdditionalFields } from '@/lib/auth-user-fields'

/**
 * Better Auth — browser client.
 *
 * Use in Client Components only.
 * Available methods: signIn, signUp, signOut, useSession, and more.
 *
 * No baseURL hardcoded — Better Auth uses the current window.location.origin
 * in the browser, so this works on any port (dev, staging, production)
 * without env var changes.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: userAdditionalFields })],
})

// Re-export the hook and sign-in helpers for convenient imports
export const { useSession, signIn, signOut, signUp } = authClient
