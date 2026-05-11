'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Occurrence } from '@/types/scheduling'

interface CompactSessionPreviewProps {
  occurrences:   Occurrence[]
  /** Set of startAt epoch-ms values that conflict — rendered red. */
  conflictTimes?: Set<number>
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function formatOccurrence(o: Occurrence): string {
  const dt = new Date(o.startAt)
  const wd = WEEKDAY_LABELS[dt.getDay()]
  const md = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const tm = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${wd}, ${md} · ${tm}`
}

/**
 * Compact, collapsed-by-default preview of generated occurrences.
 *
 * Shows up to 3 rows by default with a "Show all N" disclosure to expand.
 * Conflict rows render red.
 */
export function CompactSessionPreview({ occurrences, conflictTimes }: CompactSessionPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  if (occurrences.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
        No sessions in this plan yet.
      </p>
    )
  }

  const shown = expanded ? occurrences : occurrences.slice(0, 3)
  const hasMore = occurrences.length > 3

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {shown.map(o => {
          const bad = conflictTimes?.has(o.startAt.getTime())
          return (
            <li
              key={o.occurrenceKey}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs"
              style={{
                backgroundColor: bad ? 'color-mix(in srgb, var(--fd-red) 8%, transparent)' : 'var(--fd-bg)',
                color: bad ? 'var(--fd-red)' : 'var(--fd-text)',
                border: '1px solid',
                borderColor: bad
                  ? 'color-mix(in srgb, var(--fd-red) 30%, transparent)'
                  : 'var(--fd-border)',
              }}
            >
              <span>{formatOccurrence(o)}</span>
              {bad && (
                <span
                  className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--fd-red) 15%, transparent)',
                  }}
                >
                  Blocked
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--fd-blue)' }}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Show all {occurrences.length}
            </>
          )}
        </button>
      )}
    </div>
  )
}
