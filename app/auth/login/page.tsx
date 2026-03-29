import { Suspense } from 'react'
import LoginContent from './login-content'

function LoginFallback() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center p-4"
      style={{ backgroundColor: 'var(--fd-bg)' }}
    >
      <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
        Loading…
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  )
}
