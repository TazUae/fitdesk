# FitDesk — Atomic Pay-Per-Session Completion: One Session, One Collectible Invoice

**Date:** 2026-05-29
**Status:** Plan only — NOT approved, NOT implemented. Awaiting founder sign-off.
**Type:** High-risk billing architecture plan. No code changed. No tests changed. No ERP records mutated. This document is uncommitted.
**Revision:** v2 — consolidated to single authoritative recommendation (Single ERP Atomic Method).
**Prior plan superseded:** v1 (claim-only Alternative A) is replaced in full. Do not follow v1 guidance.
**Audit basis:**
- `FitDesk/docs/PAY_PER_SESSION_COLLECTIBLE_INVOICE_IMPLEMENTATION_PLAN_2026-05-29.md`
- Concurrency audit (this session) proving `bec1f1d` can create two collectible invoices under concurrent completion.
- Source reads: `provisioning_api/provisioning_api/api/scheduling.py`, `fitdesk_setup.py`, `hooks.py`, `fd_session.py/json`; `control-plane` erp-proxy; `FitDesk` sessionService, sessionRepository, erpnext/client, schedulingActions.
- `provisioning_api` branch/commit audit confirming Commit 0A (`6008b57`) status.

---

## 1. Executive Decision Summary

### The rule this design must guarantee

> A completed Pay-per-session session must create **exactly one** valid collectible invoice — even under double-clicks, concurrent requests, retries, timeouts, or partial failures.

### Why the current commit fails

`bec1f1d` completes a session with the ordering `create invoice → submit → write invoice_id`. The write path (`updateSession`, `sessionRepository.ts:217`) is a plain Frappe REST `PUT` — **last-writer-wins, no compare-and-set, no lock, no unique ownership**. Every guard in `completeSession` (`sessionService.ts:259`) is a read-then-compare **in FitDesk application memory** against a prior read. Two concurrent requests both read `invoice_id=''`, both pass the guards, both create + submit → **two collectible invoices**. No implementation strategy that keeps orchestration in FitDesk application code can close this race without an atomic primitive at the data layer.

### The decision (v2 — revised)

The single "winner" decision must be made inside **one ERP-side method** that locks the FD Session row, validates billing eligibility, creates the invoice, submits it, and writes the completion state — **all in one Frappe request transaction**. FitDesk calls one method; ERP owns the entire lifecycle.

| Decision | v1 Recommendation (SUPERSEDED) | v2 Recommendation (CURRENT) |
|---|---|---|
| **Atomic ownership** | Claim-only CAS method (`claim_session_for_billing`); FitDesk orchestrates remaining steps | **Single ERP atomic method** (`complete_pay_per_session_with_invoice`): lock → validate → create → submit → link → complete in one transaction |
| **Durable billing-claim fields** | 3 new FD Session fields (`billing_completion_state`, `billing_claimed_at`, `billing_error`) | **None required for MVP** — session goes directly `scheduled/confirmed → completed`; no intermediate billing state |
| **Recovery key** | `custom_fd_session` (mandatory lookup before create) | **Same** — `custom_fd_session` set at create time; recovery path queries by session ref |
| **Control Plane** | No change | **Same** — existing `/api/erp/method/*` passthrough already reaches whitelisted methods |
| **Git** | Option B — clean branch from `799f023` | **Same** |
| **Deploy** | Blocked behind messaging gate | **Same** — additionally: Commit 0A is NOT yet merged to provisioning_api/main (see §12) |

**No implementation prompt is safe to issue until this revised architecture is approved and Commit 0A is merged.**

---

## 2. Confirmed Concurrency Failure in `bec1f1d`

### Current ordering (source-confirmed)

`completeSession` (`lib/scheduling/sessionService.ts:259–312`), after in-memory guards:

```
M1  createInvoice(...)            → ERP: DRAFT Sales Invoice (docstatus 0)          [not collectible]
M2  submitSalesInvoice(invoiceId) → ERP: docstatus 0→1 (Unpaid/Overdue)             [COLLECTIBLE]
M3  updateSession({status:'completed', invoiceId})  → FD Session: persists link + status
```

### Write semantics (root cause)

- `updateSession` is a plain `PUT /api/resource/FD Session/{id}` (`sessionRepository.ts:242`). No `WHERE version=…`, no `modified` timestamp, no conditional. **Last-writer-wins.**
- The Control Plane ERP proxy forwards the `PUT` verbatim with **no idempotency middleware and no lock** (`control-plane/src/modules/erp-proxy/erp-proxy.routes.ts:256`).
- The `version` field (`fd_session.json:144`) is plain `Int` data — the completion write doesn't even include it. It is an in-memory staleness hint, **not** a concurrency guarantee.

### The proven race

```
A  findSessionById → invoice_id='', version=1, status=scheduled
B  findSessionById → invoice_id='', version=1, status=scheduled     (identical snapshot)
A  guards pass        B  guards pass
A  createInvoice → DRAFT INV-A        B  createInvoice → DRAFT INV-B
A  updateSession(invoice_id=INV-A)    B  updateSession(invoice_id=INV-B)   ← silently overwrites
A  submitSalesInvoice(INV-A)          B  submitSalesInvoice(INV-B)
→ TWO collectible invoices. Session points at INV-B; INV-A is an orphaned, submitted, billable invoice.
```

A UI **double-click** alone (two `completeSessionAction` invocations from the same trainer) is sufficient to trigger this. No infrastructure retry or adversarial scenario is required.

### Non-unique fields confirmed (unchanged from v1)

| Field | DocType | Type | Unique? | Evidence |
|---|---|---|---|---|
| `invoice_id` | FD Session | Data | **No** | `fd_session.json:139` |
| `version` | FD Session | Int (default 1) | n/a (not a lock) | `fd_session.json:144` |
| `custom_fd_session` | Sales Invoice | Data | **No** | `fitdesk_setup.py:188`; creation block `:210–219` sets no `unique` flag |
| `custom_invoice_kind` | Sales Invoice | Select (`Package`/`Session`) | n/a | `fitdesk_setup.py:189` |

