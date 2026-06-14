import { CheckCircle2 } from 'lucide-react'

export function NeedsAttentionEmpty() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
      style={{
        backgroundColor: 'var(--fd-surface)',
        borderColor:     'var(--fd-border)',
      }}
    >
      <CheckCircle2
        className="h-4 w-4 shrink-0"
        style={{ color: 'var(--fd-green)' }}
      />
      <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
        You&apos;re all caught up
      </p>
    </div>
  )
}
