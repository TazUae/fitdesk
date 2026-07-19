import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand'

const TONE_STYLE: Record<StatusTone, React.CSSProperties> = {
  neutral: { backgroundColor: 'var(--fd-card)',          color: 'var(--fd-muted)', border: '1px solid var(--fd-border)' },
  info:    { backgroundColor: 'var(--fd-blue-subtle)',   color: 'var(--fd-information)' },
  success: { backgroundColor: 'rgba(78,203,160,0.15)',   color: '#1a9e72' },
  warning: { backgroundColor: 'rgba(232,197,71,0.18)',   color: '#a07908' },
  danger:  { backgroundColor: 'rgba(232,92,106,0.12)',   color: 'var(--fd-red)' },
  brand:   { backgroundColor: 'var(--fd-primary-soft)',  color: 'var(--fd-text)' },
}

export interface StatusChipProps {
  tone?: StatusTone
  children: ReactNode
  className?: string
}

/** Canonical status pill (Paid / Overdue / Active / Coming soon / …). */
export function StatusChip({ tone = 'neutral', children, className }: StatusChipProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}
      style={TONE_STYLE[tone]}
    >
      {children}
    </span>
  )
}