---

## 3. Repository / Service Boundary Classification

### What `provisioning_api` is

**File evidence:**

| Asset | File path | Description |
|---|---|---|
| FD Session DocType definition | `provisioning_api/api/doctype/fd_session/fd_session.json` | InnoDB engine, `autoname: hash`, `status` select, `invoice_id` Data, `version` Int |
| FD Session controller | `provisioning_api/api/doctype/fd_session/fd_session.py` | `validate()` → `_validate_occurrence_uniqueness()` |
| Scheduling whitelisted methods | `provisioning_api/api/scheduling.py` | `bulk_create_sessions`, `create_series` — `@frappe.whitelist(methods=["POST"])` |
| Sales Invoice custom fields | `provisioning_api/api/fitdesk_setup.py:171–190` | Defines `custom_fd_session`, `custom_invoice_kind`, and 13 other FitDesk custom fields |
| WhatsApp Server Script | `provisioning_api/api/fitdesk_setup.py:477–539` | Created during tenant setup; fires on "After Submit" of Sales Invoice |
| App metadata | `provisioning_api/hooks.py` | `app_name="provisioning_api"`, `app_description="ERP provisioning layer"` — minimal hooks, no `doc_events` |

**Key observations from source:**
1. `hooks.py` contains only app metadata (name, title, publisher, description, email, license) — no `doc_events`, no `scheduler_events`, no application hooks. All operational behavior is delivered through DocType definitions and whitelisted methods.
2. `scheduling.py` docstring confirms: *"Frappe wraps the entire handler in a DB transaction. If any session fails validation the whole batch rolls back."* — This is the authoritative confirmation of Frappe's request-level atomicity used by the existing scheduling methods.
3. `scheduling.py` whitelisted methods do NOT call `frappe.db.commit()` internally; they rely entirely on the request-level auto-commit. The atomic billing method must follow the same pattern.
4. `fitdesk_setup.py` is a one-time provisioning bootstrap (called via `bench execute`) — it does call `frappe.db.commit()` manually because `bench execute` runs outside the standard HTTP request lifecycle. Whitelisted methods are different.

**Classification verdict:**

`provisioning_api` is the permanent FitDesk ERP-side Frappe app. It is NOT a transitional provisioning shim. The "provisioning" name reflects its origin (bootstrapping ERPNext tenants for FitDesk) but it has grown into the FitDesk ERP layer — owning the FD Session DocType, scheduling business operations, and tenant setup. Adding the atomic billing method here is correct and consistent with existing architecture.

The new method must NOT go in `fitdesk_setup.py` (setup-only bootstrap) and must NOT be placed in `erp-execution-service` or `provisioning-agent` (proxy layers with no business logic). It must be a new `@frappe.whitelist` method in a new file `provisioning_api/api/billing.py`, separate from `scheduling.py` (different business domain).

This placement:
- keeps ERPNext as the system of record for billing operations;
- keeps all FitDesk ERP I/O on the approved `/api/erp/method/*` proxy path (same as `bulk_create_sessions`);
- adds **no** business logic to Control Plane, `provisioning-agent`, or `erp-execution-service`.

---

## 4. Claim-Only Design Critique (v1 Architecture — Rejected)

The v1 plan recommended this multi-step orchestration:

```
ERP atomically marks session as billing claimed (CAS: NULL → 'claimed')
→ FitDesk receives claim success
→ FitDesk creates invoice
→ FitDesk persists invoice link on session
→ FitDesk submits invoice
→ FitDesk finalizes session (status='completed', billing_completion_state='billed')
```

### Failure window audit

| Failure point | Durable ERP state left | Who may resume? | How is a second recovery request prevented? | Could revenue disappear or duplicate? |
|---|---|---|---|---|
| Claim succeeds, app crashes before create | `billing_completion_state='claimed'`, no invoice, `invoice_id` empty | Any requester on retry | **NOT prevented.** Two concurrent retries both observe `claimed` state with no invoice and may both attempt creation. Nothing stops the second. | **YES — duplicate possible** unless recovery is serialized by a second atomic gate (an additional CAS or a lock on the recovery path itself) |
| Claim succeeds, invoice create times out | `claimed`, invoice may or may not exist in ERP (outcome unknown to FitDesk) | Any requester on retry | **NOT prevented.** Two retries both read `claimed`/no-`invoice_id`, both query by `custom_fd_session`, both might find nothing (race on ERP create) or both find it. | **YES — duplicate possible** if the first `custom_fd_session` query returns empty during the ERP create window (race between query and insert) |
| Invoice exists, link persistence fails | `claimed`, invoice draft exists, `invoice_id` still empty | Any requester on retry | **NOT prevented.** Two retries both find existing draft by `custom_fd_session`; both attempt to persist the link. | Duplicate draft unlikely (same docname), but two requesters could each try to submit the same draft, competing on docstatus transition |
| Invoice linked (`invoice_id` set), submit fails | `claimed`, `invoice_id` set, docstatus=0 (draft) | Any requester | Not prevented, but less dangerous — both retries see the same `invoice_id` and attempt to submit the same document. Second submit gets a Frappe `DocstatusTransitionError`. | NO duplicate invoice — but unhandled exception on recovery retry |
| Invoice submitted, final session completion fails | `claimed`, `invoice_id` set, docstatus=1 (submitted) | Any requester | Not prevented — two retries both attempt `status='completed'`, `billing_completion_state='billed'`. Last-writer-wins on `updateSession`. | NO duplicate invoice. But race on the final write is still a problem (same as the original updateSession race, now for status only) |
| Two retries arrive while state is `claimed` (general) | `claimed`, state of invoice unknown | Both requesters simultaneously | **NOT PREVENTED.** The claim CAS prevents *first-time* duplicates but provides NO serialization for recovery. Recovery itself needs a second atomic gate. | **YES — duplicate possible** on the recovery path unless recovery is also serialized |

### Answers to the five required questions

