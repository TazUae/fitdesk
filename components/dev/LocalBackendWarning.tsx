/**
 * LocalBackendWarning — shown only when the app is running against a local
 * ERPNext instance (NEXT_PUBLIC_FRAPPE_URL contains 'localhost').
 *
 * Intended for dev/staging use. Does NOT appear in production.
 * No external API call — purely an env-var check passed from the server component.
 */

interface LocalBackendWarningProps {
  show: boolean
}

export function LocalBackendWarning({ show }: LocalBackendWarningProps) {
  if (!show) return null

  return (
    <div
      className="rounded-xl px-4 py-2.5 text-xs font-medium"
      style={{
        backgroundColor: 'rgba(232,197,71,0.12)',
        border:          '1px solid rgba(232,197,71,0.3)',
        color:           'var(--fd-accent)',
      }}
    >
      ⚠️ Connected to local ERPNext — data may not reflect production.
    </div>
  )
}
