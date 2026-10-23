/**
 * Bind cookie-authenticated mutations to the configured web Origin.
 * SameSite=Lax is not sufficient against same-site cross-origin requests.
 * BETTER_AUTH_URL must use the public HTTPS origin behind reverse proxies.
 */
export function isTrustedMutationOrigin(request: Request): boolean {
  const presented = request.headers.get('origin')
  if (!presented || presented === 'null') return false
  try {
    const origin = new URL(presented)
    if (!['https:', 'http:'].includes(origin.protocol)) return false
    // Origin must contain only scheme, host, and optional port.
    if (origin.origin !== presented) return false
    const configured = process.env.BETTER_AUTH_URL
    const expected = new URL(configured ?? request.url).origin
    return origin.origin === expected
  } catch {
    return false
  }
}