1. **Does the claim-only model require a claim token, owner token, lease expiry, or atomic resume operation?** YES — to close the recovery race, the design requires: (a) a claim nonce or owner identifier so only the original claimant may resume; OR (b) a lease expiry field + background job to reclaim abandoned claims after a timeout; OR (c) a second atomic CAS for the recovery path. None of these were present in v1.

2. **Can it leave sessions permanently stuck in a billing-pending state?** YES — if the claimant process crashes and no retry arrives (or retries consistently fail), the session remains in `billing_completion_state='claimed'` indefinitely. No mechanism exists to reclaim or escalate it.

3. **Can two retry/recovery requests still duplicate an invoice unless recovery is also serialized?** YES — the `FOR UPDATE` CAS prevents two *first-time* requests from both winning; it does NOT prevent two recovery requests (both arriving when `billing_completion_state='claimed'`) from both creating invoices, because neither of them is changing the `billing_completion_state` from NULL — the CAS condition is already satisfied for both.

4. **How many new states, fields, endpoints, and recovery paths would it require?** To make it actually safe: 3 new FD Session fields (`billing_completion_state`, `billing_claimed_at`, `billing_error`), a second atomic CAS method for recovery serialization, a lease-expiry field or background reclaim job, a recovery-entry endpoint on FitDesk, and a recovery lookup path (`findInvoicesBySession` + recovery state machine in `sessionService.ts`). That is 4–6 new server-side code paths across two repos.

5. **Is it actually minimal for the pilot?** NO. The claim-only design achieves less safety than the single atomic method while requiring more code, more state, more fields, more recovery paths, and more tests.

**Conclusion: Claim-only design is NOT approved. Every recovery path was not made safe in v1 and cannot be made safe without adding complexity that equals or exceeds the single-method approach.**

---

## 5. Single ERP-Side Atomic Completion/Billing Command (Recommended Architecture)

### Method design

```text
FitDesk calls: POST /api/erp/method/provisioning_api.api.billing.complete_pay_per_session_with_invoice
Body: { session_id, expected_version }

ERP method:
  → SELECT tabFD Session WHERE name=session_id FOR UPDATE   (row lock; concurrent requests block here)
  → Re-read fresh session state after lock acquisition
  → Idempotency check: if status='completed' and invoice_id set and invoice docstatus=1 → return existing result
  → Validate: status must be in {scheduled, confirmed}
  → Version check: if expected_version provided and session.version ≠ expected_version → VERSION_CONFLICT
  → Load Customer: revalidate custom_billing_mode authoritative from Customer record
  → Package billing mode → reject with BILLING_MODE_PACKAGE (no invoice, no state change)
  → Trial billing mode → complete without invoice (no invoice, status → completed)
  → Other/missing billing mode → reject with BILLING_NOT_CONFIGURED
  → Validate rate (session.rate or client.custom_default_session_rate) > 0 → else RATE_NOT_CONFIGURED
  → Recovery: query Sales Invoice WHERE custom_fd_session=session_id AND docstatus IN (0,1)
      → if one found in docstatus=1: link it, complete session, return (recovery path A)
      → if one found in docstatus=0: submit it, link it, complete session, return (recovery path B)
      → if more than one found: return DUPLICATE_INVOICE error (manual review required)
  → Create Sales Invoice: customer, item=TRAINING-SESSION, rate, custom_fd_session=session_id, custom_invoice_kind='Session'
  → invoice.submit() — triggers on_submit (Server Script fires; Commit 0A gate: must be disabled)
  → frappe.db.set_value("FD Session", session_id, {invoice_id, status='completed', version+1})
  → return {session_id, invoice_id, invoice_status}
[end of request → frappe.db.commit() auto-commits all operations atomically]
```

### Illustrative pseudocode

