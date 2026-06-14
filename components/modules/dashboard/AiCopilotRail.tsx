import { Sparkles } from 'lucide-react'

export function AiCopilotRail() {
  return (
    <aside
      className="hidden xl:flex xl:w-80 xl:shrink-0 xl:flex-col border-l"
      style={{ borderColor: 'var(--fd-border)' }}
    >
      <div className="sticky top-14 p-5">

        {/* Header */}
        <div className="mb-5 flex items-center gap-2">
          <Sparkles
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--fd-accent)' }}
          />
          <h2
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--fd-muted)' }}
          >
            AI Copilot
          </h2>
        </div>

        {/* Calm empty-state card */}
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--fd-surface)',
            borderColor: 'var(--fd-border)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
            Nothing to suggest right now.
          </p>
          <p
            className="mt-1 text-xs leading-relaxed"
            style={{ color: 'var(--fd-muted)' }}
          >
            AI reviews your sessions, invoices, and client activity to surface
            timely suggestions here.
          </p>
        </div>

        {/* Philosophy note */}
        <p
          className="mt-5 text-center text-[11px]"
          style={{ color: 'var(--fd-border)' }}
        >
          AI suggests. You decide.
        </p>

      </div>
    </aside>
  )
}
