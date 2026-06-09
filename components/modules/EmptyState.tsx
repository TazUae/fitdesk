import Link from 'next/link'
import type { ComponentType, SVGProps } from 'react'

interface EmptyStateProps {
  Icon?:    ComponentType<SVGProps<SVGSVGElement>>
  title:    string
  body?:    string
  ctaHref?: string
  ctaLabel?: string
}

export function EmptyState({ Icon, title, body, ctaHref, ctaLabel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {Icon && (
        <Icon className="h-8 w-8 opacity-30" style={{ color: 'var(--fd-muted)' }} />
      )}
      <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
        {title}
      </p>
      {body && (
        <p className="max-w-[280px] text-xs" style={{ color: 'var(--fd-muted)' }}>
          {body}
        </p>
      )}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-1 text-xs font-semibold"
          style={{ color: 'var(--fd-accent)' }}
        >
          {ctaLabel} →
        </Link>
      )}
    </div>
  )
}