```python
# provisioning_api/api/billing.py — NOT implementation, planning only
import frappe

@frappe.whitelist(methods=["POST"])
def complete_pay_per_session_with_invoice(session_id=None, expected_version=None):
    """
    Atomically complete a Pay-per-session FD Session and create exactly one
    collectible Sales Invoice.

    Concurrent safety:  SELECT ... FOR UPDATE serializes two simultaneous calls.
    Transaction safety: Frappe request handler wraps in one DB transaction
                        (consistent with bulk_create_sessions pattern).
    Idempotency:        If session already completed with submitted invoice, return it.
    Recovery:           custom_fd_session lookup finds invoices from timed-out prior attempts.
    Deployment gate:    invoice.submit() fires 'After Submit' Server Script.
                        Commit 0A (disable auto-messaging) must be merged and deployed.
    """
    if not session_id:
        frappe.throw("session_id is required", frappe.ValidationError)

    # 1. Lock the FD Session row for the duration of this transaction.
    #    InnoDB row-level exclusive lock. Concurrent requests block at this point.
    #    After the first request commits, concurrent waiters re-read the committed state.
    frappe.db.sql(
        "SELECT name FROM `tabFD Session` WHERE name = %s FOR UPDATE",
        (session_id,)
    )

    # 2. Re-read fresh session state AFTER acquiring the lock.
    session = frappe.get_doc("FD Session", session_id)

    # 3. Idempotency: already completed with a submitted (collectible) invoice?
    if session.status == "completed" and session.invoice_id:
        invoice = frappe.get_doc("Sales Invoice", session.invoice_id)
        if invoice.docstatus == 1:
            return {
                "idempotent": True,
                "session_id": session.name,
                "invoice_id": invoice.name,
                "invoice_status": invoice.status,
            }
        # Linked invoice is cancelled or draft — fail closed; requires manual review.
        frappe.throw(
            f"LINKED_INVOICE_INVALID: Linked invoice {session.invoice_id} "
            f"is not submitted (docstatus={invoice.docstatus})",
            frappe.ValidationError
        )

    # 4. Validate eligibility.
    if session.status not in ("scheduled", "confirmed"):
        frappe.throw(
            f"INELIGIBLE_STATUS: Cannot complete a session with status '{session.status}'",
            frappe.ValidationError
        )

    # 5. Version check (optimistic lock from FitDesk; non-fatal if omitted).
    if expected_version is not None and session.version != int(expected_version):
        frappe.throw("VERSION_CONFLICT: Session was modified — reload and retry",
                     frappe.ValidationError)

    # 6. Revalidate billing mode from Customer (authoritative source of truth).
    client = frappe.get_doc("Customer", session.client)
    billing_mode = client.custom_billing_mode

    if billing_mode == "Package":
        frappe.throw("BILLING_MODE_PACKAGE: Package completion requires balance tracking",
                     frappe.ValidationError)
    if not billing_mode:
        frappe.throw("BILLING_NOT_CONFIGURED: Client has no billing mode set",
                     frappe.ValidationError)
    if billing_mode == "Trial":
        # Trial sessions: complete with no invoice.
        frappe.db.set_value("FD Session", session_id, {
            "status": "completed",
            "version": session.version + 1,
        })
        return {"session_id": session_id, "billing_mode": "Trial", "invoice_id": None}
    if billing_mode != "Pay Per Session":
        frappe.throw(
            f"BILLING_NOT_CONFIGURED: Unknown billing mode '{billing_mode}'",
            frappe.ValidationError
        )

    # 7. Validate rate.
    rate = float(getattr(session, "rate", None) or
                 getattr(client, "custom_default_session_rate", 0) or 0)
    if rate <= 0:
        frappe.throw("RATE_NOT_CONFIGURED: Session rate is missing or zero",
                     frappe.ValidationError)

    # 8. Recovery: check for an existing invoice linked to this session.
    #    Handles: timeout after insert, timeout after submit, partial prior attempt.
    existing = frappe.db.get_list(
        "Sales Invoice",
        filters={"custom_fd_session": session_id, "docstatus": ["in", [0, 1]]},
        fields=["name", "docstatus", "status"],
        limit=2,
    )
    if existing:
        if len(existing) > 1:
            frappe.throw(
                f"DUPLICATE_INVOICE: Multiple invoices found for session {session_id}",
                frappe.ValidationError
            )
        inv = existing[0]
        invoice_doc = frappe.get_doc("Sales Invoice", inv["name"])
        if invoice_doc.docstatus == 0:
            invoice_doc.submit()  # submit the recovered draft
        frappe.db.set_value("FD Session", session_id, {
            "invoice_id": invoice_doc.name,
            "status": "completed",
            "version": session.version + 1,
        })
        return {
            "recovered": True,
            "session_id": session_id,
            "invoice_id": invoice_doc.name,
            "invoice_status": invoice_doc.status,
        }

    # 9. Create Sales Invoice.
    invoice_doc = frappe.get_doc({
        "doctype": "Sales Invoice",
        "customer": session.client,
        "due_date": frappe.utils.add_days(frappe.utils.today(), 30),
        "custom_fd_session": session_id,      # required recovery key
        "custom_invoice_kind": "Session",
        "items": [{"item_code": "TRAINING-SESSION", "qty": 1, "rate": rate}],
    })
    invoice_doc.insert(ignore_permissions=True)

    # 10. Submit invoice (docstatus 0 → 1 = collectible / Unpaid).
    #     "After Submit" Server Script fires here (within transaction).
    #     GATE: Commit 0A must be merged to provisioning_api/main and deployed
    #           so the "FitDesk Invoice Submit Webhook" script is disabled.
    invoice_doc.submit()

    # 11. Write invoice link and completion state in one call.
    frappe.db.set_value("FD Session", session_id, {
        "invoice_id": invoice_doc.name,
        "status": "completed",
        "version": session.version + 1,
    })

    return {
        "session_id": session_id,
        "invoice_id": invoice_doc.name,
        "invoice_status": invoice_doc.status,
    }
```

### Answers to the nine required questions

1. **Can this be implemented as one whitelisted ERP method using a real DB transaction and row lock?**
   YES. `frappe.db.sql("SELECT ... FOR UPDATE")` acquires an InnoDB exclusive row lock. `doc.insert()`, `doc.submit()`, and `frappe.db.set_value()` all operate within Frappe's request-level transaction (confirmed by `bulk_create_sessions` docstring: "Frappe wraps the entire handler in a DB transaction"). `frappe.db.commit()` is called automatically at request end after the method returns.

2. **If invoice creation or submission fails inside the method, does the transaction roll back without leaving a collectible orphan?**
   YES. If any step raises an exception (and it is not explicitly caught within the method), Frappe's request handler calls `frappe.db.rollback()` — all DB operations, including the invoice insert and submit, are undone. No collectible invoice is left. The FD Session remains in its prior state. The retry is safe.

3. **If two requests arrive concurrently, does row locking ensure the second sees the completed/invoiced result and creates no invoice?**
   YES. Both requests execute `SELECT ... FOR UPDATE` on the same FD Session row. InnoDB serializes them: the second request blocks at the lock statement until the first commits. After the first commits (session status=`completed`, `invoice_id` set), the second request acquires the lock, re-reads the session, hits the idempotency check at step 3, finds `status='completed'` with a submitted invoice, and returns the existing result. **No second invoice is created.**

4. **If the request times out after the ERP transaction commits, can a retry safely return the already-linked invoice?**
   YES. The retry acquires the row lock, re-reads the session, hits the idempotency check (status=`completed`, `invoice_id` set, docstatus=1), and returns the existing result. Even if the FitDesk client timed out before receiving the response, the retry is idempotent.
   
   **Edge case — crash between submit and set_value**: If the method crashes or is killed between step 10 (`invoice_doc.submit()`) and step 11 (`set_value`), Frappe's rollback will undo both the insert and the submit. The invoice will NOT exist with docstatus=1. The next retry will create a fresh invoice normally. (This is only possible if `doc.submit()` internally calls `frappe.db.commit()`; see note below.)
   
   **Note on Frappe internal commit uncertainty**: The `scheduling.py` pattern and Frappe's documented request-level transaction guarantee that no internal commit occurs within a standard whitelisted method. However, as a defense-in-depth measure, the recovery path (step 8) uses `custom_fd_session` to detect any invoice that was created/submitted in a prior partial attempt, regardless of whether it was committed before or after the method returned. This makes the method safe under both "true single-transaction" and "potential internal commit" Frappe behaviors.

