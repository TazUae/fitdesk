import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 'surface' = white; 'inset' = subtle card fill; 'danger'|'warning'|'success' = tinted signal surfaces. */
  tone?: 'surface' | 'inset' | 'danger' | 'warning' | 'success'
  padding?: 'none' | 'sm' | 'md'
  children: ReactNode
}

const TONE_STYLE: Record<NonNullable<CardProps['tone']>, React.CSSProperties> = {
  surface: { backgroundColor: 'var(--fd-surface)', border: '1px solid var(--fd-border)' },
  inset:   { backgroundColor: 'var(--fd-card)',    border: '1px solid var(--fd-border)' },
  danger:  { backgroundColor: 'rgba(232,92,106,0.08)',  border: '1px solid rgba(232,92,106,0.25)' },
  warning: { backgroundColor: 'rgba(232,197,71,0.10)',  border: '1px solid rgba(232,197,71,0.35)' },
  success: { backgroundColor: 'rgba(78,203,160,0.10)',  border: '1px solid rgba(78,203,160,0.30)' },
}

const PAD_CLASS = { none: '', sm: 'p-3', md: 'p-4' }

/** Canonical content container. */
export function Card({ tone = 'surface', padding = 'md', className, style, children, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl', PAD_CLASS[padding], className)}
      style={{ ...TONE_STYLE[tone], ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}
