'use client'

import { ChevronLeft, Loader2 } from 'lucide-react'
import type { BookingValidity } from '@/types/scheduling'

interface BookingStickyFooterProps {
  validity:   BookingValidity
  isPending:  boolean
  /** Label override (e.g. "Next: Configure Recurrence"); falls back to ctaLabel(validity). */
  cta?:       string
  /** Optional per-step override for navigation CTAs before final review. */
  canProceed?: boolean
  onPrimary:  () => void
  /** Optional secondary back button. */
  onBack?:    () => void
}

/** Compute the CTA label from validity state. */
export function ctaLabel(validity: BookingValidity): string {
  if (validity.kind === 'ready') {
    return validity.total > 1
      ? `Book ${validity.total} Sessions`
      : 'Book session'
  }
  if (validity.kind === 'invalid') {
    switch (validity.reason) {
      case 'NO_CLIENT':  return 'Select client to continue'
      case 'NO_TIME':    return 'Pick a time to continue'
      case 'NO_PATTERN': return 'Pick a pattern to continue'
      case 'EMPTY_PLAN': return 'Pick a time inside working hours'
    }
  }
  switch (validity.reason) {
    case 'CONFLICT':         return 'Fix conflict to continue'
    case 'OUT_OF_HOURS':     return 'Move to working hours'
    case 'PACKAGE_OVERDRAW': return 'Confirm package overdraw'
  }
}

export function BookingStickyFooter({
  validity,
  isPending,
  cta,
  canProceed,
  onPrimary,
  onBack,
}: BookingStickyFooterProps) {
  const enabled = canProceed ?? (validity.kind === 'ready' || validity.kind === 'blocked' && validity.reason === 'PACKAGE_OVERDRAW')
  const label = cta ?? ctaLabel(validity)

  return (
    <footer
      className="flex shrink-0 items-center gap-3 border-t px-4 py-3"
      style={{
        borderColor: 'var(--fd-border)',
        backgroundColor: 'var(--fd-surface)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)',
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--fd-card-hover)] disabled:opacity-40"
          style={{ color: 'var(--fd-text)' }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <button
        type="button"
        onClick={onPrimary}
        disabled={!enabled || isPending}
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: 'var(--fd-blue)',
          color: 'var(--fd-text-on-primary)',
        }}
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? 'Booking…' : label}
      </button>
    </footer>
  )
}