5. **Would this approach avoid the need for `billing_completion_state`, `billing_claimed_at`, and `billing_error` fields?**
   YES — for MVP. No intermediate billing state is persisted. The session transitions directly from `scheduled`/`confirmed` → `completed` with `invoice_id` set. There is no "claimed" limbo state because the entire lifecycle completes atomically within one request.

6. **Is a small error/audit field still useful, or unnecessary for MVP?**
   NOT required for correctness or safety. An optional `billing_error` field on FD Session (Text, nullable) could be set on failed attempts for operator debugging. Deferred to post-pilot; it should only be added after the atomic method is proven stable on the pilot tenant.

7. **Does Sales Invoice submission invoke any external side effect inside the transaction that could break atomicity? Account for the WhatsApp Server Script safety gate.**
   PARTIALLY YES — with a critical deployment gate:
   - The Server Script `"FitDesk Invoice Submit Webhook"` (`fitdesk_setup.py:477`) is configured with `doctype_event: "After Submit"`, which fires synchronously within the `on_submit` hook, inside the request transaction.
   - The script makes `frappe.make_post_request()` to the Control Plane webhook (external HTTP call).
   - The script wraps the HTTP call in `try/except Exception` — failures are caught and logged, so the exception cannot break the transaction.
   - **IF the HTTP call succeeds**: A WhatsApp send is initiated externally (cannot be rolled back). If the outer transaction later rolls back (unusual), the WhatsApp was sent for an invoice that no longer exists.
   - **IF the script is disabled** (Commit 0A applied): The Server Script is a no-op. No external HTTP call. No atomicity risk.
   - **Deployment gate**: Commit 0A (`6008b57 fix(messaging): disable automatic invoice payment requests by default`) is on branch `wip/commit-0a-2026-05-29`. It is **NOT yet merged to provisioning_api/main**. The current `main` HEAD (`8fa0ff4`) has `"disabled": 0` in `fitdesk_setup.py:534` — the Server Script is enabled for new tenant provisioning. **This must be corrected before any billing deploy.**

8. **Does this architecture preserve all ERP I/O through the approved proxy path?**
   YES. FitDesk calls `POST /api/erp/method/provisioning_api.api.billing.complete_pay_per_session_with_invoice` through the existing Control Plane ERP proxy (`erp-proxy.routes.ts:299`, `POST /api/erp/method/*` passthrough). This is the identical channel used by `bulk_create_sessions`. No new proxy route is needed.

9. **What is the minimum FitDesk change if the lifecycle is performed inside one ERP method?**
   Three targeted changes:
   - `lib/erpnext/client.ts` — add `completePayPerSessionWithInvoice(sessionId, expectedVersion)` adapter method; add `findInvoiceBySession(sessionId)` for audit/verification.
   - `lib/scheduling/sessionService.ts` — replace the 3-step unsafe `createInvoice → submitSalesInvoice → updateSession` core in `completeSession()` with a single `completePayPerSessionWithInvoice(id, expectedVersion)` call. The existing fail-closed dispatch (Package block, missing mode, zero rate, Trial path, immutable-status guard) moves to the ERP method — the FitDesk code path becomes: auth + rate guard (optional, ERP re-validates) + single method call + error mapping.
   - `actions/schedulingActions.ts` — add new `SchedulingErrorCode` values for ERP-returned codes (`BILLING_MODE_PACKAGE`, `BILLING_NOT_CONFIGURED`, `RATE_NOT_CONFIGURED`, `LINKED_INVOICE_INVALID`, `DUPLICATE_INVOICE`).

---

## 6. Architecture Decision Matrix

| Criterion | Claim-only + FitDesk orchestration (v1 — REJECTED) | Single ERP atomic method (v2 — RECOMMENDED) |
|---|---|---|
| **Concurrent double-click protection** | PROTECTED — first CAS wins; second aborts | PROTECTED — `FOR UPDATE` lock; second sees completed state |
| **Sequential retry protection** | PARTIAL — claim is re-entrant but recovery is not serialized | FULL — idempotency check returns existing result; row lock serializes retries |
| **Crash after claim (partial state)** | STUCK — session in `claimed` with no invoice; recovery needs second CAS | SAFE — no partial state; rollback leaves session unchanged; retry is clean |
| **Unknown timeout outcome** | PROBLEMATIC — `custom_fd_session` lookup needed AND recovery must also be serialized | SAFE — `custom_fd_session` lookup in recovery path; row lock ensures single winner on any retry |
| **Number of new ERP fields** | 3 required (`billing_completion_state`, `billing_claimed_at`, `billing_error`) | **0 required** for MVP (optional `billing_error` deferred) |
| **Number of new recovery states** | 3–4 (`claimed`, `billed`, `error`, possibly `lease_expired`) | **0** — session is either `scheduled/confirmed` or `completed` |
| **Number of cross-layer calls** | 5–6 (claim, create, link, submit, finalize, + recovery endpoint) | **1** (single method call; ERP does everything) |
| **Test complexity** | HIGH — 6 failure windows × 2 concurrent scenarios each | MEDIUM — 1 method with idempotency + concurrent test |
| **Pilot safety** | MEDIUM — gaps exist unless recovery is fully designed first | HIGH — InnoDB row lock + Frappe request transaction; no intermediate state |
| **Architecture alignment** | FAIR — FitDesk orchestrates ERP operations (crosses the system-of-record boundary) | EXCELLENT — ERPNext owns its own financial lifecycle; FitDesk calls one approved method |
| **DocType change required** | YES — 3 additive fields (approval-gated, deploy-gated) | **NO** for MVP |
| **Recommended?** | **NO** | **YES** |

---

## 7. Recommended State Machine (Single ERP Atomic Method)

