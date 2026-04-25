import { NextResponse } from 'next/server'

/**
 * GET /api/geoip
 *
 * Detects the caller's country from their IP using ipapi.co (free, no auth).
 * Called once on the onboarding profile step to pre-fill country + currency.
 *
 * Returns: { countryCode, countryName, currency }
 *
 * Falls back to LB/USD on localhost or any error — never throws to the client.
 */
export async function GET(req: Request) {
  // Extract real client IP from proxy headers
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp    = req.headers.get('x-real-ip')
  const ip        = forwarded?.split(',')[0]?.trim() ?? realIp ?? ''

  const isLocal = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')

  if (isLocal) {
    // Running locally — default to Lebanon
    return NextResponse.json({ countryCode: 'LB', countryName: 'Lebanon', currency: 'USD' })
  }

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'User-Agent': 'FitDesk/1.0' },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })

    if (!res.ok) throw new Error(`ipapi.co ${res.status}`)

    const data = await res.json() as {
      country_code?: string
      country_name?: string
      currency?: string
      error?: boolean
    }

    if (data.error || !data.country_code) {
      return NextResponse.json({ countryCode: 'LB', countryName: 'Lebanon', currency: 'USD' })
    }

    return NextResponse.json({
      countryCode: data.country_code,
      countryName: data.country_name ?? data.country_code,
      currency:    data.currency ?? 'USD',
    })
  } catch {
    return NextResponse.json({ countryCode: 'LB', countryName: 'Lebanon', currency: 'USD' })
  }
}
