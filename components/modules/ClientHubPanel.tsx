'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Goal,
  Loader2,
  MessageCircle,
  Package,
  Shield,
  Sparkles,
  X,
} from 'lucide-react'
import { completeClientAction, dismissClientAction } from '@/actions/clients'
import { AssignPackageSheet } from '@/components/clients/AssignPackageSheet'
import { PackageDetailsSheet } from '@/components/clients/PackageDetailsSheet'
import type { ClientHubOverview } from '@/types/clients'
import type { ActionIntentType } from '@/types/clients'

// ─── Labels ───────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<ActionIntentType, string> = {
  send_whatsapp_welcome: 'Send WhatsApp welcome',
  send_intake_form:      'Send intake form',
  book_first_session:    'Book first session',
  setup_billing:         'Set up billing',
  create_program:        'Create program',
  review_safety_note:    'Review safety note',
}

const EVENT_LABELS: Record<string, string> = {
  'client.created':            'Client added',
  'client.backfilled':         'Profile synced from ERP',
  'client.phone_unnormalized': 'Phone stored (not normalized)',
  'duplicate.override':        'Added despite duplicate warning',
  'action_intent.completed':   'Action completed',
  'action_intent.dismissed':   'Action dismissed',
}

function formatEventType(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/[._]/g, ' ')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
      {children}
    </h3>
  )
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl px-3 py-2 text-center"
      style={{ backgroundColor: 'var(--fd-card)' }}
    >
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--fd-muted)' }}>
        {label}
      </span>
      <span
        className="text-xs font-semibold"
        style={{ color: accent ? 'var(--fd-accent)' : 'var(--fd-text)' }}
      >
        {value}
      </span>
    </div>
  )
}

function SafetyBanner({ state }: { state: string }) {
  if (state === 'clear') return null
  const isBlocked = state === 'blocked_downstream'
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: isBlocked ? 'rgba(232,92,106,0.08)' : 'rgba(232,197,71,0.08)',
        border:          `1px solid ${isBlocked ? 'rgba(232,92,106,0.3)' : 'rgba(232,197,71,0.35)'}`,
        color:           isBlocked ? 'var(--fd-red)' : '#d4a017',
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-semibold">
        {isBlocked ? 'Client blocked — review required' : 'Safety review needed'}
      </span>
    </div>
  )
}