| Current session state | Action | ERP atomic method decision | Invoice result | Final session state | Retry result |
|---|---|---|---|---|---|
| `scheduled` or `confirmed`, no invoice, valid Pay-per-session rate | First completion | Lock → validate → create + submit + link | One submitted Outstanding invoice | `completed`, `invoice_id` set | Returns existing invoice (idempotent, step 3) |
| Two simultaneous completion requests | Complete twice | First acquires lock → commits; second blocks → re-reads completed state | One invoice only | `completed` (from first) | Second returns idempotent result — no second invoice |
| `scheduled`/`confirmed`, Package billing mode | Complete | Reject at step 6 before any invoice creation | None | Unchanged | Controlled error `BILLING_MODE_PACKAGE` |
| `scheduled`/`confirmed`, missing billing mode or unknown mode | Complete | Reject at step 6 | None | Unchanged | Controlled error `BILLING_NOT_CONFIGURED` |
| `scheduled`/`confirmed`, rate = 0 or missing | Complete | Reject at step 7 | None | Unchanged | Controlled error `RATE_NOT_CONFIGURED` |
| `scheduled`/`confirmed`, Trial billing mode | Complete | Complete without invoice at step 6 | None | `completed`, no `invoice_id` | Idempotent: session already `completed` |
| `completed` with submitted invoice (`invoice_id` set, docstatus=1) | Retry after success | Idempotency check at step 3 returns existing result | Existing submitted invoice only | `completed` (unchanged) | Safe — returns existing invoice |
| `completed` but linked invoice is draft or cancelled | Retry or edge case | Step 3 throws `LINKED_INVOICE_INVALID` | No new invoice | Unchanged | Controlled error — requires manual review |
| `scheduled`/`confirmed`, Pay-per-session, method fails before create (validation error, network, etc.) | Retry | Transaction rolled back — no invoice, no partial state | No collectible orphan | Unchanged | Safe retry — all guards apply fresh |
| `scheduled`/`confirmed`, method times out AFTER invoice insert but BEFORE submit (rolled back by Frappe) | Retry | Recovery path (step 8): no invoice found by `custom_fd_session`; create fresh | One new invoice | `completed` | Safe — prior insert was rolled back |
| `scheduled`/`confirmed`, method times out AFTER commit (session=`completed`, invoice submitted) | Retry | Idempotency check at step 3 finds `completed` + submitted invoice | Existing invoice only | `completed` (unchanged) | Safe idempotent response |
| `scheduled`/`confirmed`, prior attempt: invoice created and committed but session not yet updated | Retry | Recovery path (step 8) finds invoice by `custom_fd_session` (docstatus=0 or 1); submits if needed; links; completes | Existing invoice (no duplicate) | `completed`, `invoice_id` linked | Safe recovery |
| `cancelled`, `no_show`, `skipped` | Complete | Rejected at step 4 `INELIGIBLE_STATUS` | None | Unchanged | Controlled error |

---

## 8. Required Recovery Key Strategy (`custom_fd_session`)

### Status

`custom_fd_session` is a `Data` custom field on Sales Invoice, defined at line 188 of `fitdesk_setup.py`. It is installed by `_create_custom_fields()` during tenant provisioning. It is NOT unique (no `unique` flag in the Custom Field definition).

In the current unsafe `bec1f1d` code, `completeSession()` calls `createInvoice({...})` without setting `custom_fd_session`, so existing invoices created by that code carry no session reference.

### Mandatory usage in the new architecture

1. **The ERP atomic method MUST set `custom_fd_session = session_id` and `custom_invoice_kind = 'Session'` at invoice creation (step 9 of the method).** This makes the invoice queryable by session reference, enabling the recovery path (step 8).

2. **`custom_fd_session` is mandatory as an audit and recovery key.** If it is absent from an invoice, that invoice is unrecoverable from the session-completion path. The method must always set it.

3. **A `findInvoiceBySession(sessionId)` method must be added to `lib/erpnext/client.ts`** to support the FitDesk side verifying or auditing billing state. The existing `getInvoices()` does not filter by `custom_fd_session`.

### VPS verification required before deployment

Before deploying the atomic billing method to any tenant, verify the Custom Field exists on the target tenant:
```
GET /api/erp/doctype/Custom Field?filters=[["dt","=","Sales Invoice"],["fieldname","=","custom_fd_session"]]
```
Must return a non-empty result. If absent, billing deployment is blocked.

### Unique index decision

4. **Unique index on `custom_fd_session` is NOT required for MVP.** The `SELECT ... FOR UPDATE` row lock on FD Session ensures only one concurrent request can create an invoice for a given session. Unique index adds defense-in-depth only. It is deferred because: existing invoices almost certainly carry `custom_fd_session=''` (blank), and MariaDB's unique constraint treats `''` as a colliding value — index creation would fail without a backfill migration.

5. **Unique index remains a future defense-in-depth task** after legacy-data classification. It is separately approval-gated. It is NOT a prerequisite for the atomic method to be safe.

---

## 9. Exact Repository / File Scope

### `provisioning_api` — ERP-side (APPROVAL-GATED)

| File | Change type | Purpose |
|---|---|---|
| `provisioning_api/api/billing.py` | **NEW** | Whitelisted method `complete_pay_per_session_with_invoice` |
| `provisioning_api/tests/test_billing.py` | **NEW** | Unit + mock integration tests for the billing method (see §11) |
| `provisioning_api/api/fitdesk_setup.py` | **VERIFY** (read-only) | Confirm `custom_fd_session` and `custom_invoice_kind` are in `_CUSTOM_FIELDS`. They already are (lines 188–189). No change needed. |
| `provisioning_api/api/doctype/fd_session/*` | **NO CHANGE** | No new DocType fields for MVP |
| `provisioning_api/api/scheduling.py` | **NO CHANGE** | Billing is a distinct domain; do not add to scheduling methods |

### `FitDesk` — product layer

