import { CheckCircle2 } from 'lucide-react'

export function NeedsAttentionEmpty() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{
        backgroundColor: 'var(--fd-surface)',
        borderColor:     'var(--fd-border)',
      }}
    >
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color: 'var(--fd-green)' }}
      />
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
          All clear for now
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
          No visible attention items need review.
        </p>
      </div>
    </div>
  )
}
