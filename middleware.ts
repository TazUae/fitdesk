import { betterFetch } from '@better-fetch/fetch'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

type SessionResponse = {
  session: { id: string; userId: string; expiresAt: string }
  user: { id: string; email: string; name: string }
}

function internalApiOrigin(): string {
  const raw =
    process.env.INTERNAL_API_URL ??
    process.env.BETTER_AUTH_INTERNAL_URL ??
    'http://127.0.0.1:3000'
  // Internal self-calls should stay on plain HTTP inside the container/network.
  if (raw.startsWith('https://')) return 'http://127.0.0.1:3000'
  return raw
}

/**
 * Route protection middleware.
 *
 * Protected prefix: /dashboard (all nested routes)
 * Unprotected:      /auth/*, /api/auth/*, /api/health, public assets
 *
 * Strategy: fetch session from the local Better Auth endpoint using the
 * request cookie. No JWT decoding — session validity is checked server-side.
 * Runs on the Edge runtime (no DB access, pure HTTP).
 */
export async function middleware(req: NextRequest) {
  const baseURL = internalApiOrigin()
  const cookie = req.headers.get('cookie') ?? ''

  const { data: session } = await betterFetch<SessionResponse>(
    '/api/auth/get-session',
    {
      baseURL,
      headers: {
        cookie,
      },
    },
  )

  if (!session) {
    const loginUrl = new URL('/auth/login', req.url)
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const { data: provisioning } = await betterFetch<{ status: string | null }>(
      '/api/provisioning/status',
      {
        baseURL,
        headers: { cookie },
      },
    )

    if (provisioning?.status !== 'completed') {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }
  } catch (err) {
    // Avoid edge runtime crashes when internal API is temporarily unavailable.
    // Users can still authenticate and recover from onboarding route.
    console.error('[middleware] provisioning status check failed', err)
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }

  return NextResponse.next()
}

export const config = {
  // Only run middleware on dashboard routes.
  // Exclude: api routes, static files, images, favicon.
  matcher: ['/dashboard/:path*'],
}
