import { AlertTriangle } from 'lucide-react'

interface ErrorStateProps {
  title?:   string
  message:  string
  /** Renders compact (single-line, inline icon) instead of the card form. */
  inline?:  boolean
}

export function ErrorState({ title = 'Could not load', message, inline }: ErrorStateProps) {
  if (inline) {
    return (
      <p
        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
        style={{
          borderColor:     'rgba(232,92,106,0.30)',
          backgroundColor: 'rgba(232,92,106,0.06)',
          color:           'var(--fd-red)',
        }}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{message}</span>
      </p>
    )
  }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: 'rgba(232,92,106,0.06)',
        borderColor:     'rgba(232,92,106,0.25)',
      }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fd-red)' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-red)' }}>
            {title}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
