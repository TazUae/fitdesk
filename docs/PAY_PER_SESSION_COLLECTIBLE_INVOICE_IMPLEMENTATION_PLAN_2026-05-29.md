# FitDesk — Pay-Per-Session Collectible Invoice: Authoritative Implementation Plan

**Date:** 2026-05-29 (consolidated same day)
**Status:** Final — consolidated from five planning rounds
**Type:** Plan only. No code changed. No tests changed. No ERP records mutated.
**Audit basis:** `FitDesk/docs/INVOICE_COLLECTION_WORKFLOW_GAP_REPORT_2026-05-29.md`

---

## 0. Final Implementation Sequence (read this first)

| Step | Action | Scope | Gate |
|---|---|---|---|
| **docs** | Commit both planning documents | FitDesk (`docs/` only) | Consolidation complete (this step) |
| **0A** | Code: change future tenant provisioning so automatic Server Script is created disabled | `provisioning_api/fitdesk_setup.py` line 534 | CLAUDE.md §4 approval required |
| **0B** | Operational: read-only inventory of every tenant site that may have the Server Script enabled | CP tenant list + per-tenant ERP read | No code change; read-only |
| **0C** | Operational: controlled disablement of Server Script on every affected tenant (start with pilot) | Per-tenant REST call | After 0B inventory complete |
| **0C-pilot-verify** | Pilot tenant: confirm Script disabled; submit test invoice; confirm no WhatsApp | Read-only — pilot only | After 0C applied to pilot |
| **1** | Code: pay-per-session billing truth in `completeSession()` | 3 FitDesk files | After 0C-pilot-verify |
| **0C-all-verify** | All remaining tenants: confirm Script disabled and no WhatsApp on invoice submit | Read-only — all tenants | Can run in parallel with Commit 1 work |
| **0D** | Code: remove `POST /webhooks/invoice-submitted` handler and exclusive helpers | `control-plane/webhook.routes.ts` | After 0C-all-verify passes for ALL tenants |
| **1-verify** | `npx vitest run` + `npx next lint` + `npm run build:verify` | FitDesk | After Commit 1 written |
| **2** | Deploy Commit 1 | FitDesk | After 1-verify passes |
| **3** | Code: rename "To collect" → "Need payment" trainer UX | 2–3 FitDesk files | Founder sign-off on tab name |
| **4** | Deploy Commit 2 | FitDesk | After Commit 3 verified |
| **Later** | Package balance consumption (Phase E) | New design required | Separate founder approval |
| **Later** | Legacy draft classification and remediation | ERP + FitDesk | Separate founder approval |
| **Later** | Cleanup dead webhook provisioning references in `runner.ts` / `env.ts` | `control-plane` | After Commit 0D deployed |

**Critical ordering rule:** Commit 1 deployment requires only the pilot tenant's Server Script
to be confirmed disabled (Gate 0C-pilot-verify). Commit 0D (removing the CP handler) is
separately blocked until **every active tenant's** Server Script is confirmed disabled
(Gate 0C-all-verify). These two gates are independent and may run in parallel.

---

## 1. Confirmed Founder Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Pay-per-session completion → exactly one submitted/outstanding invoice; no customer message from mere submission | ✅ Locked |
| D2 | Need payment = valid submitted/outstanding invoices only; no drafts | ✅ Locked |
| D3 | Missing/invalid billing mode → fail closed; no invoice; structured error | ✅ Locked |
| D4 | Missing/zero Pay-per-session price → fail closed; no zero invoice; structured error | ✅ Locked |
| D5 | Legacy Preparing invoices → separate read-only classification; never auto-promoted | ✅ Locked |
| D6 | Invoice creation/submission must not auto-send customer message or payment link | ✅ Locked |
| D7 | Package completion → BLOCK with `PACKAGE_COMPLETION_NOT_READY` until Phase E is implemented | ✅ Locked |
| D8 | `sessionConsumedPackage` persistence deferred; not needed while Package completion is blocked | ✅ Locked |
| D9 | `custom_whatsapp_sent: 1` suppression in invoice payload REJECTED — would corrupt the audit trail | ✅ Locked |
| D10 | Shared CP webhook handler must not be removed until all active tenant Server Scripts are inventoried and disabled | ✅ Locked |

---

## 2. Product Rule & Trainer Mental Model

```
I completed a pay-per-session training session.
The client now owes me money.
Show that client and amount under Need payment so I can collect it.
```

The trainer must not need to understand ERPNext Draft, docstatus, Submit, Preparing,
or any internal ERP concept. FitDesk handles the full lifecycle invisibly.

**Session completion rules:**

| Billing mode | Result |
|---|---|
| Pay Per Session, rate > 0 | Create session invoice → submit → appears in Need payment |
| Pay Per Session, rate = 0 | Block completion; structured error; no invoice |
| Package | Block completion; structured error `PACKAGE_COMPLETION_NOT_READY`; no invoice; no status change |
| Trial | No invoice; mark session complete |
| Not configured | Block completion; structured error; no invoice |

---

## 3. Repository State at Planning

| Check | Value |
|---|---|
| Repository root | `C:/Users/Lenovo/Dev/axis-erp/FitDesk` |
| `package.json` name | `fitdesk` — product/app repo only |
| Active branch | `wip/main-2026-04-25` |
| HEAD commit | `bd87f5a2c3aa65de3cf2571289b77a5f532db937` |
| Working tree | Clean (two untracked docs files) |
| Test suite | 521 / 521 passing |
| TypeScript | Strict mode enforced |

---

## 4. Confirmed Current-State Code Evidence

### 4.1 Session completion defects — `lib/scheduling/sessionService.ts:228`

