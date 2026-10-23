/**
 * Better Auth must never use a known/deterministic secret in a running server.
 * Compile-time builds inject a random, process-scoped secret separately.
 */
export function requireAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be set and at least 32 chars')
  }
  return secret
}
