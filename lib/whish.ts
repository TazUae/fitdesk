/**
 * Payment provider abstraction — server-side only.
 *
 * Design goals:
 *   - New providers are added by implementing PaymentProviderAdapter and
 *     registering it in ADAPTERS. No other files need to change.
 *   - Whish is the only digital provider now; cash and bank transfer are
 *     manual (trainer confirms, no URL generated).
 *   - Generating a payment link ≠ confirming payment. ERPNext is only updated
 *     when the trainer explicitly calls recordPayment() in actions/invoices.ts.
 *   - Every payment action produces a PaymentAuditEvent for traceability.
 *
 * ─── NEVER import this file in a client component. ──────────────────────────
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export type PaymentProvider = 'whish' | 'cash' | 'bank_transfer'

export interface GenerateLinkParams {
  invoiceId:  string
  amount:     number
  currency:   string
  clientName: string
}

export interface PaymentLinkResult {
  success:    boolean
  /** Payment URL to share with the client. Undefined for manual providers. */
  url?:       string
  /** Provider-assigned reference ID — store this for later verification. */
  reference?: string
  error?:     string
}

/**
 * Structured audit record emitted on every payment action.
 * Persisted by logPaymentEvent() — currently written to server logs only.
 * TODO: write to an audit table in auth.db via Drizzle.
 */
export interface PaymentAuditEvent {
  trainerId:  string
  invoiceId:  string
  provider:   PaymentProvider
  eventType:  'link_generated' | 'payment_recorded' | 'manual_marked'
  amount?:    number
  reference?: string
  note?:      string
  timestamp:  string   // ISO-8601
}

// ─── Provider adapter interface ───────────────────────────────────────────────

interface PaymentProviderAdapter {
  readonly provider:     PaymentProvider
  readonly label:        string
  /** Whether this provider can generate a shareable payment URL. */
  readonly supportsLink: boolean
  /** Generate a payment link. Manual providers return { success: true } with no url. */
  generateLink(params: GenerateLinkParams): Promise<PaymentLinkResult>
}

// ─── Manual adapters (cash, bank transfer) ────────────────────────────────────
// These providers have no link — the trainer records payment manually.

const cashAdapter: PaymentProviderAdapter = {
  provider:     'cash',
  label:        'Cash',
  supportsLink: false,
  async generateLink() {
    return { success: true }
  },
}

const bankTransferAdapter: PaymentProviderAdapter = {
  provider:     'bank_transfer',
  label:        'Bank Transfer',
  supportsLink: false,
  async generateLink() {
    return { success: true }
  },
}

// ─── Whish adapter ────────────────────────────────────────────────────────────

const whishAdapter: PaymentProviderAdapter = {
  provider:     'whish',
  label:        'Whish',
  supportsLink: true,

  async generateLink({ invoiceId, amount, currency, clientName }) {
    const base     = process.env.WHISH_API_URL
    const key      = process.env.WHISH_API_KEY
    const merchant = process.env.WHISH_MERCHANT_ID

    if (!base || !key || !merchant) {
      return {
        success: false,
        error:
          'Whish is not configured. Set WHISH_API_URL, WHISH_API_KEY, and WHISH_MERCHANT_ID in your environment.',
      }
    }

    // ─── MOCK — real Whish API integration goes here ─────────────────────────
    //
    // Replace this block with the actual Whish payment-link request.
    // Based on typical Whish Money merchant APIs, the call will look like:
    //
    //   const res = await fetch(`${base}/api/v1/payment-links`, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'Authorization': `Bearer ${key}`,
    //     },
    //     body: JSON.stringify({
    //       merchant_id:  merchant,
    //       amount:       amount,
    //       currency:     currency,
    //       reference_id: invoiceId,
    //       description:  `Payment for ${clientName}`,
    //     }),
    //   })
    //   const json = await res.json()
    //   return { success: true, url: json.payment_url, reference: json.reference }
    //
    // Until real credentials are available this returns a deterministic mock
    // URL so the copy/share UX can be built and tested end-to-end.
    // ─────────────────────────────────────────────────────────────────────────

    const ref     = `WHISH-${invoiceId}-${Date.now()}`
    const mockUrl = `${base}/pay/${ref}?amount=${amount}&currency=${currency}&to=${encodeURIComponent(clientName)}&merchant=${merchant}`

    return { success: true, url: mockUrl, reference: ref }
  },
}

// ─── Provider registry ────────────────────────────────────────────────────────

const ADAPTERS: Record<PaymentProvider, PaymentProviderAdapter> = {
  whish:         whishAdapter,
  cash:          cashAdapter,
  bank_transfer: bankTransferAdapter,
}

/** Retrieve the adapter for a given provider. Throws on unknown provider. */
export function getPaymentAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  const adapter = ADAPTERS[provider]
  if (!adapter) throw new Error(`Unknown payment provider: ${provider}`)
  return adapter
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a shareable payment link.
 *
 * - Whish: returns a URL the trainer can copy/share with the client.
 * - Cash / bank transfer: returns { success: true } with no url.
 *
 * IMPORTANT: calling this does NOT mark the invoice as paid. The trainer must
 * explicitly call recordPayment() after the client confirms payment.
 */
export async function generatePaymentLink(
  amount:     number,
  clientName: string,
  invoiceId:  string,
  provider:   PaymentProvider = 'whish',
  currency    = 'USD',
): Promise<PaymentLinkResult> {
  const adapter = getPaymentAdapter(provider)
  return adapter.generateLink({ invoiceId, amount, currency, clientName })
}

/**
 * Emit a payment audit event.
 *
 * TODO: persist to a `payment_audit` table in auth.db.
 * For now outputs structured JSON to the server log, which is captured by
 * most VPS log collectors (journald, Docker, etc.).
 */
export function logPaymentEvent(event: PaymentAuditEvent): void {
  console.log('[payment-audit]', JSON.stringify(event))
}

/**
 * All configured providers — use to build payment method <select> options.
 * The UI reads supportsLink to decide whether to show the "Generate link" button.
 */
export const PAYMENT_PROVIDERS: ReadonlyArray<{
  provider:     PaymentProvider
  label:        string
  supportsLink: boolean
}> = Object.values(ADAPTERS).map(a => ({
  provider:     a.provider,
  label:        a.label,
  supportsLink: a.supportsLink,
}))