```typescript
export async function completeSession(id, expectedVersion): Promise<FDSession> {
  const current = await findSessionById(id)  // no billing mode fetched
  // version check + immutability check

  let invoiceId = current.invoiceId
  if (!invoiceId) {
    const invoice = await createInvoice({    // DRAFT ONLY (docstatus=0)
      customer:     current.clientId,
      items: [{ item_code: 'TRAINING-SESSION', qty: 1, rate: current.rate }],
      remarks: `FitDesk session ${current.id}`,
      // custom_fd_session: NOT set
      // custom_invoice_kind: NOT set
    })
    invoiceId = invoice.id
  }

  return updateSession(id, { status: 'completed', invoiceId })
  // submitSalesInvoice(): NEVER called
  // billingMode: NEVER checked
  // current.rate === 0: NEVER validated
}
```

Confirmed defects:
1. No billing mode check — invoice created for all sessions unconditionally
2. `submitSalesInvoice()` never called — invoice stays as ERPNext Draft
3. No rate guard — `current.rate === 0` creates a $0 draft invoice
4. `custom_fd_session` and `custom_invoice_kind` not set — no session linkage
5. Stale comment in `schedulingActions.ts:290`: "Phase A: status flip only" — wrong

### 4.2 Billing mode location

`client.billingMode` is on the ERPNext Customer record (`custom_billing_mode`).
It is NOT on `FDSession`. To read it, `completeSession()` must call
`getClientById(current.clientId, current.trainerId)`. Both values are available
on every fetched `FDSession`. `getClientById()` is in `lib/erpnext/client.ts:329`.

### 4.3 Package balance — no server-side decrement exists

Confirmed by exhaustive grep: `custom_remaining_sessions` is written only at client
creation (`lib/clients/billing.ts:104`). `computePackageStatus()` in
`lib/scheduling/draft.ts:248` is a pure read-only UI helper. No server-side decrement
exists at session completion or at any other point in the application.

### 4.4 Submit path — existing and correct

`submitSalesInvoice()` in `lib/erpnext/client.ts:502`: fetches full doc → normalizes
`set_posting_time=1` and `due_date` clamp → POSTs to `frappe.client.submit` via CP proxy
→ re-fetches via `getInvoiceById()`. Already used by `finalizeInvoice()`. Working in production.

### 4.5 Idempotency anchor

`FDSession.invoiceId` — already used. `updateSession()` supports `invoiceId?` as a
standalone partial patch in `sessionRepository.ts:217`. No repository layer change needed.

### 4.6 InvoicesView list/detail inconsistency

`InvoicesView.tsx:234`: list calls `recordPayment()` — rejects draft invoices.
`app/dashboard/invoices/[id]/page.tsx:37`: detail calls `collectPayment()` — handles drafts.
After Commit 1, new session invoices arrive pre-submitted as `sent`; `recordPayment()` works
correctly for them. The inconsistency only affects legacy draft invoices, which stay outside
Need payment.

---

## 5. Messaging Safety Plan — Automatic Invoice Submit Webhook

### 5.1 Why this blocks Commit 1

Commit 1 will call `submitSalesInvoice()` for every pay-per-session session completion.
In ERPNext, `After Submit` is a DocType event hook. A Frappe Server Script named
**"FitDesk Invoice Submit Webhook"** currently fires on this event for every Sales Invoice
where `custom_whatsapp_sent = 0`. If this script is enabled on any tenant, Commit 1
will trigger automatic WhatsApp messages to clients without trainer approval — violating
the FitDesk CLAUDE.md rule: "Auto-sending without user confirmation is not allowed in MVP."

**Commit 1 must not be deployed to any tenant until that tenant's Server Script is
confirmed disabled.**

**The shared Control Plane webhook handler must not be removed until every active tenant's
Server Script is confirmed disabled.** The endpoint is shared platform infrastructure.

### 5.2 Automatic path — complete file map

| File | Lines | Role |
|---|---|---|
| `provisioning_api/provisioning_api/api/fitdesk_setup.py` | 477–539 | `_create_whatsapp_server_script()` — creates the script |
| `provisioning_api/provisioning_api/api/fitdesk_setup.py` | **534** | `"disabled": 0` — **root source of truth; one-line fix for new tenants** |
| `provisioning_api/provisioning_api/api/fitdesk_setup.py` | 496 | Idempotency check: `if frappe.db.exists(...): return {"skipped": True}` — re-running setup will NOT update existing scripts |
| `provisioning_api/provisioning_api/api/fitdesk_setup.py` | 504–524 | Script body baked at provisioning with live CP URL + secret |
| `provisioning_api/provisioning_api/api/fitdesk_setup.py` | 521–522 | Script sets `custom_whatsapp_sent = 1` via `frappe.db.set_value` AFTER a successful POST to CP (inside Frappe sandbox — not the CP handler) |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 40–123 | `POST /webhooks/invoice-submitted` handler |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 83–88 | Creates Whish payment link via CP env `WHISH_MONEY_API_URL` |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 92–100 | Writes `custom_payment_link` + `custom_payment_reference` back to ERP |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 103–115 | Fetches mobile → sends WhatsApp via global `env.EVOLUTION_INSTANCE` |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 269–297 | `createWhishPaymentLink()` — exclusive to `invoice-submitted` handler |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 299–314 | `getCustomerMobile()` — exclusive to `invoice-submitted` handler |
| `control-plane/src/modules/webhooks/webhook.routes.ts` | 316–335 | `sendWhatsApp()` — uses global `env.EVOLUTION_INSTANCE`; exclusive to handler |

### 5.3 Explicit trainer-controlled flow — confirmed independent