| File | Change type | Purpose |
|---|---|---|
| `lib/erpnext/client.ts` | **MODIFY** | Add `completePayPerSessionWithInvoice(sessionId, expectedVersion)` (calls `/api/erp/method/provisioning_api.api.billing.complete_pay_per_session_with_invoice`); add `findInvoiceBySession(sessionId)` (filters by `custom_fd_session`) |
| `lib/scheduling/sessionService.ts` | **MODIFY** | In `completeSession()`: replace the unsafe 3-step `createInvoice → submitSalesInvoice → updateSession` with a single `completePayPerSessionWithInvoice(id, expectedVersion)` call. Map ERP-returned errors to existing typed error classes. |
| `actions/schedulingActions.ts` | **MODIFY** | Add new `SchedulingErrorCode` values; update `mapError()` to handle `BILLING_MODE_PACKAGE`, `BILLING_NOT_CONFIGURED`, `RATE_NOT_CONFIGURED`, `LINKED_INVOICE_INVALID`, `DUPLICATE_INVOICE` |
| `lib/scheduling/__tests__/sessionService.test.ts` | **MODIFY** | Replace unsafe 3-step flow tests with single-method tests (see §11) |
| `lib/scheduling/__tests__/schedulingActions.test.ts` | **MODIFY** | Update error-code mapping tests |
| `types/scheduling.ts` or `lib/erpnext/types.ts` | **MODIFY (minor)** | Add return type for `completePayPerSessionWithInvoice` response |

### Control Plane — NO CHANGES

The existing `POST /api/erp/method/*` passthrough (`erp-proxy.routes.ts:299`) already routes calls to any whitelisted Frappe method, including `provisioning_api.api.billing.complete_pay_per_session_with_invoice`. No new routes, middleware, or locking are needed.

### Excluded repositories — NO CHANGES

- `provisioning-agent` — no change. No billing logic. Workspace rule: must stay thin.
- `erp-execution-service` — no change. The billing method is reached via the existing `/api/erp/method/*` proxy path — the same path `bulk_create_sessions` already uses. No new execution path is needed. **Proof**: `erp-proxy.routes.ts:299` handles `POST /api/erp/method/*` generically; no per-method registration required.

---

## 10. Git Replacement-Branch Strategy

`bec1f1d` is local-only (confirmed: not contained in any remote branch; `git branch -r --contains bec1f1d` returns empty). Its create→submit→link core is architecturally unsafe.

| Option | Assessment |
|---|---|
| A — keep `bec1f1d`, stack corrective commits | Risks pushing unsafe intermediate history; wrong ordering persists in pushable chain |
| **B — clean replacement branch from parent `799f023`** *(RECOMMENDED)* | Re-implement the approved atomic design cleanly; no unsafe billing commit in pushable history; retain `bec1f1d` local as evidence only |
| C — amend/squash | Obscures audit history |

**Recommendation: Option B.**
- Retain `bec1f1d` locally as evidence; do NOT push it.
- New branch name: `fix/atomic-pay-per-session-invoice`
- Base: `799f023` (the commit immediately before `bec1f1d`).
- Re-use only the safe, still-valid parts of `bec1f1d`: billing-mode dispatch, Package block, fail-closed guards, Trial path, error classes.
- Replace the unsafe core with the single ERP atomic method call.
- Do NOT create the branch in this planning task.

---

## 11. Test Matrix

### ERP method tests (`provisioning_api/tests/test_billing.py`)

These tests must run without a live Frappe bench (mock `frappe.db`, `frappe.get_doc`, etc.):

| Test | What it verifies |
|---|---|
| `test_already_completed_idempotent` | Session with `status=completed` + submitted invoice → returns existing result; no DB write |
| `test_package_billing_rejected` | `billing_mode=Package` → raises `BILLING_MODE_PACKAGE`; no invoice |
| `test_missing_billing_mode_rejected` | `billing_mode=''` or None → raises `BILLING_NOT_CONFIGURED`; no invoice |
| `test_trial_completes_without_invoice` | `billing_mode=Trial` → completes session, `invoice_id` is None |
| `test_zero_rate_rejected` | `rate=0` → raises `RATE_NOT_CONFIGURED`; no invoice |
| `test_ineligible_status_rejected` | `status=cancelled` → raises `INELIGIBLE_STATUS`; no invoice |
| `test_version_conflict_rejected` | `expected_version=1`, actual version=2 → raises `VERSION_CONFLICT` |
| `test_creates_invoice_on_first_call` | Valid Pay-per-session + valid rate → invoice created, submitted, linked, session completed |
| `test_recovery_draft_invoice_found` | Prior draft invoice found via `custom_fd_session` (docstatus=0) → submits it, links, completes; no second create |
| `test_recovery_submitted_invoice_found` | Prior submitted invoice found via `custom_fd_session` (docstatus=1) → links, completes; no re-submit |
| `test_duplicate_invoice_error` | Two invoices found via `custom_fd_session` → raises `DUPLICATE_INVOICE`; no further action |
| `test_linked_invalid_invoice_error` | Session `completed` but linked invoice is draft/cancelled → raises `LINKED_INVOICE_INVALID` |
| `test_custom_fd_session_set_at_create` | Invoice created → `custom_fd_session == session_id` and `custom_invoice_kind == 'Session'` |
| `test_version_incremented` | After completion → `session.version == prior_version + 1` |

### FitDesk service/action tests

| Test | What it verifies |
|---|---|
| Replace: 3-step unsafe flow tests → `test_completeSession_calls_single_erp_method` | `completeSession()` calls `completePayPerSessionWithInvoice()` — not `createInvoice`+`submitSalesInvoice`+`updateSession` separately |
| `test_completeSession_returns_completed_session` | Successful response → `FDSession` with status=`completed`, `invoiceId` set |
| `test_completeSession_idempotent_response` | ERP returns `{idempotent: true}` → FitDesk returns the existing session, no error |
| `test_completeSession_billing_not_configured` | ERP returns `BILLING_NOT_CONFIGURED` → `BillingNotConfiguredError` thrown |
| `test_completeSession_rate_not_configured` | ERP returns `RATE_NOT_CONFIGURED` → `SessionRateNotConfiguredError` thrown |
| `test_completeSession_package_blocked` | ERP returns `BILLING_MODE_PACKAGE` → `PackageCompletionNotReadyError` thrown |
| `test_completeSession_version_conflict` | ERP returns `VERSION_CONFLICT` → `VersionConflictError` thrown |
| `test_completeSession_trial_no_invoice` | ERP returns `{billing_mode: 'Trial', invoice_id: null}` → session completed, no invoice link |
| `test_action_error_code_billing_not_configured` | `mapError(BillingNotConfiguredError)` → `code: 'BILLING_NOT_CONFIGURED'` |
| `test_no_whatsapp_or_payment_logic_in_completeSession` | Assert no call to WhatsApp adapter or payment adapter in `completeSession` |

