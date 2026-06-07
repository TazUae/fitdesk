/**
 * LocalBackendWarning — dev/local-only banner shown on the dashboard when a
 * backend fetch failed.
 *
 * The dashboard degrades gracefully (Promise.allSettled → null → empty states),
 * which silently hides a down Control Plane / ERPNext during local development.
 * This banner makes that situation obvious to the developer — and ONLY the
 * developer: it never renders in production, so trainers never see it.
 *
 * Server component (no 'use client'). Renders in the dashboard server tree.
 *
 * Safety:
 *   - Returns null when NODE_ENV === 'production' (defense in depth; the page
 *     also gates on this before passing `degraded`).
 *   - Never renders raw error messages or secrets — copy is static.
 *   - Does not change the underlying graceful empty-state behavior.
 */

import { isProductionEnv } from '@/lib/dev/tenant-readiness'

export function LocalBackendWarning({ degraded }: { degraded: boolean }) {
  if (!degraded) return null
  if (isProductionEnv(process.env.NODE_ENV)) return null

  return (
    <div
      role="status"
      className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-semibold">Backend unavailable</p>
      <p className="mt-1">
        FitDesk could not reach ERPNext or the Control Plane. Dashboard data may be empty.
        Run <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">npm run local:up</code>,
        then <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">npm run local:check</code>.
      </p>
    </div>
  )
}