The FitDesk trainer-controlled send path:
```
actions/messages.ts sendMessage()
  → lib/evolution.ts sendWhatsAppMessage()
  → Evolution API using per-trainer instance: fitdesk_{trainerId}
```

The FitDesk trainer-controlled payment link path:
```
actions/invoices.ts getPaymentLink()
  → lib/whish.ts generatePaymentLink()
  → Whish API directly (FitDesk's own env vars)
```

Both paths bypass the Control Plane entirely. They use different Evolution API instances
(`fitdesk_{trainerId}` vs. global `env.EVOLUTION_INSTANCE`) and have no dependency on
the Frappe Server Script or the CP `invoice-submitted` handler.

**Disabling the Server Script and eventually removing the CP handler has zero effect on
either trainer-controlled flow.**

### 5.4 Tenant inventory — authoritative registry and read-only check method

**Authoritative tenant list:** `Tenant` table in CP PostgreSQL database (Prisma model).
Accessible via `GET /tenants` (requires internal API key) → returns all tenant slugs/IDs/status.

**Relevant tenant fields:**
- `erpSite` (nullable) — ERPNext site URL; null for failed/incomplete tenants
- `erpApiKey` / `erpApiSecret` — credentials for per-tenant ERP calls
- `status` — `active | suspended | provisioning | archived | failed`

**Tenants to include in inventory:**
- `erpSite != null` AND `erpApiKey != null` AND `erpApiSecret != null`
- Include both `active` and `suspended` (can restart)
- Skip `failed` provisioning tenants where FitDesk setup never completed (no site created)
- Skip tenants where `setup_fitdesk_schema()` was never called (no `webhookSecret` on the tenant record and no FitDesk custom fields provisioned)

**Per-tenant read-only check (no new code required):**
```
GET /api/resource/Server Script/FitDesk Invoice Submit Webhook
    ?fields=["name","disabled"]
```
via existing `frappeFetch(creds, "GET", ...)` with the tenant's credentials.

| Response | Meaning | Required action |
|---|---|---|
| HTTP 404 | Script does not exist — provisioned without webhook URL, or setup never ran | None — safe |
| HTTP 200, `disabled = 1` | Script exists but already disabled | None — safe |
| HTTP 200, `disabled = 0` | Script exists and **enabled** — active producer | Must disable before Commit 0D |

**No new endpoint, no new code, no provisioning-agent change required for the inventory.**

### 5.5 Commit 0A — Prevent future unsafe provisioning (1 file, 1 line)

**File:** `provisioning_api/provisioning_api/api/fitdesk_setup.py`
**Line:** 534
**Change:** `"disabled": 0` → `"disabled": 1`

This is the only code change required for Commit 0A. The Server Script is provisioned
disabled. It can be enabled per-tenant when an explicit trainer-approval flow is built.

**No changes required to:**
- `erp-execution-service` — calls `setup_fitdesk_schema()` unchanged
- `provisioning-agent` — thin bridge, passes parameters only
- `bench-agent` — no new bench commands
- `control-plane/runner.ts` — still constructs `controlPlaneWebhookUrl`; harmless in a disabled script
- `control-plane/env.ts` — comment update is cleanup, not safety-critical
- Any FitDesk application code

**Approval required:** CLAUDE.md §4 (ERP Server Script change, WhatsApp messaging behavior).

### 5.6 Gate 0B — Read-only all-tenant Server Script inventory

**This is an operational step, not a code commit.** No source files change.

The admin enumerates every tenant from the CP tenant list and, for each tenant with
ERP credentials, issues the read-only Server Script check described in §5.4.

**Result:** A table per tenant:

| Tenant/site | Use class | Script exists | `disabled` | Can auto-message | Required action |
|---|---|---|---|---|---|
| pilot | Active FitDesk | Yes | 0 | Yes | Disable via 0C |
| (others) | TBD per inventory | TBD | TBD | TBD | TBD |

**No tenant data is mutated in this step.** This step proves the scope of Gate 0C.

### 5.7 Gate 0C — Controlled per-tenant disablement

**This is an operational step, not a code commit.** No source files change.

For each tenant confirmed as `disabled = 0` in Gate 0B:

```
PUT /api/resource/Server Script/FitDesk Invoice Submit Webhook
Body: {"disabled": 1}
```

Issued via existing `frappeFetch(creds, "PUT", ...)` with that tenant's credentials.
No new endpoint. No new function. No bench-agent change.

**Properties of this operation:**

| Property | Value |
|---|---|
| Idempotent | Yes — setting `disabled = 1` when already 1 is a no-op |
| Per-tenant | Yes — each tenant's ERP site is called independently |
| Logged | CP logs all `frappeFetch` calls; confirm 200 OK per tenant |
| Reversible | Yes — `PUT {"disabled": 0}` re-enables |
| Rollback | Re-enable the script via the same REST call |

**Verification per tenant after 0C:**
1. Re-check `GET /api/resource/Server Script/FitDesk Invoice Submit Webhook` — confirm `disabled = 1`
2. Submit a test Sales Invoice on that tenant's ERPNext — confirm no WhatsApp message fires
3. Confirm `custom_whatsapp_sent` remains 0 on the invoice after submission

**Pilot tenant verified first (0C-pilot-verify):** This gate unblocks Commit 1 deployment
on the pilot tenant. Commit 1 code may be written before this gate resolves.

**All tenants verified (0C-all-verify):** This gate unblocks Commit 0D. It may run in
parallel with Commit 1 work. Only proceed to Commit 0D after every tenant in the 0B
inventory is verified.

### 5.8 Commit 0D — Remove dormant CP handler (after zero enabled producers confirmed)

**Precondition:** Gate 0C-verify passes for ALL tenants identified in Gate 0B.
This commit is blocked until that condition is met.

