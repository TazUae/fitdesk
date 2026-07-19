'use client'

import { cn } from '@/lib/utils'

export type BookingStep = 'client' | 'datetime' | 'pattern' | 'review' | 'success'

interface BookingStepperProps {
  step:    BookingStep
  onJump?: (step: BookingStep) => void
  /** When the flow is a one-off booking, hide the Pattern step. */
  hidePattern?: boolean
}

const ORDER: BookingStep[] = ['client', 'datetime', 'pattern', 'review']
const LABEL: Record<BookingStep, string> = {
  client:   'Client',
  datetime: 'Date & Time',
  pattern:  'Repeat',
  review:   'Review',
  success:  'Done',
}

export function BookingStepper({ step, onJump, hidePattern }: BookingStepperProps) {
  if (step === 'success') return null

  const visible: BookingStep[] = hidePattern
    ? ORDER.filter(s => s !== 'pattern')
    : ORDER

  const activeIdx = visible.indexOf(step)

  return (
    <nav
      aria-label="Booking progress"
      className="flex items-center gap-1.5 px-1"
    >
      {visible.map((s, i) => {
        const isActive = i === activeIdx
        const isPast   = i < activeIdx
        const reachable = i <= activeIdx
        return (
          <button
            key={s}
            type="button"
            disabled={!reachable || !onJump}
            onClick={() => reachable && onJump?.(s)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors',
              reachable ? 'cursor-pointer' : 'cursor-default',
            )}
            style={{
              backgroundColor: isActive
                ? 'var(--fd-primary-soft)'
                : 'transparent',
              color: isActive
                ? 'var(--fd-primary-text)'
                : isPast
                  ? 'var(--fd-text)'
                  : 'var(--fd-muted)',
              fontWeight: isActive ? 600 : 500,
            }}
            aria-current={isActive ? 'step' : undefined}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: isActive
                  ? 'var(--fd-primary-text)'
                  : isPast
                    ? 'var(--fd-green)'
                    : 'var(--fd-border)',
                color: isActive || isPast ? 'var(--fd-text-on-primary)' : 'var(--fd-muted)',
              }}
              aria-hidden="true"
            >
              {isPast ? '✓' : i + 1}
            </span>
            <span className="hidden sm:inline">{LABEL[s]}</span>
          </button>
        )
      })}
    </nav>
  )
}
