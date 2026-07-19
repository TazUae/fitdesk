import { cn } from '@/lib/utils'

// ─── Variant definitions ──────────────────────────────────────────────────────

// Token-driven, contrast-safe (a11y standard §5): status text uses the darker
// semantic tones (--fd-information/-success-like darks), never the pastel
// legacy accents, so every chip clears 4.5:1 on its tint.
const VARIANTS = {
  active:        { bg: 'var(--fd-blue-subtle)',      text: 'var(--fd-information)', label: 'Active'      },
  inactive:      { bg: 'var(--fd-card-hover)',       text: 'var(--fd-muted)',       label: 'Inactive'    },
  upcoming:      { bg: 'var(--fd-blue-subtle)',      text: 'var(--fd-information)', label: 'Upcoming'    },
  completed:     { bg: 'rgba(78,203,160,0.15)',      text: '#157a58',               label: 'Completed'   },
  cancelled:     { bg: 'var(--fd-card-hover)',       text: 'var(--fd-muted)',       label: 'Cancelled'   },
  missed:        { bg: 'rgba(232,92,106,0.12)',      text: 'var(--fd-danger)',      label: 'Missed'      },
  paid:          { bg: 'rgba(78,203,160,0.15)',      text: '#157a58',               label: 'Paid'        },
  pending:       { bg: 'rgba(232,197,71,0.18)',      text: '#8a6508',               label: 'Pending'     },
  overdue:       { bg: 'rgba(232,92,106,0.12)',      text: 'var(--fd-danger)',      label: 'Overdue'     },
  draft:         { bg: 'var(--fd-card-hover)',       text: 'var(--fd-muted)',       label: 'Draft'       },
  'coming-soon': { bg: 'var(--fd-card-hover)',       text: 'var(--fd-muted)',       label: 'Coming soon' },
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