**File:** `control-plane/src/modules/webhooks/webhook.routes.ts`

**Remove:**
- Lines 30–38: `InvoiceSubmittedBody` type
- Lines 40–123: `POST /webhooks/invoice-submitted` handler
- Lines 265–267: `// Helpers` section divider
- Lines 269–297: `createWhishPaymentLink()` helper
- Lines 299–314: `getCustomerMobile()` helper
- Lines 316–335: `sendWhatsApp()` helper
- Lines 1–16: Update file doc comment (remove `invoice-submitted` description)

**Keep:**
- All imports (lines 18–24) — all used by `payment-confirmed`
- Lines 125–263: `PaymentConfirmedBody` type + `POST /webhooks/payment-confirmed` handler

**Why remove rather than keep:**
The handler violates "Auto-sending without user confirmation is not allowed in MVP."
Dead code that violates a product rule is a latent regression risk: re-enabling
the Server Script on any tenant would activate auto-sends immediately with no code change.

**`runner.ts` and `env.ts` cleanup** (follow-up after Commit 0D, not blocking):
- `control-plane/src/jobs/state/runner.ts:449` — still constructs `controlPlaneWebhookUrl`
- `control-plane/src/config/env.ts:55` — `CONTROL_PLANE_PUBLIC_URL` comment references `invoice-submitted`
- Both are harmless dead references after Commit 0D; clean up in a separate follow-up commit

---

## 6. Existing Flow Diagram

```
Trainer: Complete session
         │
         ▼
completeSessionAction() [schedulingActions.ts:295]
         │
         ▼
completeSession(id, expectedVersion) [sessionService.ts:228]
         │ 1. findSessionById(id)
         │ 2. version check
         │ 3. immutability check
         │ 4. if no invoiceId: createInvoice()  ← Draft (docstatus=0), no billingMode check
         │ 5. updateSession(status='completed', invoiceId)
         ▼
ERPNext Sales Invoice: docstatus=0 (Draft) → "Preparing" tab → OUTSTANDING excluded ← DEFECT
```

---

## 7. Target Pay-Per-Session Lifecycle (after Commit 1)

```
Trainer: Complete session (billingMode = 'Pay Per Session', rate > 0)
         │
         ▼
completeSession(id, expectedVersion)
         │ 1. findSessionById(id)
         │ 2. version check
         │ 3. immutability check
         │ 4. getClientById(clientId, trainerId) → billingMode = 'Pay Per Session'
         │ 5. current.rate > 0 ✓
         │
         │ ── Pay Per Session branch ──────────────────────────
         │ 6. if invoiceId is null:
         │      invoice = createInvoice({
         │        customer:            clientId,
         │        items:               [TRAINING-SESSION, rate],
         │        custom_fd_session:   session.id,
         │        custom_invoice_kind: 'Session',
         │      })
         │      await updateSession(id, { invoiceId }) ← anchor BEFORE submit
         │
         │ 7. inv = getInvoiceById(invoiceId)
         │    if inv.status === 'draft':
         │      await submitSalesInvoice(invoiceId)
         │      → ERPNext: docstatus=0 → docstatus=1, status='Unpaid'
         │      → After Submit Server Script: DISABLED (Commit 0A + 0C) — fires nothing
         │
         │ 8. updateSession(id, { status: 'completed', invoiceId })
         ▼
FDSession { status: 'completed', invoiceId: 'SINV-...' }
ERPNext Sales Invoice: docstatus=1, status='Unpaid'
  → mapInvoiceStatus('Unpaid') = 'sent' → Need payment tab: +1 item ✓
```

Note: `custom_whatsapp_sent` is NOT set on the invoice payload. The Server Script is
disabled at the ERP level (Commits 0A + 0C); there is nothing to suppress from the
invoice side.

---

## 8. Target Package and Trial Lifecycle (after Commit 1)

```
Trainer: Complete session (billingMode = 'Package')
         │ 4. getClientById → billingMode = 'Package'
         │
         │ ── Package branch ──────────────────────────────────
         │    throw PackageCompletionNotReadyError()
         │    → no invoice created
         │    → no session status change
         ▼
completeSessionAction() → { success: false, code: 'PACKAGE_COMPLETION_NOT_READY',
  message: 'Package session completion is not available until package balance
           tracking is enabled.' }

Trainer: Complete session (billingMode = 'Trial')
         │    → updateSession(id, { status: 'completed' })
         │    → no invoice created
         ▼
FDSession { status: 'completed', invoiceId: null }
```

Package completion is explicitly blocked until Phase E (server-side balance consumption).
The trainer sees an actionable error explaining why.

---

## 9. Billing-Mode Enforcement Design

### New imports in `sessionService.ts`

```typescript
import {
  createInvoice,
  getClientById,       // NEW
  getInvoiceById,      // NEW
  submitSalesInvoice,  // NEW
} from '@/lib/erpnext/client'
```

### New error types

```typescript
export class BillingNotConfiguredError extends Error {
  constructor(clientId: string) {
    super(
      `Client ${clientId} has no billing mode set. ` +
      'Go to the client profile and choose Package, Pay Per Session, or Trial.'
    )
    this.name = 'BillingNotConfiguredError'
  }
}

export class SessionRateNotConfiguredError extends Error {
  constructor(sessionId: string) {
    super(
      `Session ${sessionId} has a rate of zero. ` +
      'Set the session fee before completing this session.'
    )
    this.name = 'SessionRateNotConfiguredError'
  }
}

export class PackageCompletionNotReadyError extends Error {
  constructor() {
    super(
      'Package session completion is not available until package balance tracking is enabled.'
    )
    this.name = 'PackageCompletionNotReadyError'
  }
}
```

