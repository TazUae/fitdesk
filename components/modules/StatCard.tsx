import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label:    string
  value:    string | number
  subtext?: string
  accent?:  string
  Icon?:    LucideIcon
  className?: string
  /** Full-width hero card — larger value, accent left border, bigger icon. */
  featured?: boolean
  /** Compact card for 3-column grids — tighter padding and smaller text. */
  compact?: boolean
}

export function StatCard({
  label,
  value,
  subtext,
  accent,
  Icon,
  className,
  featured = false,
  compact  = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border',
        featured ? 'p-5' : compact ? 'p-3' : 'p-4',
        className,
      )}
      style={{
        backgroundColor: featured && accent
          ? `color-mix(in srgb, ${accent} 8%, var(--fd-surface))`
          : 'var(--fd-surface)',
        borderColor: featured && accent
          ? `color-mix(in srgb, ${accent} 35%, var(--fd-border))`
          : 'var(--fd-border)',
        ...(featured && accent ? { borderLeft: `4px solid ${accent}` } : {}),
      }}
    >
      {/* Icon — hidden on compact cards */}
      {Icon && !compact && (
        <Icon
          className={cn(
            'absolute right-4 opacity-25',
            featured ? 'top-5 h-5 w-5' : 'top-4 h-4 w-4',
          )}
          style={{ color: accent ?? 'var(--fd-muted)' }}
        />
      )}

      <p
        className={cn('font-medium', compact ? 'text-[11px]' : 'text-xs')}
        style={{ color: 'var(--fd-muted)' }}
      >
        {label}
      </p>

      <p
        className={cn(
          'mt-1 font-bold leading-none tracking-tight',
          featured ? 'text-3xl' : compact ? 'text-xl' : 'text-2xl',
        )}
        style={{ color: accent ?? 'var(--fd-text)' }}
      >
        {value}
      </p>

      {subtext && !compact && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--fd-muted)' }}>
          {subtext}
        </p>
      )}
    </div>
  )
}
