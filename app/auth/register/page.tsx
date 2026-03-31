'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { signIn, signUp, useSession } from '@/lib/auth-client'

export default function RegisterPage() {
  const router = useRouter()
  const { data: session, isPending: sessionLoading } = useSession()
  const [loading, setLoading] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (!sessionLoading && session) {
      router.replace('/dashboard')
    }
  }, [session, sessionLoading, router])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const name = fd.get('name') as string
    const email = fd.get('email') as string
    const phone = fd.get('phone') as string
    const password = fd.get('password') as string
    const confirm = fd.get('confirmPassword') as string

    if (password !== confirm) {
      toast.error('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const { error } = await signUp.email({
      name,
      email,
      password,
      phone: phone || undefined,
    })
    setLoading(false)

    if (error) {
      toast.error(error.message ?? 'Registration failed. Please try again.')
      return
    }

    toast.success('Account created! Signing you in…')
    router.replace('/onboarding')
  }

  async function handleGoogle() {
    await signIn.social({ provider: 'google', callbackURL: '/onboarding' })
  }

  return (
    <div
      className="flex min-h-dvh items-center justify-center p-4 py-8"
      style={{ backgroundColor: 'var(--fd-bg)' }}
    >
      <div className="w-full max-w-sm space-y-8">

        {/* Wordmark */}
        <div className="text-center space-y-1">
          <p className="text-3xl font-bold tracking-tight" style={{ color: 'var(--fd-accent)' }}>
            FitDesk
          </p>
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            Create your trainer account
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-6 space-y-5"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Full name">
              <input
                type="text"
                name="name"
                required
                autoComplete="name"
                placeholder="Alex Johnson"
                className="input-base"
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="input-base"
              />
            </Field>

            <Field label="Phone number">
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="+1 555 000 0000"
                className="input-base"
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                name="password"
                required
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                minLength={8}
                className="input-base"
              />
            </Field>

            <Field label="Confirm password">
              <input
                type="password"
                name="confirmPassword"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="input-base"
              />
            </Field>

            <SubmitButton loading={loading}>Create account</SubmitButton>
          </form>

          <Divider />

          <GoogleButton onClick={handleGoogle} />
        </div>

        <p className="text-center text-sm" style={{ color: 'var(--fd-muted)' }}>
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: 'var(--fd-accent)' }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: 'var(--fd-text)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity active:scale-[0.98] disabled:opacity-50"
      style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t" style={{ borderColor: 'var(--fd-border)' }} />
      <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>or</span>
      <div className="flex-1 border-t" style={{ borderColor: 'var(--fd-border)' }} />
    </div>
  )
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2.5 rounded-xl border py-3 text-sm font-medium transition-opacity hover:opacity-80 active:scale-[0.98]"
      style={{
        backgroundColor: 'var(--fd-card)',
        borderColor: 'var(--fd-border)',
        color: 'var(--fd-text)',
      }}
    >
      <GoogleIcon />
      Continue with Google
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}