### Billing mode branch

```typescript
const client = await getClientById(current.clientId, current.trainerId)

switch (client.billingMode) {
  case 'Pay Per Session': {
    if (current.rate <= 0) {
      throw new SessionRateNotConfiguredError(current.id)
    }
    // → two-phase invoice creation + submission (Section 10)
    break
  }
  case 'Package': {
    // Phase E not yet implemented — block with structured error.
    // Do NOT create invoice. Do NOT mark session complete.
    throw new PackageCompletionNotReadyError()
  }
  case 'Trial': {
    return updateSession(id, { status: 'completed' })
  }
  default: {
    // null, undefined, or unexpected value
    throw new BillingNotConfiguredError(current.clientId)
  }
}
```

### Error codes in `schedulingActions.ts`

```typescript
export type SchedulingErrorCode =
  | 'AUTH'
  | 'CONFLICT'
  | 'OUT_OF_HOURS'
  | 'VERSION_CONFLICT'
  | 'IMMUTABLE_STATUS'
  | 'EMPTY_PLAN'
  | 'BILLING_NOT_CONFIGURED'        // NEW
  | 'RATE_NOT_CONFIGURED'           // NEW
  | 'PACKAGE_COMPLETION_NOT_READY'  // NEW
  | 'ERR'
```

---

## 10. ERPNext-Safe Invoice Submission Design

### Invoice payload for Pay Per Session

```typescript
const invoice = await createInvoice({
  customer:             current.clientId,
  posting_date:         today,                      // YYYY-MM-DD
  due_date:             today,                      // clamped by createInvoice()
  items: [{
    item_code:   'TRAINING-SESSION',
    qty:         1,
    rate:        current.rate,                      // confirmed > 0
    description: current.sessionType ?? 'Training session',
  }],
  remarks:              `FitDesk session ${current.id}`,
  custom_fd_session:    current.id,
  custom_invoice_kind:  'Session',
  // custom_whatsapp_sent NOT set here — see D9. Suppression via payload
  // was rejected as audit corruption. The Server Script is disabled at the
  // ERP level (Commits 0A + 0C). No invoice-side suppression is needed.
})
```

### Submit call with idempotency check

```typescript
const inv = await getInvoiceById(invoiceId)
if (inv.status === 'draft') {
  await submitSalesInvoice(invoiceId)
  // Throws ERPNextError if submission fails.
  // If already non-draft (prior retry): skip. Safe.
}
```

### Control Plane proxy path (unchanged)

```
completeSession() → submitSalesInvoice() → erpFetch()
  → /api/erp/method/frappe.client.submit → CP proxy → ERPNext
```

No new proxy paths, no new ERP credentials, no Control Plane changes.

---

## 11. Idempotency and Failure/Retry Strategy

### Two-phase store pattern

```
STEP 1: createInvoice()            → get invoiceId
STEP 2: updateSession({invoiceId}) → ANCHOR BEFORE SUBMIT
STEP 3: submitSalesInvoice()       → throws on ERP rejection
STEP 4: updateSession({status:'completed', invoiceId})
```

| Failure point | Session state | Retry behavior |
|---|---|---|
| `createInvoice()` fails | mutable, invoiceId=null | New creation attempt (no duplicate) |
| Step 2 `updateSession` fails | mutable, invoiceId=null, draft orphaned | New creation attempt (orphan risk; acceptable for pilot) |
| `submitSalesInvoice()` fails | mutable, invoiceId=stored | Skip creation; retry submit only ✓ |
| Step 4 `updateSession` fails | mutable, invoiceId=stored, invoice submitted | Skip both creation and submit; retry Step 4 only ✓ |

---

## 12. Pre-Implementation Verification Gates

| Gate | Evidence | Per-tenant check | Status |
|---|---|---|---|
| 0.1 — `custom_billing_mode` provisioned | `fitdesk_setup.py:185` — in `_CUSTOM_FIELDS`, verified by `verify_fitdesk_schema()` | Confirm `custom_fields == 15` on tenant | GREEN (code proven) |
| 0.2 — Session price (`rate`) reliable | `sessionFields()` includes `rate`; `normalizeSession()` maps it | None | GREEN |
| 0.3 — Invoice submit path works | `submitSalesInvoice()` at `client.ts:502` — tested via `finalizeInvoice()` in production | Confirm CP proxy forwards `frappe.client.submit` | GREEN (code proven) |
| 0.4 — `custom_fd_session` / `custom_invoice_kind` provisioned | `fitdesk_setup.py:188-189`, both in `invoiceFields()` and `CreateInvoicePayload` | Confirm schema version on tenant | GREEN (code proven) |
| 0.5 — Idempotency linkage | `sessionRepository.ts:217` — `invoiceId?` partial patch supported | None | GREEN |
| 0.6 — Package balance absence | Exhaustive grep: no server-side decrement exists anywhere | None | GREEN (safe absence documented) |
| **0.7 — Server Script disabled on pilot** | `fitdesk_setup.py:534` — currently `disabled: 0`; must change | See §5.4 per-tenant check | **BLOCKED — requires 0A + 0C** |

Gate 0.7 is a **deployment blocker for Commit 1 on the pilot tenant.** Commit 1 code may be
written and tested locally before Gate 0.7 resolves, but may not be deployed until the pilot
tenant's Server Script is confirmed disabled via Gates 0B and 0C.

---

## 13. Exact File-Level Scope

### Commit 0A — `provisioning_api` (one line)

| File | Change |
|---|---|
| `provisioning_api/provisioning_api/api/fitdesk_setup.py` | Line 534: `"disabled": 0` → `"disabled": 1` |

**Repos NOT touched:** `erp-execution-service`, `provisioning-agent`, `bench-agent`,
`control-plane`, FitDesk.

