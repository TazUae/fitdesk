'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Global error boundary for the Next.js app.
 *
 * Catches unexpected errors thrown from any page or layout component.
 * The `reset` function re-renders the failed segment — most transient
 * errors (network timeouts, ERP unavailable) will resolve on retry.
 *
 * Must be 'use client' — Next.js requires error boundaries to be client components.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to server-side console so the error appears in Docker / VPS logs
    console.error('[fitdesk-error]', {
      message: error.message,
      digest:  error.digest,
      stack:   error.stack,
    })
  }, [error])

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8"
      style={{ backgroundColor: 'var(--fd-bg)' }}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: 'rgba(232,92,106,0.12)' }}
      >
        <AlertTriangle className="h-8 w-8" style={{ color: 'var(--fd-red)' }} />
      </div>

      <div className="text-center space-y-2 max-w-sm">
        <h2 className="text-lg font-bold" style={{ color: 'var(--fd-text)' }}>
          Something went wrong
        </h2>
        <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
          An unexpected error occurred. This is usually a temporary issue — try again.
        </p>
        {error.digest && (
          <p className="text-xs font-mono" style={{ color: 'var(--fd-muted)' }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[240px]">
        <button
          onClick={reset}
          className="w-full rounded-xl py-3 text-sm font-semibold"
          style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="w-full rounded-xl py-3 text-sm font-semibold text-center"
          style={{
            backgroundColor: 'rgba(138,143,168,0.12)',
            color: 'var(--fd-muted)',
          }}
        >
          Back to dashboard
        </a>
      </div>
    </div>
  )
}
