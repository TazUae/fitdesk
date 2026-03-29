---
name: whish-payments
description: Use when implementing payment flows, Whish payment links, payment verification, manual payment marking, or the provider abstraction layer.
---

# Whish Payments & Provider Abstraction Skill

Payment logic must never be hardcoded to a single provider. This skill governs all payment integration work in FitDesk.

---

## Core Rules

- Never call payment providers directly from client components
- Payment links must always be generated server-side
- Invoice status must only be marked paid after server-side payment verification
- Manual payment marking must always be available as a fallback
- All payment events must be logged and auditable
- Separate invoice creation from payment collection — they are distinct operations

---

## Supported Payment Providers

| Provider      | Type     | Link Generation |
|---------------|----------|-----------------|
| Whish         | Online   | Server-side     |
| Cash          | Manual   | N/A             |
| Bank Transfer | Manual   | N/A             |

---

## Provider Abstraction Interface

```ts
type PaymentProvider = 'whish' | 'cash' | 'bank_transfer'

interface PaymentService {
  generatePaymentLink(invoiceId: string, amount: number): Promise<PaymentLinkResult>
  verifyPayment(reference: string): Promise<PaymentVerificationResult>
  markManualPayment(invoiceId: string, method: 'cash' | 'bank_transfer', note?: string): Promise<void>
}
```

- Each provider implements this interface in its own adapter
- The app calls `PaymentService` methods — never provider SDKs directly
- Switch providers by swapping the adapter, not the business logic

---

## Payment Flow

```
1. Trainer requests payment collection for an invoice
2. Server action calls PaymentService.generatePaymentLink()
3. Link returned to trainer for sharing with client
4. Client pays via Whish → webhook or polling verifies status server-side
5. On verification → server marks invoice as paid in ERPNext
6. Dashboard metrics updated
```

For manual payments (cash / bank transfer):
```
1. Trainer confirms receipt
2. Server action calls PaymentService.markManualPayment()
3. ERPNext Payment Entry created
4. Invoice status updated
```

---

## Audit Log Entry Shape

```ts
type PaymentEvent = {
  id: string
  trainerId: string
  invoiceId: string
  provider: PaymentProvider
  eventType: 'link_generated' | 'payment_verified' | 'manual_marked' | 'verification_failed'
  amount?: number
  reference?: string
  note?: string
  createdAt: string // ISO timestamp
}
```

---

## Error Handling

- Never optimistically mark an invoice paid from the UI alone
- If payment verification fails, return a typed error — do not silently succeed
- Surface payment errors to the trainer immediately
- Log every payment event including failures

---

## What to Avoid

- Direct client-side calls to Whish or any payment SDK
- Marking invoices paid based only on UI assumptions (no server verification)
- Hardcoding Whish-specific logic outside of the Whish adapter
- Missing audit trail for any payment event
- Skipping the manual fallback path