### Commit 0D — `control-plane` (after all-tenant 0C-verify)

| File | Change |
|---|---|
| `control-plane/src/modules/webhooks/webhook.routes.ts` | Remove lines 30–38 (type), 40–123 (handler), 265–335 (3 exclusive helpers); update file doc comment |

**Repos NOT touched:** `provisioning_api`, FitDesk.

### Commit 1 — FitDesk billing truth (3 files)

| File | Change |
|---|---|
| `lib/scheduling/sessionService.ts` | New imports; 3 error classes; billing-mode branch in `completeSession()`; two-phase idempotency; `custom_fd_session` + `custom_invoice_kind` on invoice; stale comment fix |
| `actions/schedulingActions.ts` | Add 3 new error codes; handle in `mapError()`; fix stale comment at line 290 |
| `lib/scheduling/__tests__/sessionService.test.ts` | Extend mock for `getClientById`, `getInvoiceById`, `submitSalesInvoice`; add T1–T20 |

**NOT changed:** `lib/erpnext/client.ts`, `lib/scheduling/sessionRepository.ts`,
`lib/erpnext/types.ts`, `actions/invoices.ts`, any UI component, any provisioning script.

### Commit 2 — FitDesk trainer queue UX (2–3 files)

| File | Change |
|---|---|
| `components/modules/InvoicesView.tsx` | Rename TABS labels; demote "Preparing" to conditional alert; update empty-state copy |
| `lib/invoices/status.ts` | Optional: rename `draft: 'Preparing'` → `draft: 'Draft'` for alert label |
| `components/modules/__tests__/InvoicesView.test.tsx` | New: tab membership, empty states, draft alert |

---

## 14. Test Matrix

### Commit 1 — Service and action tests

| # | Scenario | File | Status |
|---|---|---|---|
| T1 | `getClientById` called with `current.clientId` + `current.trainerId` | `sessionService.test.ts` | New |
| T2 | Pay-per-session: `createInvoice` called with item code, rate, clientId, `custom_fd_session`, `custom_invoice_kind: 'Session'` | `sessionService.test.ts` | Update |
| T3 | Pay-per-session: first `updateSession` stores invoiceId WITHOUT changing status | `sessionService.test.ts` | New |
| T4 | Pay-per-session: `submitSalesInvoice` called after invoice creation | `sessionService.test.ts` | New |
| T5 | Pay-per-session: second `updateSession` sets `status='completed'` with invoiceId | `sessionService.test.ts` | Update |
| T6 | Pay-per-session: existing submitted invoiceId → skips create AND submit | `sessionService.test.ts` | Update |
| T7 | Pay-per-session: existing draft invoiceId → skips create; still calls `submitSalesInvoice` | `sessionService.test.ts` | New |
| T8 | Pay-per-session: `submitSalesInvoice` fails → session stays mutable, invoiceId stored, error thrown | `sessionService.test.ts` | New |
| T9 | Pay-per-session: `rate = 0` → `SessionRateNotConfiguredError` thrown, no invoice created | `sessionService.test.ts` | New |
| T10 | Package: `createInvoice` NOT called; `updateSession` NOT called; `PackageCompletionNotReadyError` thrown | `sessionService.test.ts` | New |
| T11 | Trial: `createInvoice` NOT called; `updateSession` called with `status='completed'` only | `sessionService.test.ts` | New |
| T12 | Billing mode null → `BillingNotConfiguredError` thrown; no invoice created | `sessionService.test.ts` | New |
| T13 | Billing mode undefined → `BillingNotConfiguredError` thrown; no invoice created | `sessionService.test.ts` | New |
| T14 | Retry: second call with stored invoiceId but draft invoice → skips createInvoice, calls submitSalesInvoice | `sessionService.test.ts` | New |
| T15 | `BillingNotConfiguredError` → `BILLING_NOT_CONFIGURED` code + trainer message | `schedulingActions.test.ts` | New |
| T16 | `SessionRateNotConfiguredError` → `RATE_NOT_CONFIGURED` code + trainer message | `schedulingActions.test.ts` | New |
| T17 | `PackageCompletionNotReadyError` → `PACKAGE_COMPLETION_NOT_READY` code + trainer message | `schedulingActions.test.ts` | New |
| T18 | `completeSession()` does NOT call `sendMessage()` or `sendWhatsAppMessage()` at any point | `sessionService.test.ts` | New (assert absence) |
| T19 | `completeSession()` does NOT call `getPaymentLink()` at any point | `sessionService.test.ts` | New (assert absence) |
| T20 | Pay-per-session completion: invoice becomes `sent`/outstanding; no messaging call in service layer | `sessionService.test.ts` | New |

### Commit 2 — UI component tests

| # | Scenario | File | Status |
|---|---|---|---|
| T21 | "Need payment" tab shows only `sent \| overdue \| partially_paid` invoices | `InvoicesView.test.tsx` | New |
| T22 | "Need payment" tab does NOT show `draft` invoices | `InvoicesView.test.tsx` | New |
| T23 | Draft invoices trigger the conditional "Needs attention" alert banner | `InvoicesView.test.tsx` | New |
| T24 | Empty state (no drafts): correct copy shown | `InvoicesView.test.tsx` | New |
| T25 | Empty state (with drafts): alert banner shown, NOT the "Open Preparing" copy | `InvoicesView.test.tsx` | New |
| T26 | "Record payment" visible for `sent` invoice; NOT visible for `draft` in list view | `InvoicesView.test.tsx` | New |

### Existing tests to preserve