function ActionCard({
  intent,
  onComplete,
  onDismiss,
  isPending,
}: {
  intent: { id: string; type: ActionIntentType; priority: string; reason: string | null; dueAtUtc: string | null }
  onComplete: (id: string) => void
  onDismiss: (id: string) => void
  isPending: boolean
}) {
  const label = INTENT_LABELS[intent.type] ?? intent.type
  return (
    <div
      className="rounded-xl border px-4 py-3 space-y-2"
      style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--fd-text)' }}>
            {label}
          </p>
          {intent.reason && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--fd-muted)' }}>
              {intent.reason}
            </p>
          )}
          {intent.dueAtUtc && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--fd-muted)' }}>
              <Clock className="h-3 w-3" />
              Due {formatDate(intent.dueAtUtc)}
            </p>
          )}
        </div>
        {intent.priority === 'high' && (
          <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(232,92,106,0.12)', color: 'var(--fd-red)' }}>
            High
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onComplete(intent.id)}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'rgba(78,203,160,0.12)', color: 'var(--fd-green)' }}
        >
          {isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <CheckCircle2 className="h-3.5 w-3.5" />
          }
          Done
        </button>
        <button
          type="button"
          onClick={() => onDismiss(intent.id)}
          disabled={isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ClientHubPanel({ overview }: { overview: ClientHubOverview }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { client, goals, pendingActions, recentNotes, placeholders } = overview
  const [assignSheetOpen, setAssignSheetOpen]   = useState(false)
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false)

  function handleComplete(intentId: string) {
    startTransition(async () => {
      const result = await completeClientAction(intentId)
      if (!result.success) {
        toast.error(result.error ?? 'Could not mark as done.')
        return
      }
      router.refresh()
    })
  }

  function handleDismiss(intentId: string) {
    startTransition(async () => {
      const result = await dismissClientAction(intentId)
      if (!result.success) {
        toast.error(result.error ?? 'Could not dismiss.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Safety banner (only when not clear) ─────────────────────────────── */}
      <SafetyBanner state={client.safetyState} />

      {/* ── Summary chips ────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
          <SectionHeader>Client profile</SectionHeader>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Chip
            label="WhatsApp"
            value={client.whatsappEnabled ? 'Enabled' : 'Not set'}
            accent={client.whatsappEnabled}
          />
          <Chip
            label="Onboarding"
            value={{
              not_started: 'Not started',
              sent:        'Sent',
              in_progress: 'In progress',
              completed:   'Completed',
            }[client.onboardingState] ?? client.onboardingState}
          />
          <Chip
            label="Billing"
            value={{
              unset:           'Not set',
              package:         'Package',
              pay_per_session: 'Per session',
            }[client.billingMode] ?? client.billingMode}
          />
          <Chip
            label="Payment"
            value={{
              unset:      '—',
              paid:       'Paid',
              to_collect: 'To collect',
              overdue:    'Overdue',
            }[client.paymentSummary] ?? client.paymentSummary}
          />
          <Chip
            label="Next session"
            value={client.nextSessionAtUtc ? formatDate(client.nextSessionAtUtc) : 'Not booked'}
          />
          {client.primaryGoalLabel && (
            <Chip label="Goal" value={client.primaryGoalLabel} accent />
          )}
        </div>
      </div>

      {/* ── Goals ────────────────────────────────────────────────────────────── */}
      {goals.length > 0 && (
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-2">
            <Goal className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
            <SectionHeader>Goals</SectionHeader>
          </div>
          <div className="space-y-2">
            {goals.map(g => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--fd-text)' }}>
                  {g.primaryGoalLabel ?? g.goalId.replace(/_/g, ' ')}
                </span>
                <span className="text-xs capitalize" style={{ color: 'var(--fd-muted)' }}>
                  {g.confidence}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Action queue ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
          <SectionHeader>
            Next steps
            {pendingActions.length > 0 && (
              <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                ({pendingActions.length})
              </span>
            )}
          </SectionHeader>
        </div>

        {pendingActions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            No pending actions.
          </p>
        ) : (
          <div className="space-y-2">
            {pendingActions.map(intent => (
              <ActionCard
                key={intent.id}
                intent={intent}
                onComplete={handleComplete}
                onDismiss={handleDismiss}
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Packages ─────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
            <SectionHeader>Packages</SectionHeader>
          </div>
          <button
            type="button"
            onClick={() => setAssignSheetOpen(true)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity active:opacity-70"
            style={{ backgroundColor: 'rgba(78,203,160,0.12)', color: 'var(--fd-green)' }}
          >
            {overview.packageBalance ? 'Assign another package' : 'Assign package'}
          </button>
        </div>

        {overview.packageBalance ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--fd-accent)' }}>
              {overview.packageBalance.totalAvailableSessions}{' '}
              session{overview.packageBalance.totalAvailableSessions !== 1 ? 's' : ''} available
            </p>
            {overview.packageBalance.displayTemplateName && (
              <p className="text-xs truncate" style={{ color: 'var(--fd-text)' }}>
                {overview.packageBalance.displayTemplateName}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                {overview.packageBalance.activePurchaseCount}{' '}
                active package{overview.packageBalance.activePurchaseCount !== 1 ? 's' : ''}
              </p>
              <button
                type="button"
                onClick={() => setDetailsSheetOpen(true)}
                className="text-xs font-semibold"
                style={{ color: 'var(--fd-accent)' }}
              >
                View details
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            Assign a session package to this client.
          </p>
        )}
      </div>

      {/* ── Recent activity ───────────────────────────────────────────────────── */}
      {recentNotes.length > 0 && (
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
            <SectionHeader>Recent activity</SectionHeader>
          </div>
          <div className="space-y-2">
            {recentNotes.map(note => (
              <div key={note.id} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--fd-text)' }}>
                  {formatEventType(note.type)}
                </span>
                <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                  {formatDate(note.createdAtUtc)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Placeholders ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-2xl border p-4 space-y-1"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-text)' }}>
              Program
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {placeholders.trainingProgram.label}
          </p>
        </div>
        <div
          className="rounded-2xl border p-4 space-y-1"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--fd-text)' }}>
              Progress
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            {placeholders.progress.label}
          </p>
        </div>
      </div>

      {/* Assign Package sheet — mounted here so it can access the client context */}
      <AssignPackageSheet
        open={assignSheetOpen}
        onClose={() => setAssignSheetOpen(false)}
        clientIndexId={client.clientIndexId}
        erpCustomerId={client.erpCustomerId}
      />

      {/* Package Details sheet — shows active packages with void option */}
      <PackageDetailsSheet
        open={detailsSheetOpen}
        onClose={() => setDetailsSheetOpen(false)}
        clientIndexId={client.clientIndexId}
        erpCustomerId={client.erpCustomerId}
      />
    </div>
  )
}
