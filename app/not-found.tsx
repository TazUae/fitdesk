import Link from 'next/link'
import { Compass } from 'lucide-react'

/**
 * 404 — rendered when notFound() is called or an unknown URL is hit.
 */
export default function NotFoundPage() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8"
      style={{ backgroundColor: 'var(--fd-bg)' }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: 'rgba(91,156,246,0.12)' }}
      >
        <Compass className="h-8 w-8" style={{ color: 'var(--fd-blue)' }} />
      </div>

      <div className="text-center space-y-2 max-w-sm">
        <p
          className="text-5xl font-bold tracking-tight"
          style={{ color: 'var(--fd-accent)' }}
        >
          404
        </p>
        <h2 className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
          Page not found
        </h2>
        <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="rounded-xl px-6 py-3 text-sm font-semibold"
        style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
      >
        Go to dashboard
      </Link>
    </div>
  )
}
