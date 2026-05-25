import { cn } from '@/lib/utils'

// ─── Variant definitions ──────────────────────────────────────────────────────

const VARIANTS = {
  // Client / session states
  active:        { bg: 'var(--fd-blue-subtle)',  text: 'var(--fd-blue)',    label: 'Active'      },
  inactive:      { bg: 'var(--fd-card-hover)',   text: 'var(--fd-muted)',   label: 'Inactive'    },
  upcoming:      { bg: 'var(--fd-blue-subtle)',  text: 'var(--fd-blue)',    label: 'Upcoming'    },
  completed:     { bg: '#E6F4EA',                text: 'var(--fd-green)',   label: 'Completed'   },
  cancelled:     { bg: 'var(--fd-card-hover)',   text: 'var(--fd-muted)',   label: 'Cancelled'   },
  missed:        { bg: '#FCE8E6',                text: 'var(--fd-red)',     label: 'Missed'      },
  // Invoice / payment states
  paid:          { bg: '#E6F4EA',                text: 'var(--fd-green)',   label: 'Paid'        },
  pending:       { bg: 'rgba(227,116,0,0.10)',   text: 'var(--fd-warning)', label: 'Pending'     },
  overdue:       { bg: '#FCE8E6',                text: 'var(--fd-red)',     label: 'Overdue'     },
  draft:         { bg: 'var(--fd-card-hover)',   text: 'var(--fd-muted)',   label: 'Draft'       },
  // Feature availability
  'coming-soon': { bg: 'var(--fd-card-hover)',   text: 'var(--fd-muted)',   label: 'Coming soon' },
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
