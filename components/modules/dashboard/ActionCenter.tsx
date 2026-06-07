import Link from 'next/link'
import {
  AlertTriangle,
  DollarSign,
  Package,
  MessageCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react'
import { NeedsResolutionList } from './NeedsResolutionList'
import type { DashboardActionItem, SessionResolvable } from '@/lib/dashboard/derive'

interface Props {
  items: DashboardActionItem[]
}

// ─── Icon + accent per kind ───────────────────────────────────────────────────

const KIND_CONFIG = {
  needs_resolution: {
    Icon:     AlertTriangle,
    color:    'var(--fd-red)',
    bg:       'rgba(217,48,37,0.10)',
    rowBg:    'rgba(217,48,37,0.05)',
    rowBorder:'rgba(217,48,37,0.18)',
  },
  payment: {
    Icon:     DollarSign,
    color:    'var(--fd-warning)',
    bg:       'rgba(232,116,0,0.10)',
    rowBg:    'rgba(232,116,0,0.04)',
    rowBorder:'rgba(232,116,0,0.18)',
  },
  low_package: {
    Icon:     Package,
    color:    'var(--fd-warning)',
    bg:       'rgba(232,116,0,0.10)',
    rowBg:    'rgba(232,116,0,0.04)',
    rowBorder:'rgba(232,116,0,0.14)',
  },
  reminder: {
    Icon:     MessageCircle,
    color:    'var(--fd-blue)',
    bg:       'rgba(26,115,232,0.10)',
    rowBg:    'rgba(26,115,232,0.04)',
    rowBorder:'rgba(26,115,232,0.15)',
  },
} as const

// ─── Group labels ─────────────────────────────────────────────────────────────

const GROUP_LABEL: Record<string, string> = {
  needs_resolution: 'Needs you now',
  payment:          'Money',
  low_package:      'Follow-ups',
  reminder:         'Follow-ups',
}

// ─── Nav action row ───────────────────────────────────────────────────────────

function ActionRow({ item }: { item: DashboardActionItem }) {
  if (!item.href) return null
  const cfg = KIND_CONFIG[item.kind]
  const { Icon } = cfg

  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-opacity hover:opacity-90 active:opacity-70"
      style={{ backgroundColor: cfg.rowBg, border: `1px solid ${cfg.rowBorder}` }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: cfg.bg }}
      >
        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          {item.title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--fd-muted)' }}>
          {item.subtitle}
        </p>
      </div>
      <span
        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        View →
      </span>
    </Link>
  )
}

// ─── Section divider ──────────────────────────────────────────────────────────

function GroupLabel({ label }: { label: string }) {
  return (
    <p
      className="px-1 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.09em] first:pt-0"
      style={{ color: 'var(--fd-muted)' }}
    >
      {label}
    </p>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ActionCenter({ items }: Props) {
  const resolvable = items
    .filter(i => i.kind === 'needs_resolution' && i.sessionResolvable)
    .map(i => i.sessionResolvable as SessionResolvable)

  const navItems  = items.filter(i => i.kind !== 'needs_resolution')
  const isEmpty   = items.length === 0

  // Build display groups (preserve priority order, merge follow-up kinds under one label)
  const groups: { label: string; items: DashboardActionItem[] }[] = []
  let currentLabel = ''
  for (const item of navItems) {
    const label = GROUP_LABEL[item.kind] ?? 'Other'
    if (label !== currentLabel) {
      groups.push({ label, items: [] })
      currentLabel = label
    }
    groups[groups.length - 1].items.push(item)
  }

  return (
    <section className="space-y-2" id="action-center">
      {/* Section header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <Zap
            className="h-4 w-4"
            style={{ color: isEmpty ? 'var(--fd-muted)' : 'var(--fd-red)' }}
          />
          <p className="text-sm font-bold" style={{ color: 'var(--fd-text)' }}>
            Action Center
          </p>
        </div>
        {!isEmpty && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-none"
            style={{ backgroundColor: 'rgba(217,48,37,0.12)', color: 'var(--fd-red)' }}
          >
            {items.length} to-do
          </span>
        )}
        {isEmpty && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-none"
            style={{ backgroundColor: 'rgba(24,128,56,0.10)', color: 'var(--fd-green)' }}
          >
            All clear ✓
          </span>
        )}
      </div>

      {/* Card */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--fd-surface)',
          borderColor:     isEmpty ? 'var(--fd-border)' : 'rgba(217,48,37,0.18)',
          boxShadow: isEmpty
            ? '0 1px 2px rgba(60,64,67,0.06)'
            : 'inset 4px 0 0 var(--fd-red), 0 2px 8px rgba(217,48,37,0.08), 0 1px 3px rgba(60,64,67,0.06)',
        }}
      >
        {isEmpty ? (
          <div className="flex items-center gap-4 px-5 py-7">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(24,128,56,0.10)' }}
            >
              <CheckCircle2 className="h-6 w-6" style={{ color: 'var(--fd-green)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                You&apos;re all caught up
              </p>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--fd-muted)' }}>
                No sessions need marking · no payments due
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {/* Needs resolution group (always first, no separate group label for clarity) */}
            {resolvable.length > 0 && (
              <>
                <GroupLabel label="Needs you now" />
                <NeedsResolutionList sessions={resolvable} />
              </>
            )}
            {/* Nav groups */}
            {groups.map((group, gi) => (
              <div key={`${group.label}-${gi}`}>
                <GroupLabel label={group.label} />
                {group.items.map(item => (
                  <ActionRow key={item.id} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
