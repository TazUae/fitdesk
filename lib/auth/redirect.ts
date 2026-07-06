/**
 * Post-login redirect allowlist.
 *
 * `callbackUrl` is attacker-controlled (it comes from the query string), so it
 * must never be forwarded as-is to `router.replace()` / `callbackURL`. Only
 * same-origin paths under an explicit allowlist are accepted — everything
 * else (protocol-relative URLs, backslash tricks, absolute URLs, arbitrary
 * internal paths) falls back to `/dashboard`.
 */

const FALLBACK_REDIRECT_URL = '/dashboard'

const ALLOWED_REDIRECT_PREFIXES = ['/dashboard', '/onboarding'] as const

export function getSafeRedirectUrl(raw: string | null | undefined): string {
  if (!raw) return FALLBACK_REDIRECT_URL

  // Must be a same-origin path. Reject protocol-relative ("//host"),
  // backslash-prefixed ("\host"), mixed-slash ("/\host"), absolute
  // (http://, https://), and scheme-based (javascript:) values — none of
  // these start with a single "/".
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return FALLBACK_REDIRECT_URL
  }

  const isAllowed = ALLOWED_REDIRECT_PREFIXES.some(
    (base) =>
      raw === base ||
      raw.startsWith(`${base}/`) ||
      raw.startsWith(`${base}?`) ||
      raw.startsWith(`${base}#`),
  )

  return isAllowed ? raw : FALLBACK_REDIRECT_URL
}
