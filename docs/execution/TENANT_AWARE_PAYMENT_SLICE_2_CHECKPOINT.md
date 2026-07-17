# Tenant-Aware Payment — Slice 2 — Checkpoint

| | |
|---|---|
| **Status** | Implementation complete, verified in isolated sibling worktree. **Not committed, not pushed.** |
| **Date** | 2026-07-16 |
| **Worktree** | `FitDesk-payment-slice2` — a true sibling of `FitDesk/` (not nested under `.claude/worktrees/`), deliberately chosen to avoid the nested-worktree ESLint plugin-conflict Slice 1 hit and had to work around (see Slice 1 checkpoint §7) |
| **Branch / baseline** | `feat/tenant-aware-payment-slice-2` @ `615e56b` — the `main` tip at worktree creation |
| **Plan** | `docs/plans/FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md` §5 "Slice 2 — Full catalog + rails + settings" + `docs/execution/TENANT_AWARE_PAYMENT_SLICE_1_CHECKPOINT.md` — **untracked in this worktree, see §14 item 5** |

No ERPNext, Control Plane, database, or deployment mutation was performed at any point. No Mode of Payment or Chart-of-Accounts record was created in any ERP. This slice is application code and tests only. Commit and push remain **awaiting explicit approval**.

---

## 1. What this slice changes

- **`lib/payments/methods.ts`** — `PAYMENT_METHODS` grows from 3 to 7 canonical entries; each entry carries a `rail` and a `market: 'global' | 'LB'`. `cash` is `market: 'global', enabled: true`. All six others are `market: 'LB'` and currently held at `enabled: false` — see §13, the Lebanon market-boundary audit, for why. OMT's ERP docname is corrected from the retired `OMT` to `OMT Pay`. New `erpModeToPaymentMethod()` (reverse lookup) and `paymentRecordedAuditIdentity()` (audit-event field composition) added — see §10/§12.
- **`lib/payments/availability.ts`** — `SETTLEMENT_ASSET` extended to stay exhaustive over the wider `PaymentMethod` union; `SLICE1_CATALOG`/`Slice1CatalogEntry` renamed to `CATALOG`/`CatalogEntry`. The probe algorithm itself is byte-for-byte unchanged — it was already generic over the catalog's contents, which is exactly why the market hold (§13) needed no changes here at all: a `market:'LB'`/`enabled:false` row is filtered out by the same `productSupported` check that already existed for OMT's pre-Slice-2 hold.
- **`components/modules/InvoicesView.tsx`** — `MarkPaidSheet`'s method-button row changes from a fixed `flex` row of equal-width (`flex-1`) buttons to `flex flex-wrap` with `min-w-[100px]` per button, so up to 7 buttons wrap onto multiple rows once more methods are actually live. CSS-only.
- **`types/index.ts`** — `Payment` gains `methodId: PaymentMethod | null` and `methodLabel: string` — the exact identity, independent of the coarse `provider` field. See §10.
- **`lib/whish.ts`** — `PaymentAuditEvent.provider` becomes optional and is documented as link-routing-only; `method`/`methodLabel`/`erpModeOfPayment` added as the authoritative identity for `payment_recorded` events. See §12.
- **`actions/invoices.ts`** — `recordPayment()`'s audit-log call no longer sets `provider` at all; it spreads `paymentRecordedAuditIdentity(opts.method)` instead. The dead `modeToProvider()` helper (its only caller) is deleted outright, not just its call site. See §12.
- **`lib/statements/assembleStatement.ts`** — `buildPaymentRow()`'s row description changes from the hardcoded `'Payment received'` to `` `Payment received — ${payment.methodLabel}` ``.
- **Tests** — extensive rewrites across `methods.test.ts`, `availability.test.ts`, `client.test.ts`, `invoices.test.ts`, `packages.test.ts`, `assembleStatement.test.ts`, `package-assignment-service-paid-now.test.ts` — see §11 for the full accounting of what changed and why.

## 2. Files NOT touched, and why

