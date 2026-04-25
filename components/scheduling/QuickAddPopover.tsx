'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { ChevronsUpDown, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildPlanAction, bookPlanAction } from '@/actions/schedulingActions'
import { SmartClientPicker } from '@/components/clients/SmartClientPicker'
import { scheduleTokens } from '@/lib/ui/scheduleDesignTokens'
import type { Client } from '@/types'
import type { QuickAddRange, TrainerConfig } from '@/types/scheduling'

const SESSION_TYPES = ['Strength', 'Cardio', 'Rehab', 'Mobility', 'Flexibility'] as const

const POPOVER_WIDTH  = 340
const POPOVER_GAP    = 12
const POPOVER_MARGIN = 16

function parseHHmm(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

function formatRangeLabel(r: QuickAddRange): string {
  // Parse YYYY-MM-DD as local date — `new Date('2026-04-25')` is UTC midnight
  const [y, mo, d] = r.date.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${dateStr} · ${r.startTime} – ${r.endTime}`
}

export interface QuickAddPopoverProps {
  range:           QuickAddRange
  clients:         Client[]
  trainerConfig:   TrainerConfig
  initialClientId?: string
  onClose:         () => void
  onBooked:        () => void
  /** User tapped "More options" — parent should open the full BookingPanel pre-filled. */
  onMoreOptions:   (range: QuickAddRange) => void
}

export function QuickAddPopover({
  range,
  clients,
  trainerConfig,
  initialClientId,
  onClose,
  onBooked,
  onMoreOptions,
}: QuickAddPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [isPending, startTransition] = useTransition()

  const [clientId, setClientId]       = useState(initialClientId ?? '')
  const [sessionType, setSessionType] = useState('')
  const [fee, setFee]                 = useState('')
  const [error, setError]             = useState<string | null>(null)

  const durationMinutes = parseHHmm(range.endTime) - parseHHmm(range.startTime)

  // ── Positioning ──────────────────────────────────────────────────────────
  const [position, setPosition] = useState<{ top: number; left: number; isSheet: boolean }>(() => ({
    top:     0,
    left:    0,
    isSheet: typeof window !== 'undefined' ? window.innerWidth < 640 : true,
  }))

  useLayoutEffect(() => {
    const isSheet = window.innerWidth < 640
    if (isSheet) {
      setPosition({ top: 0, left: 0, isSheet: true })
      return
    }

    const el = popoverRef.current
    if (!el) return
    const height = el.offsetHeight
    const rect = range.anchorRect

    // Prefer right of the column, fall back to left, then center.
    const rightCandidate = rect.right + POPOVER_GAP
    const leftCandidate  = rect.left  - POPOVER_GAP - POPOVER_WIDTH
    let left: number
    if (rightCandidate + POPOVER_WIDTH + POPOVER_MARGIN <= window.innerWidth) {
      left = rightCandidate
    } else if (leftCandidate >= POPOVER_MARGIN) {
      left = leftCandidate
    } else {
      left = Math.max(POPOVER_MARGIN, (window.innerWidth - POPOVER_WIDTH) / 2)
    }

    // Align top near drag rect, clamp inside viewport.
    const preferredTop = rect.top
    const clampedTop = Math.max(
      POPOVER_MARGIN,
      Math.min(preferredTop, window.innerHeight - height - POPOVER_MARGIN),
    )

    setPosition({ top: clampedTop, left, isSheet: false })
  }, [range])

  // ── Close on Escape / outside click ──────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function handleMouseDown(e: MouseEvent) {
      if (!popoverRef.current) return
      if (popoverRef.current.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  const isValid = !!clientId && durationMinutes > 0

  function handleBook() {
    if (!isValid) return
    setError(null)
    const rate = fee ? parseFloat(fee) : 0

    startTransition(async () => {
      const planResult = await buildPlanAction({
        selectedSlots:   [{ localDate: range.date, localTime: range.startTime }],
        clientId,
        durationMinutes,
        recurrenceWeeks: null,
      })

      if (!planResult.success) {
        setError(planResult.message)
        return
      }

      if (!planResult.data.valid) {
        const conflict = planResult.data.conflicts[0]
        const outOfHrs = planResult.data.outOfHours[0]
        setError(
          conflict  ? `Booking blocked: ${conflict.kind === 'buffer' ? 'violates buffer' : 'overlaps existing session'}` :
          outOfHrs  ? outOfHrs.reason :
          'Plan has no valid sessions',
        )
        return
      }

      const bookResult = await bookPlanAction(
        planResult.data,
        rate,
        sessionType || null,
        null,
      )

      if (!bookResult.success) {
        setError(bookResult.message)
        return
      }

      toast.success('Session booked')
      onBooked()
      onClose()
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const isSheet = position.isSheet

  const containerStyle: React.CSSProperties = isSheet
    ? {
        position:      'fixed',
        left:          0,
        right:         0,
        bottom:        0,
        zIndex:        60,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)',
      }
    : {
        position: 'fixed',
        top:      position.top,
        left:     position.left,
        width:    POPOVER_WIDTH,
        zIndex:   60,
      }

  const clientInitial = useMemo(
    () => clients.find(c => c.id === clientId),
    [clients, clientId],
  )

  return (
    <>
      {/* Backdrop (mobile only — desktop uses outside-click via mousedown listener) */}
      {isSheet && (
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: 'rgba(6,9,18,0.55)' }}
          onClick={onClose}
        />
      )}

      <div
        ref={popoverRef}
        className={
          isSheet
            ? 'rounded-t-2xl border shadow-2xl'
            : 'rounded-2xl border shadow-2xl'
        }
        style={{
          ...containerStyle,
          borderColor:     scheduleTokens.borderStrong,
          backgroundColor: 'var(--fd-surface)',
          boxShadow:       scheduleTokens.shadowCard,
          borderRadius:    isSheet ? undefined : scheduleTokens.radiusXl,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
              Quick add
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
              {formatRangeLabel(range)} · {durationMinutes} min
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-3 shrink-0"
            style={{ color: 'var(--fd-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
              Client
            </p>
            <SmartClientPicker
              clients={clients}
              selectedId={clientId}
              remainingSessions={clientInitial?.remainingSessions}
              onSelect={id => { setClientId(id); setError(null) }}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
              Session type
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SESSION_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSessionType(sessionType === type ? '' : type)}
                  className="rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.97]"
                  style={sessionType === type ? {
                    backgroundColor: 'rgba(78,203,160,0.12)',
                    borderColor:     'var(--fd-green)',
                    color:           'var(--fd-green)',
                  } : {
                    backgroundColor: 'var(--fd-surface)',
                    borderColor:     'var(--fd-border)',
                    color:           'var(--fd-muted)',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
              Fee
            </p>
            <div
              className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
              style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={fee}
                onChange={e => setFee(e.target.value)}
                placeholder="0.00"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: 'var(--fd-text)', colorScheme: 'dark' }}
              />
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--fd-red)' }}>{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onMoreOptions(range)}
              disabled={isPending}
              className="flex items-center gap-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-opacity active:opacity-70 disabled:opacity-40"
              style={{
                borderColor:     'var(--fd-border)',
                color:           'var(--fd-text)',
                backgroundColor: 'var(--fd-card)',
              }}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              More options
            </button>
            <button
              type="button"
              onClick={handleBook}
              disabled={!isValid || isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#00C853', color: '#0F1117' }}
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</>
              ) : (
                'Book session'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