| Test | File | Action |
|---|---|---|
| `recordPayment` rejects `draft` | `invoices.test.ts` | Preserve |
| `isOutstandingInvoiceStatus('draft') === false` | `status.test.ts` | Preserve |
| `completeSession` reuses existing invoiceId | `sessionService.test.ts` | Update (add `getClientById` mock) |
| `completeSession` throws `VersionConflictError` | `sessionService.test.ts` | Preserve |
| `completeSession` throws `ImmutableSessionError` | `sessionService.test.ts` | Preserve |
| `collectPayment` auto-finalizes draft then records payment | `invoices.test.ts` | Preserve |

---

## 15. Risks and Stop Conditions

### Critical

**R-CRITICAL-1 — Auto-WhatsApp on auto-submitted invoices**
`completeSession()` will call `submitSalesInvoice()` after Commit 1. If the Frappe Server Script
"FitDesk Invoice Submit Webhook" is enabled on any tenant, every pay-per-session session
completion will trigger an unsolicited WhatsApp message to the client.
**Mitigation:** Commits 0A + 0C (disable the script everywhere). **Deployment blocker.**

**R-CRITICAL-2 — Package double-billing (pre-existing; Commit 1 blocks it)**
Current `completeSession()` creates invoices for ALL billing modes including Package.
Commit 1's Package branch throws `PackageCompletionNotReadyError` before invoice creation.
The 4 legacy drafts may include some from Package clients.

**R-CRITICAL-3 — CP handler removed while active producers remain**
If Commit 0D is applied before all tenant Server Scripts are disabled, those tenants will
receive 404 responses on invoice submission. The Frappe Server Script logs an error but
does not retry. No WhatsApp is sent — the failure is silent from the trainer's perspective,
but breaks the ERP-side audit trail (`custom_whatsapp_sent` stays 0 unexpectedly).
**Mitigation:** Commit 0D is explicitly blocked until Gate 0C-verify passes for ALL tenants.

### High

**R-HIGH-1 — `getClientById` adds one ERP round-trip per session completion**
~200–400ms additional latency. Acceptable for pilot. Cache per-request if it becomes a concern.

**R-HIGH-2 — Step 2 `updateSession` failure orphans a draft invoice**
If `createInvoice()` succeeds but the anchor `updateSession({invoiceId})` fails, the session
has no `invoiceId` stored and the draft invoice is orphaned in ERPNext. A retry creates a
second draft. For the pilot, orphans are identifiable via `remarks = "FitDesk session <id>"`.

**R-HIGH-3 — Legacy Package-client drafts**
The 4 existing Preparing invoices may include Package-client drafts. The invoice detail page's
`collectPayment()` will finalize and pay them if the trainer navigates there. Commit 2's
draft-alert copy must warn trainers not to pay unknown drafts without review.

**R-HIGH-4 — Existing tenant Server Scripts outside the pilot**
The tenant inventory (Gate 0B) may reveal additional tenants with enabled Server Scripts.
These must all be disabled (Gate 0C) before Commit 0D is applied.

### Medium

**R-MED-1 — `custom_billing_mode` not set on existing clients**
Pilot clients created before billing mode was added will have `billingMode = undefined`.
`completeSession()` will throw `BillingNotConfiguredError`. Trainer sees actionable error.
Recoverable — trainer sets billing mode and retries.

**R-MED-2 — `custom_fd_session` / `custom_invoice_kind` missing on older tenants**
Confirmed provisioned in current `fitdesk_setup.py`. If a tenant was provisioned before
Phase B fields were added, these fields may not exist. Frappe returns 417 on unknown fields.
Mitigation: run `verify_fitdesk_schema()` on the tenant; confirm `custom_fields == 15`.

**R-MED-3 — `isTrialSession` not set in Trial branch**
The Trial branch calls `updateSession(id, { status: 'completed' })` without setting
`isTrialSession: true`. Informational only for Commit 1; flagged for Phase E.

### Stop Conditions

Implementation of Commit 1 **must stop** if:

1. Gate 0.7 not resolved: the pilot tenant's Server Script is confirmed active but Commit 0A
   and 0C have not been applied and verified.
2. `custom_billing_mode` absent on all test clients: run `verify_fitdesk_schema()` on the
   target tenant and confirm `custom_fields == 15`.
3. `frappe.client.submit` proxy path broken: test by calling `finalizeInvoice()` on a
   manual draft invoice; confirm it produces a submitted invoice before deploying.
4. Package behavior disputed: if the founder requires Package sessions to be handled
   differently than block-with-error, Commit 1 is paused until a new design is approved.

---

## 16. Trainer Invoice Queue — "Need Payment" UX Plan (Commit 2)

### Corrected tab definition

**Need payment** = `isOutstandingInvoiceStatus(status)` = `sent | overdue | partially_paid`.
This is **unchanged from the current filter logic** (`status.ts:33-37`). After Commit 1,
session completion invoices arrive as `sent` and appear here immediately. No filter change needed.

**Drafts are NOT included.** Legacy drafts remain in a conditional "Needs attention" alert.

### Approved tab structure

| Tab | Label | Filter | Change |
|---|---|---|---|
| `outstanding` | **Need payment** | `sent \| overdue \| partially_paid` | Rename only |
| (conditional) | **Needs attention** alert | `draft` with amount > 0 | Replace "Preparing" primary tab |
| `paid` | **Paid** | `paid` | Unchanged |
| `all` | **All** | all statuses | Unchanged |

### "Preparing" demotion

Remove "Preparing" as a persistent primary tab. Replace with an inline conditional alert:

```
⚠  [N] invoice(s) need review — they may be from sessions before billing was set up.
   Do not pay these without confirming they are correct. [ Review in All ]
```

The alert navigates to the "All" tab. No "Record payment" button on draft cards in the list.
To pay a legacy draft, trainer uses the invoice detail page (which uses `collectPayment()`).

