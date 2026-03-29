import { cn } from '@/lib/utils'

// ─── Variant definitions ──────────────────────────────────────────────────────

const VARIANTS = {
  // Client / session states
  active:    { bg: 'rgba(78,203,160,0.12)',  text: '#4ECBA0', label: 'Active'    },
  inactive:  { bg: 'rgba(138,143,168,0.12)', text: '#8A8FA8', label: 'Inactive'  },
  upcoming:  { bg: 'rgba(91,156,246,0.12)',  text: '#5B9CF6', label: 'Upcoming'  },
  completed: { bg: 'rgba(78,203,160,0.12)',  text: '#4ECBA0', label: 'Completed' },
  cancelled: { bg: 'rgba(138,143,168,0.10)', text: '#8A8FA8', label: 'Cancelled' },
  missed:    { bg: 'rgba(232,92,106,0.12)',  text: '#E85C6A', label: 'Missed'    },
  // Invoice / payment states
  paid:      { bg: 'rgba(78,203,160,0.12)',  text: '#4ECBA0', label: 'Paid'      },
  pending:   { bg: 'rgba(232,197,71,0.12)',  text: '#E8C547', label: 'Pending'   },
  overdue:   { bg: 'rgba(232,92,106,0.15)',  text: '#E85C6A', label: 'Overdue'   },
  draft:     { bg: 'rgba(138,143,168,0.10)', text: '#8A8FA8', label: 'Draft'     },
} as const

export type BadgeVariant = keyof typeof VARIANTS

// ─── Component ────────────────────────────────────────────────────────────────

interface BadgeProps {
  variant: BadgeVariant
  /** Override the default label derived from the variant key. */
  label?: string
  className?: string
}

export function Badge({ variant, label, className }: BadgeProps) {
  const { bg, text, label: defaultLabel } = VARIANTS[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none',
        className,
      )}
      style={{ backgroundColor: bg, color: text }}
    >
      {label ?? defaultLabel}
    </span>
  )
}