- **`lib/erpnext/client.ts`'s `mapPaymentProvider`, `lib/whish.ts`'s `PaymentProvider`/adapters, `InvoicesView.tsx`'s `handleMethodChange` ternary** — kept exactly as designed: a coarse, deliberately approximate rail-family bucket for Whish-link-button routing only. Never touched as an identity source; see §12 for why this is a different, legitimate, narrower concern from the audit-identity fix.
- **`app/dashboard/invoices/[id]/pay/RecordPaymentForm.tsx`** — a native `<select><option>` already renders any number of options correctly; no code change needed.
- **`components/clients/AssignPackageForm.tsx`, `lib/billing/assign-package-flow.ts`** — Slice 1 already redesigned "Paid Now" to defer method selection entirely to the invoice payment flow; neither file inspects a `PaymentMethod` value.
- **`lib/billing/package-assignment-service.ts`, `types/billing.ts`** — consume `PaymentMethod` / `isEnabledPaymentMethod` only generically. The market hold (§13) is enforced entirely inside `isEnabledPaymentMethod`, so these files correctly and automatically reject held methods with zero code changes of their own.
- **`app/dashboard/settings/page.tsx`** — fully hardcoded/decorative, never wired to the real catalog even before this slice. Out of scope (task explicitly excludes "the full admin settings interface").
- **`lib/db/schema.ts`** — grepped repo-wide for `PaymentMethod` / `payment_method` / `paymentMethod`: zero matches. **No migration needed or added.** ERPNext stores its own `mode_of_payment` string per Payment Entry; this slice does not touch or migrate anything there.
- **Control Plane** (`fitdesk-platform/services/control-plane`) — read-only audited (§13), never edited. No contract change, no schema migration, no provisioning change.

## 3. Canonical catalog (final)

| Internal ID | UI label | ERP Mode of Payment docname | Rail | Market | Enabled now |
|---|---|---|---|---|---|
| `cash` | Cash | `Cash` | `cash` | `global` | **true** |
| `whish_money` | Whish Money | `Whish Money` | `mobile_wallet` | `LB` | false — held, §13 |
| `omt` | OMT Pay | `OMT Pay` | `mobile_wallet` | `LB` | false — held, §13 |
| `mymonty` | MyMonty | `MyMonty` | `mobile_wallet` | `LB` | false — held, §13 |
| `suyool` | Suyool | `Suyool` | `mobile_wallet` | `LB` | false — held, §13 |
| `purpl` | Purpl | `Purpl` | `mobile_wallet` | `LB` | false — held, §13 |
| `bank_transfer_fresh_usd` | Bank Transfer — Fresh USD | `Bank Transfer - Fresh USD` | `bank_transfer` | `LB` | false — held, §13 |

The last row's label uses an em dash ("—"); the ERP docname join key uses a plain hyphen ("-"). Intentional, tested explicitly.

`enabled` remains a **product-level kill switch**, distinct from live tenant ERP availability. Even once a method's `enabled` flips to `true`, it still independently needs the full ERP probe (exists → enabled → company-mapped account → currency-compatible) before a trainer ever sees it.

**Important correction from this document's first draft:** the table above previously showed all seven methods as `enabled: true`. That was true immediately after the initial catalog-expansion pass, but is superseded by §13 — the six Lebanon-only methods were subsequently held pending an authoritative market gate that turned out not to be safely buildable this run. This is the current, final state.

## 4. Why `omt` is retained as the internal id, and why its ERP docname becomes "OMT Pay"

Unchanged from the original analysis — the docname correction and the id's stability are independent of the market-boundary work in §13.

- **Internal id (`omt`) is preserved** — a stable domain identity, never renamed once shipped. No historical data to migrate (§2 — nothing persists it).
- **ERP docname corrects to `OMT Pay`.** `OMT` is no longer used anywhere in the codebase — tested two ways: a catalog scan asserts no entry uses the retired docname, and an availability test proves a tenant whose ERP only has the *old* `OMT` docname enabled still resolves `omt` to absent/not-found, never available (the join key genuinely changed).
- **Docname correctness and market eligibility are independent axes.** A dedicated test proves this directly: even a tenant with a perfectly-configured `OMT Pay` Mode of Payment still never sees `omt` as a candidate right now, because the market hold (§13) — not the docname — is what's gating it.

## 5. Why "Other Mobile Wallet" is not a fixed catalog entry

Unchanged from the original analysis. Every catalog entry is keyed to one fixed, verified ERP docname; "Other Mobile Wallet" has no such fixed docname by design — it is whatever wallet a specific tenant's admin has actually set up. Adding it today would mean either inventing a placeholder docname that can never match anything (dead code), or accepting a tenant/trainer-supplied name at runtime (explicitly forbidden). `mobile_wallet_other` is not a `PaymentMethod` union member — `isPaymentMethod('mobile_wallet_other')` is `false` (tested) — so it has no code path anywhere, by construction.