### Empty state corrections

| Scenario | Old copy | Corrected copy |
|---|---|---|
| Need payment empty, no drafts | "Nothing to collect right now." | "Nothing to collect. Completed pay-per-session sessions appear here automatically." |
| Need payment empty, drafts present | "You have invoices still preparing. Open Preparing to review them." | "Nothing to collect. You have [N] invoice(s) that need review — see the alert above." |

### Payment action consistency

After Commit 1, new session invoices are pre-submitted (`sent`). The list's `recordPayment()`
already works correctly for `sent` invoices. No change to `MarkPaidSheet` is needed in Commit 2.
The list/detail inconsistency only affects legacy draft invoices, which are not in Need payment.

---

## 17. Legacy Preparing Invoice Handling

The 4 existing draft invoices in the pilot tenant are NOT touched by Commit 1 or Commit 2.

**Required classification step (separate approved task):**

```
GET /api/resource/Sales Invoice
  ?filters=[["status","=","Draft"]]
  &fields=["name","customer","grand_total","remarks","custom_invoice_kind",
           "custom_fd_session","creation"]
```

| Classification | Discriminator | Allowed treatment |
|---|---|---|
| Pay-per-session client, correct session | `remarks` = `"FitDesk session <id>"` | Candidate for `finalizeInvoice()` via detail page |
| Package client — invoice should not exist | Package billing mode on customer | Do not collect; requires cancellation decision |
| Manual draft | No `remarks` session pattern | Keep outside normal flow unless trainer explicitly issues it |
| Unknown | Neither pattern | Admin review only |

---

## 18. Founder Decisions Still Required

| # | Decision | Status |
|---|---|---|
| F1 | CLAUDE.md §4 approval for Commit 0A (ERP Server Script change, WhatsApp messaging behavior) | ❓ Pending |
| F2 | Complete Gate 0B: authorize the read-only all-tenant Server Script inventory | ❓ Pending |
| F3 | Confirm controlled disablement approach for Gate 0C (per-tenant REST call) | ❓ Pending (approved in principle) |
| F4 | Approve Commit 2 tab rename ("To collect" → "Need payment") | ❓ Pending |
| F5 | Legacy draft classification: schedule read-only ERP query; decide per-draft treatment | ❓ Pending |
| F6 | Confirm `verify_fitdesk_schema()` returns `custom_fields == 15` on pilot tenant | ❓ Pending |
| F7 | Package manual balance management: confirm trainer is aware sessions block until Phase E | ❓ Pending |

---

## 19. Whether Safe to Issue

| Item | Safe? | Reason |
|---|---|---|
| Commit 0A implementation prompt | Not yet | Requires CLAUDE.md §4 approval (F1) |
| Gate 0B inventory execution | Not yet | Requires founder authorization (F2) |
| Gate 0C disablement execution | Not yet | Requires F3 + Gate 0B complete |
| Commit 0D implementation prompt | Not yet | Requires all Gate 0C tenants verified |
| Commit 1 code (write + test) | Safe to write locally | All source gates proven; cannot deploy until pilot Gate 0.7 verified |
| Commit 1 deployment | Not yet | Gate 0.7 must be confirmed (pilot Server Script disabled) |
| Commit 2 | Safe to plan and write | No new ERP risk; requires F4 before deployment |

**The next action is:** Obtain CLAUDE.md §4 approval (F1) for Commit 0A, then authorize
Gate 0B inventory.

---

## Appendix — Superseded Decisions

This appendix records prior recommendations that were made and then corrected.
It exists to prevent a future implementer from following a superseded path.

| # | Prior recommendation | Why superseded | Correct position |
|---|---|---|---|
| S1 | "Include all draft invoices in Need payment" | Drafts are unclassified; may belong to Package clients (double-billing risk) | Need payment = submitted outstanding only. Legacy drafts excluded. |
| S2 | "Commit 1 is safe to merge immediately" | WhatsApp auto-send risk discovered post-analysis | Commit 1 deployment blocked until pilot Server Script disabled and verified. |
| S3 | "Package: no per-session invoice; consume package entitlement" | No server-side balance decrement exists anywhere | Package completion → BLOCK with `PACKAGE_COMPLETION_NOT_READY` error. Phase E separately. |
| S4 | "Missing billing mode: default to Pay-per-session" | Founder decision: never default | Missing billing mode → fail closed; structured error. |
| S5 | "Option B: set `custom_whatsapp_sent: 1` on invoice payload to suppress webhook" | Rejected as audit corruption: setting 'Sent: Yes' when nothing was sent | Disable the Server Script at the ERP level (Commits 0A + 0C). No invoice-side suppression. |
| S6 | "Missing env vars act as a natural guard" | Accidental configuration is not product logic | Disable the Server Script explicitly. |
| S7 | "Package session completion is safe for pilot because UI blocks Package client creation" | Package clients may exist through direct ERP data entry or test data | Explicit block via `PackageCompletionNotReadyError`. |
| S8 | "Commit 0 requires 4 repos: provisioning_api + erp-execution-service + provisioning-agent + control-plane" | Over-engineered; provisioning-agent must remain thin bridge | Commit 0A: `provisioning_api` only (1 line). Commit 0D: `control-plane` only (after all-tenant verification). |
| S9 | "Disable pilot tenant → remove shared CP handler" | Shared endpoint cannot be removed until all active tenant producers are disabled | Inventory all tenants (0B) → disable all (0C) → verify zero producers → then remove handler (0D). |

---

*Consolidated. No application code, tests, ERPNext data, or runtime state were modified
in producing this document. Before/after: 2111 lines → consolidated version.*
