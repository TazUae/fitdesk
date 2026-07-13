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
  Package,
  Shield,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { addClientNoteAction, addProgressEntryAction, completeClientAction, dismissClientAction, syncClientBillingMode } from '@/actions/clients'
import { AssignPackageSheet } from '@/components/clients/AssignPackageSheet'
import { PackageDetailsSheet } from '@/components/clients/PackageDetailsSheet'
import type { ClientHubOverview } from '@/types/clients'
import type { ActionIntentType } from '@/types/clients'

// ─── Labels ───────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<ActionIntentType, string> = {
  send_whatsapp_welcome:       'Send WhatsApp welcome',
  send_intake_form:            'Send intake form',
  book_first_session:          'Book first session',
  setup_billing:               'Set up billing',
  create_program:              'Create program',
  review_safety_note:          'Review safety note',
  whatsapp_reminder_candidate: 'WhatsApp reminder suggested',
  missing_next_session:       'No upcoming session — book one',
}

const EVENT_LABELS: Record<string, string> = {
  'client.created':            'Client added',
  'client.backfilled':         'Profile synced from ERP',
  'client.phone_unnormalized': 'Phone stored (not normalized)',
  'duplicate.override':        'Added despite duplicate warning',
  'action_intent.completed':   'Action completed',
  'action_intent.dismissed':   'Action dismissed',
  'client.progress':           'Progress entry added',
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

export function ClientHubPanel({
  overview,
  nextSessionLabel,
}: {
  overview: ClientHubOverview
  /**
   * Display-only override for the "Next session" chip, computed live from the
   * client's session list (same getNextUp logic as the dashboard). Preferred
   * over `client.nextSessionAtUtc` because that projection field is never
   * written in production (reconcile is dry-run only — see lib/clients/reconcile.ts).
   */
  nextSessionLabel?: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { client, goals, hasGoalHistory, pendingActions, recentNotes, progressEntries, placeholders } = overview
  const [assignSheetOpen, setAssignSheetOpen]   = useState(false)
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false)
  const [billingSyncMessage, setBillingSyncMessage] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [isNotePending, startNoteTransition] = useTransition()
  const [progressDraft, setProgressDraft] = useState('')
  const [progressGoalId, setProgressGoalId] = useState('')
  const [isProgressPending, startProgressTransition] = useTransition()

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

  function handleAddNote() {
    const text = noteDraft.trim()
    if (!text) return

    startNoteTransition(async () => {
      const result = await addClientNoteAction(client.clientIndexId, text)
      if (!result.success) {
        toast.error(result.error ?? 'Could not add note.')
        return
      }
      setNoteDraft('')
      router.refresh()
    })
  }

  function handleAddProgress() {
    const text = progressDraft.trim()
    if (!text) return

    startProgressTransition(async () => {
      const result = await addProgressEntryAction(client.clientIndexId, text, progressGoalId || null)
      if (!result.success) {
        toast.error(result.error ?? 'Could not add progress entry.')
        return
      }
      if (result.data.outcome !== 'created') {
        toast.error(
          result.data.outcome === 'invalid_goal_link'
            ? 'That goal is no longer linked to this client.'
            : 'Client profile not found.',
        )
        return
      }
      setProgressDraft('')
      setProgressGoalId('')
      router.refresh()
    })
  }

  function handleSyncBilling() {
    setBillingSyncMessage(null)

    startTransition(async () => {
      const result = await syncClientBillingMode(client.erpCustomerId)

      if (!result.success) {
        toast.error(result.error ?? 'Could not sync billing setup.')
        return
      }

      if (result.data.applied) {
        const label = result.data.mode === 'pay_per_session' ? 'Per session' : 'Package'
        toast.success('Billing synced to ' + label + '.')
        router.refresh()
        return
      }

      if (result.data.reason === 'erp_unset') {
        setBillingSyncMessage('No billing setup found yet.')
        return
      }

      toast.success('Billing setup is already synced.')
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
            value={
              nextSessionLabel
                ? nextSessionLabel
                : client.nextSessionAtUtc
                  ? formatDate(client.nextSessionAtUtc)
                  : 'Not booked'
            }
          />
          {client.primaryGoalLabel && (
            <Chip label="Goal" value={client.primaryGoalLabel} accent />
          )}
        </div>
        {client.billingMode === 'unset' && (
          <div
            className="rounded-xl border px-3 py-3 space-y-2"
            style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
          >
            <p className="text-xs leading-relaxed" style={{ color: 'var(--fd-muted)' }}>
              Sync the existing ERP billing setup into FitDesk before session invoicing.
            </p>
            {billingSyncMessage && (
              <p className="text-xs font-medium" style={{ color: 'var(--fd-muted)' }}>
                {billingSyncMessage}
              </p>
            )}
            <button
              type="button"
              onClick={handleSyncBilling}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'rgba(78,203,160,0.12)', color: 'var(--fd-green)' }}
            >
              {isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5" />
              }
              Sync billing setup
            </button>
          </div>
        )}
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
          <div className="space-y-4">
            {goals.map(g => (
              <div
                key={g.id}
                className="rounded-lg border p-3"
                style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)' }}
              >
                {/* Goal header: label + primary badge + confidence */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                      {g.primaryGoalLabel ?? g.goalId.replace(/_/g, ' ')}
                    </span>
                    {g.isPrimary && (
                      <span className="inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: 'rgba(78,203,160,0.12)', color: 'var(--fd-green)' }}>
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs capitalize" style={{ color: 'var(--fd-muted)' }}>
                      {g.confidence}
                    </span>
                    <span className="text-xs capitalize" style={{ color: 'var(--fd-muted)' }}>
                      {g.urgency.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* Client-stated sub-goals (primary layer) */}
                {g.subGoalIds.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
                      Client focus:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.subGoalIds.map(id => (
                        <span key={id} className="inline-block rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--fd-surface)', color: 'var(--fd-muted)' }}>
                          {id.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trainer-assessed sub-goals (secondary layer) */}
                {g.trainerSubGoalIds.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
                      Trainer assessment:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.trainerSubGoalIds.map(id => (
                        <span key={id} className="inline-block rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--fd-surface)', color: 'var(--fd-muted)' }}>
                          {id.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trainer notes */}
                {g.notes && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--fd-muted)' }}>
                      Notes:
                    </p>
                    <p className="text-xs" style={{ color: 'var(--fd-text)' }}>
                      {g.notes}
                    </p>
                  </div>
                )}

                {/* Safety flags */}
                {g.safetyFlags.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold" style={{ color: 'rgb(217,158,0)' }}>
                      ⚠ Safety flags:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.safetyFlags.map(flag => (
                        <span key={flag} className="inline-block rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(251,191,36,0.12)', color: 'rgb(217,158,0)' }}>
                          {flag.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Local goal history exists but zero active goals → "Goals not configured".
          Never resurrect stale ERP custom_fitness_goals text here (Decision D3). */}
      {goals.length === 0 && hasGoalHistory && (
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <div className="flex items-center gap-2">
            <Goal className="h-4 w-4" style={{ color: 'var(--fd-accent)' }} />
            <SectionHeader>Goals</SectionHeader>
          </div>
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            Goals not configured
          </p>
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
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
          <SectionHeader>Recent activity</SectionHeader>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !isNotePending) handleAddNote()
            }}
            placeholder="Add a quick note…"
            maxLength={500}
            disabled={isNotePending}
            className="flex-1 rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
            style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={isNotePending || !noteDraft.trim()}
            className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(78,203,160,0.12)', color: 'var(--fd-green)' }}
          >
            {isNotePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
          </button>
        </div>

        {recentNotes.length > 0 ? (
          <div className="space-y-2">
            {recentNotes.map(note => (
              <div key={note.id} className="flex items-center justify-between text-sm gap-3">
                <span className="min-w-0 truncate" style={{ color: 'var(--fd-text)' }}>
                  {note.text ?? formatEventType(note.type)}
                </span>
                <span className="text-xs shrink-0" style={{ color: 'var(--fd-muted)' }}>
                  {formatDate(note.createdAtUtc)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            No activity yet.
          </p>
        )}
      </div>

      {/* ── Progress (US-052) ───────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: 'var(--fd-muted)' }} />
          <SectionHeader>Progress</SectionHeader>
        </div>

        <div className="space-y-2">
          <textarea
            value={progressDraft}
            onChange={e => setProgressDraft(e.target.value)}
            placeholder="Log a progress update…"
            maxLength={500}
            rows={2}
            disabled={isProgressPending}
            className="w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
            style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
          />
          <div className="flex gap-2">
            {goals.length > 0 && (
              <select
                value={progressGoalId}
                onChange={e => setProgressGoalId(e.target.value)}
                disabled={isProgressPending}
                className="flex-1 rounded-xl border px-3 py-2 text-xs disabled:opacity-50"
                style={{ backgroundColor: 'var(--fd-card)', borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
              >
                <option value="">No goal link</option>
                {goals.map(g => (
                  <option key={g.id} value={g.goalId}>
                    {g.primaryGoalLabel ?? g.goalId}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleAddProgress}
              disabled={isProgressPending || !progressDraft.trim()}
              className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'rgba(78,203,160,0.12)', color: 'var(--fd-green)' }}
            >
              {isProgressPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </button>
          </div>
        </div>

        {progressEntries.length > 0 ? (
          <div className="space-y-2">
            {progressEntries.map(entry => (
              <div key={entry.id} className="text-sm">
                <p style={{ color: 'var(--fd-text)' }}>{entry.text}</p>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--fd-muted)' }}>
                  <span>{formatDate(entry.createdAtUtc)}</span>
                  {entry.goalId && (
                    <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--fd-card)' }}>
                      {goals.find(g => g.goalId === entry.goalId)?.primaryGoalLabel ?? entry.goalId}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            No progress entries yet.
          </p>
        )}
      </div>

      {/* ── Placeholders ──────────────────────────────────────────────────────── */}
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