**Future configuration contract** (not built, documented as a findable extension point): a tenant-scoped admin-configured record — `providerId` (admin-chosen slug), `displayName`, exact `erpModeOfPayment` — merged by `probe()` alongside the static `CATALOG` before the same per-candidate gate. No new gate logic; the existing mechanism already generalizes.

## 6. Why USDT remains disabled

Unchanged from the original analysis. `usdt` was never added as a `PaymentMethod` union member — structurally, not by a runtime flag, so it can never be selected, exposed in the selector, or ERP-probed, even if a tenant's ERP happens to have an enabled `USDT` Mode of Payment (tested explicitly). No account or Mode of Payment created (this slice makes no ERP writes at all). The plan's `featureGate: 'payments.usdt'` remains the documented future contract; no workspace-feature-flag mechanism exists yet to attach it to, so building an unwired flag now would be exactly the speculative code this repo's `CLAUDE.md` forbids.

## 7. Compatibility audit

Grepped every non-test reference to `PaymentMethod`, `PAYMENT_METHODS`, `omt`, and the ERP docname strings across the repo. Confirmed generic, unaffected consumers: `actions/invoices.ts`, `actions/packages.ts`, `app/dashboard/invoices/[id]/pay/page.tsx`, `RecordPaymentForm.tsx`, `InvoicesView.tsx`, `lib/billing/package-assignment-service.ts`, `lib/business-data/index.ts`, `lib/erpnext/client.ts`, `lib/payments/availability.ts`, `lib/payments/errors.ts`, `lib/payments/selector-view.ts`, `types/billing.ts`. None hardcode a specific method name as business logic.

## 8. Test coverage — mapped to the original 21 required cases

