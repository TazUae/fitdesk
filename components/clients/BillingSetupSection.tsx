'use client'

import { BILLING_MODES, type BillingDraft, type BillingMode } from '@/lib/clients/billing'

// ─── Mode copy ────────────────────────────────────────────────────────────────

const MODE_COPY: Record<BillingMode, { title: string; description: string }> = {
  'Package':         { title: 'Package',         description: 'Client pre-pays for a block of sessions.' },
  'Pay Per Session': { title: 'Pay Per Session', description: 'Client is billed after each session.' },
  'Trial':           { title: 'Trial',           description: 'Free introductory session — no charge.' },
}

// ─── Field label ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
      {children}
      <span className="ml-0.5" style={{ color: 'var(--fd-red)' }}>*</span>
    </label>
  )
}

// ─── Billing setup section ────────────────────────────────────────────────────

/**
 * Required billing section for the new-client form. Fully controlled: holds no
 * state of its own. Switching mode resets the other modes' inputs so a stale
 * value is never displayed or submitted.
 */
export function BillingSetupSection({
  draft,
  onChange,
}: {
  draft:    BillingDraft
  onChange: (next: BillingDraft) => void
}) {
  function selectMode(mode: BillingMode) {
    onChange({ mode, sessionRate: '', packageName: '', packageSessions: '' })
  }

  return (
    <div className="space-y-3">
      <FieldLabel>Billing</FieldLabel>

      {/* Mode selector */}
      <div role="radiogroup" aria-label="Billing mode" className="space-y-2">
        {BILLING_MODES.map(mode => {
          const selected = draft.mode === mode
          const copy     = MODE_COPY[mode]
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => selectMode(mode)}
              className="flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors active:opacity-70"
              style={{
                borderColor:     selected ? 'var(--fd-accent)' : 'var(--fd-border)',
                backgroundColor: 'var(--fd-card)',
              }}
            >
              {/* Radio dot */}
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: selected ? 'var(--fd-accent)' : 'var(--fd-border)' }}
              >
                {selected && (
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--fd-accent)' }} />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                    {copy.title}
                  </span>
                  {mode === 'Package' && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none"
                      style={{ backgroundColor: 'rgba(138,143,168,0.12)', color: 'var(--fd-muted)' }}
                    >
                      Coming soon
                    </span>
                  )}
                </span>
                <span className="block text-xs" style={{ color: 'var(--fd-muted)' }}>
                  {copy.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Package — Phase C0: coming soon. Inputs and price field land in Phase C1. */}
      {draft.mode === 'Package' && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          Package billing is coming soon. Use Pay Per Session or Trial for now.
        </p>
      )}

      {/* Pay Per Session fields */}
      {draft.mode === 'Pay Per Session' && (
        <div
          className="space-y-4 rounded-2xl border p-4"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
        >
          <div className="space-y-1.5">
            <FieldLabel>Session rate</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              value={draft.sessionRate}
              onChange={e => onChange({ ...draft, sessionRate: e.target.value })}
              placeholder="e.g. 50"
              className="input-base"
            />
          </div>
        </div>
      )}

      {/* Trial hint */}
      {draft.mode === 'Trial' && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          No charge for this client&apos;s sessions.
        </p>
      )}
    </div>
  )
}
