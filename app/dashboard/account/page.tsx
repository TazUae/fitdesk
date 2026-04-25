'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { authClient, signOut, useSession } from '@/lib/auth-client'
import { Avatar } from '@/components/modules/Avatar'

// ─── Currency options ─────────────────────────────────────────────────────────

const CURRENCIES = [
  'USD', 'LBP', 'AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD',
  'EGP', 'IQD', 'GBP', 'EUR', 'CAD', 'AUD', 'CHF', 'INR', 'SGD',
  'PKR', 'MYR', 'NGN', 'ZAR', 'BRL', 'MXN', 'TRY', 'SEK', 'NOK', 'NZD',
]

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{hint}</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const router = useRouter()
  const { data: session, isPending: sessionLoading } = useSession()

  const [name,         setName]         = useState('')
  const [phone,        setPhone]        = useState('')
  const [currency,     setCurrency]     = useState('USD')
  const [businessName, setBusinessName] = useState('')
  const [photoUrl,     setPhotoUrl]     = useState('')
  const [showPhoto,    setShowPhoto]    = useState(false)

  const [saving,   setSaving]   = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [saved,    setSaved]    = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed form from session once loaded
  useEffect(() => {
    if (!session?.user) return
    const u = session.user
    setName(u.name ?? '')
    setPhone((u as { phone?: string }).phone ?? '')
    setCurrency((u as { currency?: string }).currency ?? 'USD')
    setBusinessName((u as { businessName?: string }).businessName ?? '')
    setPhotoUrl(u.image ?? '')
  }, [session])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required.'); return }

    setSaving(true)
    const { error } = await authClient.updateUser({
      name:         name.trim(),
      image:        photoUrl.trim() || undefined,
      phone:        phone.trim(),
      currency:     currency.trim(),
      businessName: businessName.trim(),
    })
    setSaving(false)

    if (error) {
      toast.error(error.message ?? 'Failed to save. Please try again.')
      return
    }

    setSaved(true)
    toast.success('Profile saved.')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 3000)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    router.replace('/auth/login')
  }

  if (sessionLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--fd-muted)' }} />
      </div>
    )
  }

  const displayName = name || session?.user?.name || 'Trainer'
  const email = session?.user?.email ?? ''

  const selectStyle = {
    backgroundColor: 'var(--fd-card)',
    color:           'var(--fd-text)',
    borderColor:     'var(--fd-border)',
  }

  return (
    <div className="space-y-6 p-4 pb-10">

      {/* ── Profile photo ────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={displayName}
              className="h-20 w-20 rounded-full object-cover"
              style={{ border: '2px solid var(--fd-border)' }}
            />
          ) : (
            <Avatar name={displayName} size="xl" />
          )}
          <button
            type="button"
            onClick={() => setShowPhoto(v => !v)}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-opacity active:opacity-60"
            style={{
              backgroundColor: 'var(--fd-accent)',
              borderColor:     'var(--fd-bg)',
              color:           'var(--fd-bg)',
            }}
            aria-label="Change photo"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>

        {showPhoto && (
          <div className="w-full max-w-xs">
            <input
              type="url"
              value={photoUrl}
              onChange={e => setPhotoUrl(e.target.value)}
              placeholder="Paste a photo URL…"
              className="input-base text-center text-sm"
            />
            <p className="mt-1 text-center text-xs" style={{ color: 'var(--fd-muted)' }}>
              Paste a direct link to your photo
            </p>
          </div>
        )}

        <div className="text-center">
          <p className="font-semibold" style={{ color: 'var(--fd-text)' }}>{displayName}</p>
          <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{email}</p>
        </div>
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSave}>
        <div
          className="rounded-2xl border divide-y space-y-0"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >

          {/* Full name */}
          <div className="p-4">
            <Field label="Full name">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="input-base"
              />
            </Field>
          </div>

          {/* Email — read-only */}
          <div className="p-4">
            <Field label="Email" hint="Contact support to change your email address.">
              <input
                type="email"
                value={email}
                readOnly
                className="input-base opacity-50 cursor-not-allowed"
              />
            </Field>
          </div>

          {/* Phone */}
          <div className="p-4">
            <Field label="Phone number" hint="Used for your WhatsApp business connection.">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+961 71 234 567"
                className="input-base"
              />
            </Field>
          </div>

          {/* Currency */}
          <div className="p-4">
            <Field label="Preferred currency" hint="Used on invoices and payments.">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="input-base appearance-none"
                style={selectStyle}
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Business name */}
          <div className="p-4">
            <Field label="Business / Studio name" hint="Optional — shown on invoices instead of your personal name.">
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. FitLife Studio, Alex PT"
                className="input-base"
              />
            </Field>
          </div>

        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={saving || saved}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-60 active:scale-[0.98]"
          style={{ backgroundColor: 'var(--fd-green)', color: '#0F1117' }}
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : saved ? (
            <><Check className="h-4 w-4" /> Saved</>
          ) : (
            'Save Changes'
          )}
        </button>
      </form>

      {/* ── Sign out ──────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
          Sign out
        </p>
        <p className="mb-4 text-xs" style={{ color: 'var(--fd-muted)' }}>
          You&apos;ll be returned to the login screen.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-opacity disabled:opacity-50 active:opacity-60"
          style={{ borderColor: 'rgba(232,92,106,0.4)', color: 'var(--fd-red)', backgroundColor: 'rgba(232,92,106,0.06)' }}
        >
          {signingOut
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing out…</>
            : <><LogOut className="h-4 w-4" /> Sign Out</>
          }
        </button>
      </div>

    </div>
  )
}
