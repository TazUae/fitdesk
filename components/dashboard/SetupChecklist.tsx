import Link from 'next/link'
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react'

export interface ChecklistItem {
  id: string
  label: string
  description?: string
  done: boolean
  href?: string
}

interface Props {
  items: ChecklistItem[]
  /** When all items are complete the card can be hidden. */
  hideWhenAllDone?: boolean
}

/**
 * Setup checklist shown on the dashboard once provisioning is complete.
 * Pure presenter — `done` flags are computed by the server component.
 */
export function SetupChecklist({ items, hideWhenAllDone = false }: Props) {
  const total = items.length
  const completed = items.filter(i => i.done).length
  if (hideWhenAllDone && completed === total) return null

  return (
    <section
      className="rounded-2xl border p-4 space-y-3"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Finish setting up FitDesk
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
            {completed} of {total} done
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold leading-none"
          style={{
            backgroundColor: 'rgba(232,197,71,0.15)',
            color: 'var(--fd-accent)',
          }}
        >
          {completed === total ? 'All set' : `${total - completed} left`}
        </span>
      </div>

      <ul className="space-y-1">
        {items.map(item => {
          const Icon = item.done ? CheckCircle2 : Circle
          const labelStyle: React.CSSProperties = {
            color: item.done ? 'var(--fd-muted)' : 'var(--fd-text)',
            textDecoration: item.done ? 'line-through' : undefined,
          }

          const inner = (
            <>
              <Icon
                className="h-5 w-5 shrink-0"
                style={{ color: item.done ? 'var(--fd-green)' : 'var(--fd-muted)' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={labelStyle}>
                  {item.label}
                </p>
                {item.description && (
                  <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                    {item.description}
                  </p>
                )}
              </div>
              {item.href && !item.done && (
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
              )}
            </>
          )

          const className =
            'flex items-center gap-3 rounded-lg px-2 py-2 transition-opacity'
          const linkClass = `${className} hover:opacity-90 active:opacity-70`

          return (
            <li key={item.id}>
              {item.href && !item.done ? (
                <Link href={item.href} className={linkClass}>
                  {inner}
                </Link>
              ) : (
                <div className={className}>{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