| # | Requirement | Where proven |
|---|---|---|
| 1 | Seven canonical methods exist | `methods.test.ts` |
| 2–3 | `omt` → "OMT Pay" label + docname | `methods.test.ts` |
| 4 | Old docname "OMT" not used / doesn't silently resolve | `methods.test.ts` + `availability.test.ts` |
| 5–6 | Unique ids / deterministic rail | `methods.test.ts` |
| 7–10 | Missing/disabled/no-account/currency-mismatch → unavailable | `availability.test.ts` (Cash-focused, pre-existing and unaffected by the hold) |
| 11 | Valid methods become available | `availability.test.ts` (cash) |
| 12–14 | One/multiple/zero methods render safely | `selector-view.test.ts` |
| 15 | USDT unavailable | `methods.test.ts` + `availability.test.ts` |
| 16 | Other Mobile Wallet unavailable without config | `methods.test.ts` |
| 17 | Failed preflight creates no Payment Entry | `client.test.ts` (pre-existing, generic) |
| 18–19 | Cash / Whish Money identity unchanged | `methods.test.ts` (Whish Money's *identity* is unchanged; its *enabled* status changed for the documented §13 reason) |
| 20–21 | Paid Now / Pay Later unchanged | `assign-package-flow.test.ts` / `assign-package-source.test.ts` (pre-existing, untouched) |

Full mapping of the *current* task's 71-item test list is in §11.

## 9. USDT / Other Mobile Wallet — unaffected by the market boundary

Both remain unconditionally excluded regardless of market — they are not `market: 'LB'` catalog rows held pending a gate, they are not `PaymentMethod` union members at all. §5/§6 above are unchanged by §13's work.

---

## 10. Payment identity preservation — read-back fix (first pass, this session)

**Root cause.** The write path was always correct — `createAndSubmitPaymentEntry`/`markInvoicePaid` always send the exact resolved ERP docname. The gap was on the read side: `normalizePayment()` (`lib/erpnext/client.ts`) already receives ERPNext's exact `mode_of_payment` on every read and discarded it, keeping only the lossy `mapPaymentProvider()` bucket on `Payment.provider`. Latent, not directly visible at the time — the only consumer of payment history, `assembleStatement.ts`'s `buildPaymentRow`, didn't read `.provider` at all.

**Fix.** `erpModeToPaymentMethod()` (new, `lib/payments/methods.ts`) reverse-resolves an ERP docname to `{id, label}`, derived from the same `PAYMENT_METHODS` array as the forward lookup. `Payment` gained `methodId`/`methodLabel`; `normalizePayment()` populates them, falling back to the raw ERP text (never a guessed method) when the docname doesn't match any catalog entry. `assembleStatement.ts`'s row description now shows the real label.

## 11. Financial audit identity — corrected fix (this session, second pass)

**This session's own first attempt at the audit-log fix was insufficient, and was corrected in place — not left as a separate follow-up.** The first pass added a `method?: PaymentMethod` field to `PaymentAuditEvent` and had `recordPayment()` set it alongside the *existing* `provider: modeToProvider(modeOfPayment)` call. That still produced exactly the forbidden state for every non-cash method: `modeToProvider` substring-matches 'whish' and 'bank'/'transfer' and defaults everything else to `'cash'`, so a MyMonty payment's audit event was `{ provider: 'cash', method: 'mymonty', ... }` — a correct field sitting beside a contradictory one. Adding the right value next to the wrong one is not a fix.

**Corrected design:**

- `PaymentAuditEvent.provider` becomes **optional**, and is documented as link-generation routing only — set for `'link_generated'` events (where it's genuinely accurate: it names which link adapter ran), and **never** set for `'payment_recorded'` events, because a manually recorded payment invokes no link adapter and has no honest `provider` value to report.
- `PaymentAuditEvent` gains `method: PaymentMethod`, `methodLabel: string`, `erpModeOfPayment: string` — the authoritative identity for a recorded payment.
- New `paymentRecordedAuditIdentity(method)` in `lib/payments/methods.ts` composes these three fields from the catalog (not from `provider`, not from substring-matching anything). Extracted as a standalone function — not inlined in `actions/invoices.ts` — specifically so it is unit-testable for all seven catalog methods independent of the market hold (only `cash` can currently reach `recordPayment`'s success path live; the other six are rejected earlier by §13's gate).
- `recordPayment()`'s `logPaymentEvent` call now spreads `paymentRecordedAuditIdentity(opts.method)` and sets no `provider` key at all — not `undefined`, genuinely absent from the object.
- `modeToProvider()` (`actions/invoices.ts`) is **deleted outright**, not left as dead code. It had exactly one caller, and that caller is what created the contradictory state; keeping the function around would just be a loaded gun for the next person to pick back up.

**Verified structurally, not just by example:** `paymentRecordedAuditIdentity`'s tests iterate all seven catalog ids and assert `'provider' in identity` is `false` for every one, and that no non-cash method's `methodLabel`/`erpModeOfPayment` is ever the string `'Cash'`. This is the same class of proof as `erpModeToPaymentMethod`'s exhaustive test — not "the cases I thought of," but "every catalog entry, mechanically."

**What was deliberately left alone:** `mapPaymentProvider` (`lib/erpnext/client.ts`, backs `Payment.provider`) and `InvoicesView.tsx`'s `handleMethodChange` ternary. Both are a *different* concern from the audit event — `Payment.provider` coexists with the now-correct `Payment.methodId`/`methodLabel` on the same object without literally being logged as a flat, human-read "record," and the UI ternary only gates a button's visibility (correctly hidden for every non-Whish method, confirmed no functional impact). Stage 5 of this task scoped the forbidden-contradictory-state rule to the audit *event* system specifically; the separate, larger `PaymentProvider`/`PaymentMethod` enum reconciliation (plan §6) remains out of scope and was flagged as a standalone background task earlier this session.

## 12. Concurrent-session closure

Earlier this session, a background task was spawned (`task_9dc8e0fe`, "Reconcile PaymentProvider display mislabeling for new wallets") to fix exactly the audit-identity gap §11 above later had to fix properly. The user started it independently; it was found still `isRunning: true` with no dedicated worktree of its own (its `cwd` was the general workspace root, meaning it operated directly in this same shared worktree with no filesystem isolation from this session).

**Action taken:** the session was located via `list_sessions`/`get_session`, confirmed to have no isolated worktree (so archiving it carried no risk of destroying separate work), and stopped via `archive_session`. Confirmed after stopping: `isRunning: false`, `isArchived: true`, and `git worktree list` unchanged (it never created a worktree of its own at any point) — `git status` was byte-identical immediately before and after the stop, confirming no last-second write.

**What it left behind:** a single, isolated change to `lib/payments/methods.ts` — a new `providerCode: PaymentProvider` field added to `PaymentMethodDef` and every catalog row, with a design-rationale comment, but **zero consumers**: nothing in the entire repo read `.providerCode` (confirmed by a repo-wide grep, zero matches outside that one file), no test referenced it, no documentation referenced it. `mapPaymentProvider`/`modeToProvider`/the `InvoicesView.tsx` ternary — the actual intended consumers, per the task's own spawn prompt — were never updated to use it. This fails this task's explicit ownership bar ("prove its contract, consumers, tests, and necessity — otherwise separate it from this branch").

**Disposition:** removed. The full pre-removal diff of `lib/payments/methods.ts` (including `providerCode`) was backed up to `methods_ts_full_diff_before_providerCode_removal_20260716-135921.patch` in the session scratchpad (outside the repository) before any removal edit was made. The removal was surgical — targeted `Edit` calls removing exactly the `providerCode` field, its interface entry, its import of `PaymentProvider` from `@/lib/whish`, and nothing else — never a broad `git checkout`/`reset`/`restore` of the file, which would also have discarded this session's own legitimate, unrelated work already present in the same file (the 7-method catalog, the market/rail fields, `erpModeToPaymentMethod`, `paymentRecordedAuditIdentity`). Confirmed after removal: `grep -c providerCode` across the repo is `0`, and `tsc --noEmit` shows the same 21 pre-existing baseline errors as before, zero new — the removal introduced no breakage.

**Ownership after closure:** every one of the 17 changed files in the final diff (§14) traces to this session's own work. None are attributable to the archived session.

## 13. Lebanon market-boundary audit — why the six non-cash methods are held, not gated

**The requirement.** The expanded wallet/bank-transfer catalog (everything except `cash`) is Lebanon-only. Eligibility must be the authenticated workspace's *authoritative operating country* (`LB`, ISO 3166-1 alpha-2) — never trainer nationality, phone prefix, browser locale, timezone, or invoice currency.

**The audit.** Traced every place a workspace "country" concept could plausibly reach FitDesk's payment-availability resolver:

| Candidate source | Finding |
|---|---|
| `lib/tenant/context.ts` (`TenantContext`, FitDesk's own tenant-resolution helper) | No country field — only `userId, slug, tenantId, provisioningStatus, lastSyncedAt`. |
| `lib/db/schema.ts`'s `workspaceProvisioning` table (what `TenantContext` is built from) | No country column. |
| ERPNext's `FitDesk Trainer Settings` singleton (`ERPTrainerSettings`) | No country field — only `timezone, buffer_minutes, default_session_duration, working_days, initialized`. |
| The tenant-scoped Control Plane ERP proxy FitDesk actually calls (`erp-proxy.routes.ts`, JWT-authenticated via `resolveTenantFromAuth`) | Returns `erpSite, erpApiKey, erpApiSecret, tenantId, companyName, currency` — no `country`. Confirmed by grep of the route file: zero matches for "country". |
| Control Plane's `Tenant` Prisma model (`fitdesk-platform/services/control-plane/prisma/schema.prisma:46`) | **Does** have `country String`, populated once at tenant creation. This is the one place a real, persisted value exists. |
| The one Control Plane HTTP surface that returns it (`GET /tenants`, `tenant.routes.ts`) | Gated by `requireInternalApiKey` — a different, admin-only credential FitDesk's payment code doesn't hold and isn't designed to hold. Also a list-*all*-tenants endpoint, not scoped the way FitDesk's tenant JWT is. Not a legitimate path for a per-request payment-availability check. |

**A deeper problem, independent of reachability:** even the *stored* value's provenance is a silent, unconfirmed browser-timezone guess. `lib/workspace/locale.ts`'s `detectLocale()` reads `Intl.DateTimeFormat().resolvedOptions().timeZone`, maps it through a small MENA table (`Asia/Beirut` → `LB`), and `features/onboarding/components/workspace-setup-form.tsx` submits that value automatically — the UI shows it only as a read-only "preview," with no picker for the trainer to confirm or correct it. This is exactly the "timezone" inference class the task explicitly disqualifies as a Lebanon-eligibility source.

**Conclusion:** no safe, authoritative, already-wired workspace-country source reaches (or should reach, given the provenance issue) FitDesk's payment code today. Reaching one requires a Control Plane contract change — exposing `country` through the tenant-scoped ERP-proxy response — which is a change to a different service's wire contract, out of scope for this run without separate approval, and explicitly one of this task's own stop conditions.

**What was built instead.** Per the task's own explicit fallback ("implement only safe global identity/audit fixes... ensure the Lebanon-specific methods remain unavailable until an authoritative country reaches the resolver"): every `market: 'LB'` catalog row is held at `enabled: false` — the exact same product-level kill switch OMT used before its docname was corrected. `PAYMENT_METHODS` also now carries an explicit `market: 'global' | 'LB'` field (unused for enforcement today, since there is nothing to key it against) so the *intent* is visible and the eventual re-enablement path is a small, obvious change once a real country signal exists — not a rediscovery.

**What this honestly does and does not achieve:**

- **Satisfies every negative requirement.** No workspace — Lebanon or otherwise — can currently reach any of the six methods; none of them are ever ERP-detail-probed; Cash is completely unaffected; there is no client-side-only gate (the hold lives in `isEnabledPaymentMethod`/`availability.ts`'s `productSupported` filter, both server-side); no misleading "account missing" or similar error is produced (the methods are simply absent from `methods[]`, exactly like USDT).
- **Does not satisfy the positive requirement.** A genuine Lebanon-based trainer, right now, sees exactly the same thing as everyone else: Cash only. There is no mechanism today that could distinguish them, so none was built that would only pretend to. This is a real, known regression relative to this slice's *first* pass (before the market-boundary requirement was raised), where all six methods were live for every tenant — traded deliberately for correctness, since exposing Lebanon-specific mobile-money rails to trainers outside Lebanon (who could never actually get paid through them) is a worse defect than temporarily holding them for actual Lebanon trainers until the Control Plane wiring lands.

This is precisely why this run's verdict is **PARTIAL**, not PASS.

## 14. Test coverage — mapped to this task's 71 required cases

**Section A (1–12), catalog and canonical identity** — fully covered, `methods.test.ts` + `availability.test.ts` (USDT guard).

**Section B (13–34), Lebanon market boundary:**

| # | Requirement | Status |
|---|---|---|
| 13–15 | A workspace resolved as `LB` becomes eligible / probes exact docnames / becomes selectable after ERP checks | **Not testable — no code path exists to construct this.** This is the architecture gap itself, not a test-writing gap; fabricating a mock "workspace country" input that no real code accepts would be testing fiction, not behavior. |
| 16–21 | non-`LB` doesn't expose Whish Money / OMT Pay / MyMonty / Suyool / Purpl / Bank Transfer — Fresh USD | `availability.test.ts` — proven as a strict superset: held for *every* workspace, non-LB included, since none can currently be distinguished |
| 22 | Zero ERP detail probes for LB methods | `availability.test.ts` — "makes zero ERP Mode of Payment detail probes..." asserts `mockDoc` is never called with any of the six docnames even though Step 1's list included them |
| 23 | Missing workspace country fails closed | Trivially and unconditionally true — `ResolveAvailabilityParams` has no country field at all, proven by the "no inference channel exists" test; every call is as if country were absent |
| 24 | Invalid/ambiguous country fails closed | Same as 23 — there is no country parameter to be invalid |
| 25–30 | Nationality / `+961` trainer phone / `+961` customer phone / Arabic locale / Lebanon timezone / USD currency do not activate the catalog | `availability.test.ts` — "no Lebanon-eligibility inference channel exists" describe block: a type-level proof that `company`/`currency`/`tenantId` are the entire input surface, plus two tests proving Lebanon-*suggestive* currency (`LBP`) and company/tenant strings (`'Beirut Fitness LB'`) have zero effect |
| 31–32 | Cash unchanged for LB / non-LB workspaces | Cash's behavior was never conditioned on anything market-related in the first place — proven by every pre-existing Cash test, none of which reference market at all |
| 33 | No misleading configuration error for out-of-market methods | `availability.test.ts` — held methods are absent from `methods[]`, never present with an error status |
| 34 | Market filtering occurs server-side before ERP probing, not only in UI projection | `availability.test.ts` — the zero-detail-probes test proves this at the resolver level, not the UI level |

**Section C (35–46), availability/transaction safety** — fully covered by pre-existing, unaffected tests (Cash-focused availability cases, `selector-view.test.ts`, `client.test.ts`'s no-POST-after-failed-preflight, `assign-package-flow.test.ts`, `assign-package-source.test.ts`, availability's tenant/company cache-isolation tests).

**Section D (47–56), financial audit identity:**

| # | Requirement | Status |
|---|---|---|
| 47–53 | Each of the seven methods' audit output carries its own exact identity, never Cash | `methods.test.ts` — `paymentRecordedAuditIdentity` tested for all seven ids directly (not just cash, which is the only one currently reachable through the live `recordPayment` path) |
| 54 | Serialized audit output for every non-cash method contains no false `provider: cash` | `methods.test.ts` — explicit `JSON.stringify` test, asserts no `"provider"` key at all |
| 55 | No audit event contains contradictory coarse-provider and exact-method identities | Structurally impossible now — `provider` is never set on `payment_recorded` events (not conditionally, not defaulted — the key is absent). Proven directly for `cash` via `actions/invoices.test.ts` (`'provider' in call` is `false`) and for all seven at the construction level via `methods.test.ts` |
| 56 | Whish-link routing still works through the appropriate provider concept | `lib/whish.test.ts` (pre-existing, untouched, still passing) |

**Section E (57–69), global historical readback** — fully covered, unaffected by the market hold since `erpModeToPaymentMethod` searches the whole catalog regardless of `enabled`:

- 57–64: `client.test.ts`'s per-method readback test (all seven) plus a dedicated "none of the six non-cash methods ever reads back as cash" test.
- 65–66: unrecognized ERP modes preserve raw text, `methodId: null`, never Cash — pre-existing test, unaffected.
- 67: Statement shows the exact label — `assembleStatement.test.ts`.
- 68: historical readback is market-independent — trivially true, `getPaymentsForCustomer`/`normalizePayment` take no country/market parameter at all (their only input is `erpCustomerId`/the raw ERP doc).
- 69: a non-Lebanon-resolvable workspace can still read a historical MyMonty payment's exact identity without it becoming newly selectable — `availability.test.ts`'s dedicated cross-cutting test: a tenant's ERP genuinely has "MyMonty" configured (as a historical payment would prove), yet `resolveAvailablePaymentMethods` for a *new* transaction still shows only Cash, and never even reads MyMonty's detail doc.

**Section F (70–71), worktree ownership** — §12 (concurrent-session closure) and §14 header / this document's file-by-file accounting.

## 15. Verification performed (final, this session)

| Check | Command | Result |
|---|---|---|
| Targeted (payments/erpnext/statements/invoices/packages/billing) | `vitest run lib/payments/ lib/erpnext/ actions/invoices.test.ts actions/statements.test.ts actions/packages.test.ts lib/statements/ lib/whish.test.ts lib/billing/ components/clients/__tests__/assign-package-source.test.ts` | **899/899 passed** (29 files) |
| Full suite | `vitest run` | **2514/2514 passed** (83 files) |
| Lint | `npm run lint` | **exit 0** — clean |
| Type-check | `tsc --noEmit` | **21 pre-existing errors, zero new** — re-diffed byte-for-byte (`diff --strip-trailing-cr`) against the unmodified `main` baseline saved earlier this session; still identical |
| Build | `node scripts/build-verify.mjs` | **exit 0** — all 22 routes generated |
| `git diff --check` | | **exit 0** (one benign CRLF-normalization notice, not a whitespace error) |

**Not run: live browser verification.** `CONTROL_PLANE_URL` is unreachable in this environment and no auth/tenant session exists to drive the UI end-to-end. The one/multiple/zero-method render behavior and the Statement row label are proven at the pure-function boundary this repo already established for exactly this purpose (no RTL/jsdom installed).

## 16. Files changed — final classification (17 files, all owned, none unattributed)

| File | Classification |
|---|---|
| `lib/payments/methods.ts` | catalog, market policy, audit integrity |
| `lib/payments/availability.ts` | catalog (mechanical rename only) |
| `lib/payments/methods.test.ts` | tests |
| `lib/payments/availability.test.ts` | tests |
| `lib/payments/selector-view.test.ts` | tests |
| `lib/erpnext/client.ts` | identity/readback |
| `lib/erpnext/client.test.ts` | tests |
| `lib/whish.ts` | audit integrity |
| `lib/statements/assembleStatement.ts` | identity/readback |
| `lib/statements/assembleStatement.test.ts` | tests |
| `types/index.ts` | identity/readback |
| `actions/invoices.ts` | audit integrity |
| `actions/invoices.test.ts` | tests |
| `actions/statements.test.ts` | tests |
| `actions/packages.test.ts` | tests |
| `components/modules/InvoicesView.tsx` | UI |
| `lib/billing/__tests__/package-assignment-service-paid-now.test.ts` | tests |

Plus this document (`docs/execution/TENANT_AWARE_PAYMENT_SLICE_2_CHECKPOINT.md`) — documentation.

## 17. Documentation searched, and what did not need changes

Searched the repo for: payment-catalog, tenant-aware payments, Mode of Payment, OMT, Whish, payment provider, payment audit, workspace country, market, Lebanon, Slice 1, Slice 2 (21 files matched). Reviewed the architecture-tier candidates specifically (`docs/architecture/PAYMENT_SAFETY_GATES.md`, `docs/architecture/FITDESK_BILLING_PACKAGE_ERP_DECISION.md`, `docs/architecture/FITDESK_2026_ARCHITECTURE_HANDBOOK/00_ARCHITECTURE_CONSTITUTION.md`):

- `PAYMENT_SAFETY_GATES.md` is about `PILOT_ALLOW_EXTERNAL_PAYMENTS`/Whish-link generation — a different, unrelated gate this slice never touches. Its claim that `logPaymentEvent` writes only to server logs remains accurate (still true after this session's changes).
- `FITDESK_BILLING_PACKAGE_ERP_DECISION.md`'s one match is a generic mention, not a catalog-contents or identity claim.
- `00_ARCHITECTURE_CONSTITUTION.md` names "(Whish/Cash/Bank Transfer)" as an example inside a governance list ("Do-not-touch areas") describing the *protected surface*, not asserting the current product catalog's full contents — still accurate as written.

No stale claims found in any of these; none edited. The remaining 18 matched files are `docs/execution/`, `docs/audits/`, and `docs/plans/` historical/sprint records correctly describing past states — per `docs/DOCUMENTATION_AUTHORITY_MAP.md`, "audits document state; they do not define desired state," so retroactively editing them to imply this slice already existed when they were written would be revisionist, not corrective. None edited.

**Grepped the whole repo (not just docs) for the retired `'OMT'` docname** — every remaining match is in code/tests/this document, correctly framed as "retired"/"no longer resolves." Nothing treats it as still active.

## 18. Remaining approval gates and follow-ups

1. **Commit and push** (payment logic — CRITICAL / REQUIRE-APPROVAL per workspace and FitDesk `CLAUDE.md`).
2. **The Lebanon market gate itself** (§13) — requires a Control Plane contract change (exposing `Tenant.country` through the tenant-scoped ERP proxy) plus a decision on how to re-verify the value's provenance (the current onboarding capture is an unconfirmed timezone guess). This is a separate, larger, cross-service change requiring its own approval — not something this run could or should force through.
3. **`mobile_wallet_other` configuration surface** (§5) and the **USDT workspace feature gate** (§6) — both explicitly deferred, contracts documented for whenever they're approved.
4. **`PaymentProvider`/`PaymentMethod` enum reconciliation** beyond §11's identity fix — the coarse `provider` bucket (`Payment.provider`, `mapPaymentProvider`, the `InvoicesView.tsx` ternary) still exists and is unchanged; unifying it fully with the exact-identity fields remains a larger, separately-scoped change (plan §6), already flagged as a standalone background task earlier this session.
5. **Untracked canonical plan document.** `docs/plans/FITDESK_TENANT_AWARE_PAYMENT_OPTIONS_IMPLEMENTATION_PLAN.md` exists only as an **untracked** file in the original `FitDesk`/`main` worktree (confirmed: absent from this sibling worktree, since untracked files never propagate to `git worktree add`). This document (the checkpoint) is the tracked, canonical record of this branch's actual decisions and supersedes the plan's Slice 2 section wherever they differ (notably: the plan's original `bank_transfer`/`Bank Transfer` naming vs. this branch's `bank_transfer_fresh_usd`/`Bank Transfer - Fresh USD`, and the Lebanon market boundary, which post-dates the plan entirely). Syncing or committing that plan document is a separate, follow-up action for whoever owns `main`'s untracked state — not performed here, per this task's explicit "do not copy it blindly" instruction.
6. ERP-side provisioning of any of these seven Modes of Payment for a real tenant remains a separate, out-of-scope action requiring its own approval and a reachable environment.
