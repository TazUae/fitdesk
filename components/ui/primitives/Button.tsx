'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and disables the button. Keeps the label visible. */
  loading?: boolean
  /** Stretches to full container width. */
  block?: boolean
  children: ReactNode
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs rounded-xl gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-5 py-3.5 text-sm rounded-2xl gap-2',
}

const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
  primary:     { backgroundColor: 'var(--fd-primary)',  color: 'var(--fd-text-on-primary)' },
  secondary:   { backgroundColor: 'var(--fd-card)',     color: 'var(--fd-text)', border: '1px solid var(--fd-border)' },
  ghost:       { backgroundColor: 'transparent',        color: 'var(--fd-muted)' },
  destructive: { backgroundColor: 'var(--fd-danger)',   color: '#fff' },
  success:     { backgroundColor: 'var(--fd-success)',  color: '#fff' },
}

/**
 * Canonical action button. Every new/modernized surface must use this instead
 * of hand-rolled <button> styling (ADR-UX-012 direction).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, disabled, className, style, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-opacity',
        'disabled:opacity-40 active:opacity-80 hover:opacity-90',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        SIZE_CLASS[size],
        block && 'w-full',
        className,
      )}
      style={{ outlineColor: 'var(--fd-primary-strong)', ...VARIANT_STYLE[variant], ...style }}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
})
