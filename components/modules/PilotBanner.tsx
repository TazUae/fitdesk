import { AlertTriangle } from 'lucide-react'

export function PilotBanner({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <div
      role="status"
      aria-label="Pilot mode active"
      className="flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: 'rgba(232,197,71,0.18)',
        borderBottom:    '1px solid rgba(232,197,71,0.35)',
        color:           'var(--fd-accent)',
      }}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>Pilot mode — actions are logged; WhatsApp restricted to allowlist</span>
    </div>
  )
}
