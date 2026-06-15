'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Sparkles, X } from 'lucide-react'
import { PhoneInput, type PhoneValue } from '@/components/ui/PhoneInput'
import { AgeInput, type AgeValue } from '@/components/ui/AgeInput'
import { GoalMultiSelect, type SubGoalsMap } from '@/components/ui/GoalMultiSelect'

interface AddClientSheetProps {
  open:    boolean
  onClose: () => void
}

export function AddClientSheet({ open, onClose }: AddClientSheetProps) {
  const [name,        setName]        = useState('')
  const [phoneValue,  setPhoneValue]  = useState<PhoneValue | undefined>()
  const [ageValue,    setAgeValue]    = useState<AgeValue>({})
  const [goals,       setGoals]       = useState<string[]>([])
  const [subGoals,    setSubGoals]    = useState<SubGoalsMap>({})
  const [notes,       setNotes]       = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [isDesktop,   setIsDesktop]   = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)

  // Detect desktop viewport (lg = 1024px)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape key closes
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus name field after sheet animates in
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => nameRef.current?.focus(), 60)
    return () => clearTimeout(id)
  }, [open])

  // Reset form state after the close animation finishes
  useEffect(() => {
    if (open) return
    const id = setTimeout(() => {
      setName('')
      setPhoneValue(undefined)
      setAgeValue({})
      setGoals([])
      setSubGoals({})
      setNotes('')
      setDetailsOpen(false)
    }, 350)
    return () => clearTimeout(id)
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Phase C — inert. Backend wiring in Phase D.
  }

  // ── Responsive positioning ──────────────────────────────────────────────────
  // Mobile: slide up from bottom. Desktop (lg+): slide in from right.

  const containerClass = isDesktop
    ? 'fixed top-0 right-0 z-50 flex h-full w-full max-w-[460px] flex-col border-l rounded-l-[20px]'
    : 'fixed bottom-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 flex-col rounded-t-[28px] border-t'

  const containerStyle: React.CSSProperties = {
    backgroundColor: 'var(--fd-surface)',
    borderColor:     'var(--fd-border)',
    transition:      'transform 300ms cubic-bezier(0.32,0.72,0,1)',
    ...(isDesktop
      ? { transform: `translateX(${open ? '0%' : '100%'})` }
      : {
          transform: `translateX(-50%) translateY(${open ? '0%' : '100%'})`,
          maxHeight: '90dvh',
        }
    ),
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(15,23,42,0.55)',
          opacity:          open ? 1 : 0,
          pointerEvents:    open ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />

      {/* Sheet / Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add client"
        className={containerClass}
        style={containerStyle}
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--fd-border)' }} />
          </div>
        )}

        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--fd-text)' }}>
            Add client
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ backgroundColor: 'var(--fd-card)', color: 'var(--fd-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form — flex-1 so it fills remaining height */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Full name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                Full name
                <span className="ml-1 text-xs font-normal" style={{ color: 'var(--fd-red)' }}>
                  {' '}*
                </span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sara Khoury"
                className="input-base"
                autoComplete="name"
                required
              />
            </div>

            {/* Phone + WhatsApp toggle */}
            <PhoneInput
              value={phoneValue}
              onChange={setPhoneValue}
              label="Phone"
              required
              showWhatsApp
            />

            {/* Progressive disclosure */}
            <div>
              <button
                type="button"
                onClick={() => setDetailsOpen(p => !p)}
                className="flex w-full items-center justify-between border-t pt-4 text-sm font-medium transition-opacity active:opacity-60"
                style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-muted)' }}
              >
                Add more details
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-200"
                  style={{
                    color:     'var(--fd-muted)',
                    transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>

              {detailsOpen && (
                <div className="pt-5 space-y-5">
                  <GoalMultiSelect
                    goals={goals}
                    subGoals={subGoals}
                    onGoalsChange={setGoals}
                    onSubGoalsChange={setSubGoals}
                  />

                  <AgeInput value={ageValue} onChange={setAgeValue} />

                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
                      Trainer notes
                      <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--fd-muted)' }}>
                        (optional)
                      </span>
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Health notes, goals, context…"
                      rows={3}
                      className="input-base resize-none"
                    />
                  </div>

                  {/* Quick add from text — visual placeholder only in Phase C */}
                  <div
                    className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3"
                    style={{ borderColor: 'var(--fd-border)' }}
                  >
                    <Sparkles className="h-4 w-4 shrink-0" style={{ color: 'var(--fd-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
                      Quick add from text — coming next
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div
            className="flex-shrink-0 flex gap-3 border-t px-6 pt-4"
            style={{
              borderColor:  'var(--fd-border)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border py-3 text-sm font-semibold transition-opacity active:opacity-60"
              style={{
                borderColor:     'var(--fd-border)',
                color:           'var(--fd-text)',
                backgroundColor: 'var(--fd-card)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl py-3 text-sm font-semibold transition-opacity active:opacity-60"
              style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
            >
              Create client
            </button>
          </div>

        </form>
      </div>
    </>
  )
}
