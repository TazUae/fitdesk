/**
 * Health check endpoint.
 *
 * Used by:
 *   - Docker HEALTHCHECK (Dockerfile + docker-compose.yml)
 *   - Reverse proxy uptime checks
 *   - Dokploy / deployment platform monitors
 *
 * Returns 200 when the Node.js process is up and able to serve requests.
 * Does NOT check external services (ERPNext, Evolution, Whish) — those
 * have independent health checks and failures are surfaced in the UI, not here.
 */
export function GET() {
  const configured = {
    erpnext:   !!(process.env.ERPNEXT_BASE_URL && process.env.ERPNEXT_API_KEY),
    evolution: !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    whish:     !!(process.env.WHISH_API_URL     && process.env.WHISH_API_KEY),
    claude:    !!process.env.ANTHROPIC_API_KEY,
  }

  return Response.json(
    {
      status:     'ok',
      service:    'fitdesk',
      version:    process.env.APP_VERSION ?? 'dev',
      env:        process.env.NODE_ENV,
      timestamp:  new Date().toISOString(),
      uptime:     Math.floor(process.uptime()),
      configured,
    },
    { status: 200 },
  )
}
