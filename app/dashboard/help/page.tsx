import { LifeBuoy, Mail, MessageCircle } from 'lucide-react'

const SUPPORT_EMAIL = 'support@fitdesk.app'
const SUPPORT_WHATSAPP_URL = 'https://wa.me/0000000000'

export default function HelpPage() {
  return (
    <div className="space-y-4 p-4 pb-20">

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--fd-text)' }}>
          Help &amp; Support
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--fd-muted)' }}>
          We&apos;re here if you need a hand.
        </p>
      </div>

      <section
        className="rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5" style={{ color: 'var(--fd-accent)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--fd-text)' }}>
            Contact support
          </p>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          Reach the FitDesk team and we&apos;ll get back to you.
        </p>

        <div className="mt-3 space-y-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-opacity active:opacity-60"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <Mail className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>Email us</p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>{SUPPORT_EMAIL}</p>
            </div>
          </a>

          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-opacity active:opacity-60"
            style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
          >
            <MessageCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--fd-muted)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--fd-text)' }}>WhatsApp support</p>
              <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>Chat with us on WhatsApp</p>
            </div>
          </a>
        </div>
      </section>

    </div>
  )
}
