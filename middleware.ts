import { betterFetch } from '@better-fetch/fetch'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

type SessionResponse = {
  session: { id: string; userId: string; expiresAt: string }
  user: { id: string; email: string; name: string }
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
  const { data: session } = await betterFetch<SessionResponse>(
    '/api/auth/get-session',
    {
      baseURL: req.nextUrl.origin,
      headers: {
        cookie: req.headers.get('cookie') ?? '',
      },
    },
  )

  if (!session) {
    const loginUrl = new URL('/auth/login', req.url)
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Only run middleware on dashboard routes.
  // Exclude: api routes, static files, images, favicon.
  matcher: ['/dashboard/:path*'],
}
