import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { AttentionItem } from '@/lib/dashboard/derive'

interface AiCopilotRailProps {
  /** Attention items already derived for the dashboard — the rail surfaces the
   *  top few as suggested next actions (link-only, trainer decides). */
  items?: AttentionItem[]
}

/** Human phrasing for a suggestion card: why + suggested next action. */
function suggestionFor(item: AttentionItem): { why: string; action: string } | null {
  switch (item.type) {
    case 'overdue_invoice':
      return {
        why: `${item.clientName ?? 'A client'} has an overdue invoice${item.ageDays ? ` (${item.ageDays}d)` : ''}.`,
        action: 'Send a payment reminder or record the payment.',
      }
    case 'pending_invoice':
      return {
        why: `${item.clientName ?? 'A client'} has an invoice awaiting collection.`,
        action: 'Follow up or record the payment.',
      }
    case 'unresolved_session':
      return { why: item.label, action: 'Record the session outcome.' }
    case 'missing_next_session':
      return { why: item.label, action: 'Book their next session.' }
    default:
      return null
  }
}

export function AiCopilotRail({ items = [] }: AiCopilotRailProps) {
  const suggestions = items
    .map(item => ({ item, s: suggestionFor(item) }))
    .filter((x): x is { item: AttentionItem; s: NonNullable<ReturnType<typeof suggestionFor>> } => x.s !== null)
    .slice(0, 3)

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

        {suggestions.length > 0 ? (
          <div className="space-y-2.5">
            {suggestions.map(({ item, s }, i) => (
              <Link
                key={i}
                href={item.href}
                className="block rounded-xl border p-3.5 transition-opacity active:opacity-70"
                style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
                  {s.why}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: 'var(--fd-primary-text)' }}>
                  {s.action}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </p>
              </Link>
            ))}
          </div>
        ) : (
          /* Calm empty-state card */
          <div
            className="rounded-xl border p-4"
            style={{
              backgroundColor: 'var(--fd-surface)',
              borderColor: 'var(--fd-border)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
              All clear right now.
            </p>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: 'var(--fd-muted)' }}
            >
              Suggestions appear here when a client needs attention.
            </p>
          </div>
        )}

        {/* Philosophy note */}
        <p
          className="mt-5 text-center text-[11px]"
          style={{ color: 'var(--fd-muted)' }}
        >
          AI suggests. You decide.
        </p>

      </div>
    </aside>
  )
}