### Integration / acceptance (run only post-approval, never in planning)

- Verify Server Script `"FitDesk Invoice Submit Webhook"` is `disabled=1` on pilot tenant before any submitted-invoice validation.
- Verify `custom_fd_session` Custom Field exists on Sales Invoice on pilot tenant.
- Submitted invoice appears `Outstanding` / collectible.
- **No automatic WhatsApp** sent on submit.
- A subsequent explicit trainer payment-message action remains a separate, deliberate step.

---

## 12. Runtime / Deployment Gates

### Gate 0A — Commit 0A merge (BLOCKING — NOT YET DONE)

**CRITICAL FINDING**: Commit 0A (`6008b57 fix(messaging): disable automatic invoice payment requests by default`) is on branch `wip/commit-0a-2026-05-29` (pushed to `origin/wip/commit-0a-2026-05-29`). It is **NOT merged to `provisioning_api/main`**.

Current state of `provisioning_api/main` (HEAD `8fa0ff4`):
- `fitdesk_setup.py:534` has `"disabled": 0` — the Server Script is created **enabled** for new tenants.
- The regression test `tests/test_whatsapp_server_script.py` (added by Commit 0A) does NOT exist on main.
- New tenant provisioning from current main will create an enabled auto-WhatsApp Server Script.

**Required actions before any billing deploy (in order):**
1. Review Commit 0A on `wip/commit-0a-2026-05-29` — verify it sets `"disabled": 1` in `_create_whatsapp_server_script()` and includes the regression test.
2. Merge Commit 0A to `provisioning_api/main` (founder approval required — modifies messaging behavior).
3. Deploy `provisioning_api` to VPS (approval-gated; all provisioning_api changes deploy together).
4. Verify on the pilot tenant that the Server Script is disabled (read-only check below).

### Gate 0B — Per-tenant script disablement for already-provisioned tenants (Gate 0C in Commit 0A message)

Commit 0A's commit message states: *"Existing enabled scripts on the 15 tenant sites already provisioned are not affected (idempotency guard skips the creation path for existing scripts). Controlled per-tenant disablement follows as Gate 0C."*

This means: tenants provisioned BEFORE Commit 0A is deployed will still have the Server Script ENABLED. A separate Gate 0C operation must disable the script on each such tenant. This gate must be completed before billing is deployed on those tenants.

### Gate 0C — Read-only VPS verification (mandatory before billing deploy on pilot tenant)

Before deploying the atomic billing method to any tenant, run these read-only checks:

```
# 1. Server Script disabled
GET /api/erp/doctype/Server Script/FitDesk Invoice Submit Webhook
  → Assert: disabled == 1

# 2. custom_fd_session Custom Field exists on Sales Invoice
GET /api/erp/doctype/Custom Field?filters=[["dt","=","Sales Invoice"],["fieldname","=","custom_fd_session"]]
  → Assert: result is non-empty

# 3. TRAINING-SESSION item exists
GET /api/erp/doctype/Item/TRAINING-SESSION
  → Assert: exists, is_stock_item=0

# 4. custom_billing_mode Custom Field exists on Customer
GET /api/erp/doctype/Custom Field?filters=[["dt","=","Customer"],["fieldname","=","custom_billing_mode"]]
  → Assert: result is non-empty
```

### Gate 0D — No billing deployment without the above

**No submitted-invoice billing feature may be deployed until ALL of the above verification passes on the specific target tenant.**

### Control Plane webhook gate (unchanged)

Do NOT remove `POST /webhooks/invoice-submitted`. Removal is blocked until every deployed producer Server Script is inventoried and confirmed disabled.

### Legacy-data gate (unchanged)

No uniqueness migration or automatic recovery using `custom_fd_session` on existing invoices until existing invoice data is classified read-only (blank/duplicate audit).

---

## 13. Founder Approvals Required Before Implementation

| # | Approval required | Why / Scope | CLAUDE.md gate |
|---|---|---|---|
| 1 | **Commit 0A merge to provisioning_api/main** (`wip/commit-0a-2026-05-29` → `main`) | Modifies messaging behavior: Server Script created `disabled=1` for new tenants | §4 — messaging infrastructure change |
| 2 | **New whitelisted ERP method `complete_pay_per_session_with_invoice`** in `provisioning_api/api/billing.py` | New payment logic (billing lifecycle) in ERP-side code | §4 — payment logic; §4 — ERP method |
| 3 | **`provisioning_api` deploy to VPS** (couples with Commit 0A merge) | Deployment to production infrastructure | §4 — production infrastructure |
| 4 | **Git strategy** — Option B: clean branch `fix/atomic-pay-per-session-invoice` from `799f023`; abandon `bec1f1d` for push | Git history change | §6 |
| 5 | **Gate 0B (Gate 0C) per-tenant script disablement** for existing provisioned tenants | Modifies Server Script state on live tenants (messaging behavior) | §4 — WhatsApp / messaging |
| 6 | **(Later, separate) Unique `custom_fd_session` index** — only after legacy-data classification | High-risk schema migration | §4 — database schema change |
| 7 | **(Later, optional) `billing_error` field** on FD Session — only if post-pilot ops visibility justifies it | Additive DocType change | §4 — DocType change |

**Notably removed from v1 approval list**: The additive `billing_completion_state`, `billing_claimed_at`, `billing_error` DocType change is no longer required for MVP. This eliminates one approval gate and one `provisioning_api` deploy dependency.

---

**End of revised plan (v2). No code changed. No tests changed. No ERP/runtime data mutated. This document is uncommitted.**
