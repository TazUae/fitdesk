# Phase B0 — Graphify Knowledge Graph Audit

Status: COMPLETE  
Date: 2026-06-25  
Repo: FitDesk  
Branch: main  
Graph commit: c9afeadaa358f686cb92831a9550839126f9137f  
Graphify version: 0.8.49  
Mode: code-only, local, no LLM API key  
Generated output location: `graphify-out/`  
Generated output committed: no  

## Purpose

Phase B0 was added after Phase A and before architecture cleanup work to create a read-only repository knowledge graph and identify high-blast-radius files, architecture drift, and current-vs-target code reality.

Graphify output is evidence only. It is not a source of truth and does not authorize code changes without direct code verification, tests, lint, build, and architecture review.

## What was done

1. Verified clean repo state on `main`.
2. Installed Graphify locally through `uv tool install graphifyy`.
3. Added `graphify-out/` to `.gitignore`.
4. Ran Graphify in code-only mode using `graphify update .`.
5. Confirmed generated output stayed ignored:
   - `graphify-out/graph.json`
   - `graphify-out/graph.html`
   - `graphify-out/GRAPH_REPORT.md`
6. Performed targeted structural inspection of `graph.json`.
7. Verified Graphify findings against Git-tracked code with direct grep/code checks.

## Graph summary

Graphify produced:

- 2,296 nodes
- 3,665 links
- 147 communities
- 0 LLM token cost
- Code-only extraction
- No semantic doc extraction
- No committed generated graph artifacts

## Key findings

### 1. ERP client is highest blast-radius

The largest and highest-risk integration file is:

- `lib/erpnext/client.ts`

It connects to clients, invoices, sessions, payments, trainer creation, tenant context, ERP types, and normalization logic.

Cleanup rule:

- Do not casually refactor this file.
- Do not bypass the ERP client/proxy path.
- Do not store ERP credentials in FitDesk.
- Keep ERPNext/Frappe integration changes small, tested, and reversible.

### 2. Scheduling handbook paths are target architecture, not current code truth

The architecture handbook referenced these expected scheduling paths:

- `lib/scheduling/bookingService.ts`
- `lib/scheduling/sessionRepository.ts`
- `actions/schedulingActions.ts`

Direct Git verification showed these files are not tracked in current `main`.

Current tracked scheduling/session files include:

- `actions/sessions.ts`
- `lib/scheduling/engine.ts`
- `components/modules/SessionActions.tsx`
- `app/dashboard/schedule/new/page.tsx`
- `lib/erpnext/client.ts`
- `lib/business-data/erp-adapter.ts`

Implication:

- Phase F must begin with scheduling reconciliation, not implementation.
- The handbook should be treated as target direction where it mentions missing files.
- No scheduler migration should happen until current session flow, ERP session methods, and billing hooks are fully mapped.

### 3. UI/App direct imports to server actions are real

Direct imports were verified from UI/App files into server actions, including:

- `components/clients/AddClientForm.tsx` → `actions/clients.ts`
- `components/modules/InvoicesView.tsx` → `actions/invoices.ts`
- `components/modules/MessagesView.tsx` → `actions/messages.ts`
- `components/modules/SessionActions.tsx` → `actions/sessions.ts`
- `components/modules/WhatsAppView.tsx` → `actions/whatsapp.ts`
- `app/dashboard/invoices/[id]/FinalizeInvoiceButton.tsx` → `actions/invoices.ts`

Implication:

- This is acceptable for MVP if working and tested.
- This should not be mass-refactored during Phase B, C, or D.
- It becomes evidence for Phase E feature architecture migration.

### 4. Billing/session outcome contract is not complete yet

The code and docs confirm the desired billing/session outcome contract:

- Package mode: package invoice on package sale/assignment; session completion decrements balance.
- Pay-per-session mode: invoice generation on session completion.
- No-show: trainer decision whether to deduct/charge.
- Manual invoice creation remains hidden from normal trainer workflow.

Current safety state:

- Package-mode Add Client is blocked.
- Pay-per-session Add Client remains allowed.
- Add Client must not create invoices, payments, sessions, WhatsApp messages, or programs.

Implication:

- The current package-mode safety block is correct.
- Do not enable package mode until package invoice, Paid Now/Pay Later, session decrement, and no-show choices are verified.
- Do not clean scheduling without preserving billing hooks.

### 5. Existing canonical helpers are confirmed

Current canonical helper files exist and should be preserved:

- `lib/auth/resolve-trainer.ts`
- `lib/format/money.ts`
- `lib/invoices/status.ts`

These should remain the canonical locations unless a later architecture phase explicitly migrates them with tests.

## Recommended next actions

### MVP / pilot-safe now

1. Treat B0 as complete.
2. Keep `graphify-out/` ignored.
3. Do not commit generated graph output.
4. Continue to Phase B — Deployment Contract Cleanup.
5. Before Phase F, create a scheduling reconciliation audit that maps actual session flow from `actions/sessions.ts`.

### Production-hardening soon

1. Add an architecture note correcting the scheduling file-path mismatch in the handbook.
2. Add tests around session-completion billing outcomes before implementing package/PPS automation.
3. Decide whether UI/App direct action imports are acceptable long-term or should be wrapped in feature services.

### Future platform architecture later

1. Consider feature-based module boundaries after MVP stabilization.
2. Consider Graphify in CI only after privacy, artifact, and output-commit policies are approved.
3. Consider optional semantic doc extraction only after API-key/privacy rules are explicitly approved.

## Phase B0 verdict

PASS.

Graphify was installed and run safely in local code-only mode. Generated graph output stayed ignored and was not committed. Findings were verified against Git-tracked code. The audit identified high-risk ERP, scheduling, UI-action, and billing/session architecture boundaries before cleanup work begins.
