# FitDesk UI/UX Modernization — Execution Log

```text
Branch: feat/ui-ux-modernization (off e027365)
Dates: 2026-07-18
Status: Implemented, UNCOMMITTED, verification pending on local toolchain
Posture: presentation-layer only — zero business-logic, server-action, schema, or ERP changes
```

> **Note added 2026-07-19:** the Gold-oriented application work described
> below (the `app/globals.css` accent, Planner/booking/Add Client/Badge
> theming) remains uncommitted and requires the approved Indigo re-theme —
> Gold was rejected as the default accent by explicit product-owner decision
> dated 2026-07-19. This log is a historical record of what was built and
> why; it is **not** authority for final visual styling. See
> `docs/DOCUMENTATION_AUTHORITY_MAP.md` "Resolved decisions" and
> `ADR-UX-012-DESIGN_TOKEN_GOVERNANCE.md`.

## Shipped in this pass

### Foundation
- `components/ui/WorkspaceShell.tsx` — portaled to body, focus trap, focus restore, `inert`/`aria-hidden` when closed, `--fd-overlay` backdrop. Fixes the shipping mid-list Record Payment rendering defect and the closed-dialog a11y-tree defect.
- `components/ui/primitives/` — new: `Button`, `Card`, `EmptyState`, `ConfirmDialog`, `StatusChip` (+ index). Token-driven, zero new dependencies.
- `app/globals.css` — single gold action accent (`--fd-primary` + `-strong/-soft/-text`), blue demoted to semantics, `--fd-overlay`, shadcn-layer `--primary/--ring` aligned. See ADR-UX-012.

### Flows
- Dashboard: `ActionCenter` invoice cards resolve inline (Record payment → `/invoices/[id]/pay`, Remind → messages); `derive.ts` carries `clientId` (additive); `AiCopilotRail` now renders top-3 suggested actions from attention items (link-only) instead of a permanent placeholder; rail receives `items` from `DashboardView`.
- Shell: desktop sub-routes widen 480→760px; sidebar Settings active state covers sub-routes.
- Invoices: actions inside the card border; "Record payment" naming unified across list/detail/pay page; MarkPaidSheet rebuilt on WorkspaceShell.
- Session completion: server-preview consequence lines — package "balance N → N-1" and PPS invoice amount (previewBatchCompletionAction, one id).
- Planner: `scheduler-x-overrides.css` fully tokenized (was hardcoded Google palette); toolbar CTA + mobile FAB gold; real user avatar via `useSession`; booking stepper/chips/CTAs/success sheet on gold tokens; first-run empty state overlay with Book CTA (`ScheduleView`).
- Add Client: approved 4-step linear flow (Identity → Billing → Goals → Review) in `AddClientForm.tsx` — presentation-only restructure; all state/validation/duplicate/create logic unchanged; Enter advances, never submits early; Review states the billing consequence and the creation-does-nothing-else guarantee; GoalWorkspace default ON (`NEXT_PUBLIC_GOAL_WORKSPACE=0` opts out).
- Client Hub: Recent activity + Progress collapsed by default with counts; Program placeholder card removed; profile session list cut to 4 + "View all in Schedule".
- Booking review: financial consequence stated for unset/PPS billing modes.
- Messaging: financial sends confirm via `ConfirmDialog` (full message + recipient); `window.confirm` removed.
- Settings: coming-soon cards demoted to one compact roadmap card.

### Governance docs (new, Proposed status)
- `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-012-DESIGN_TOKEN_GOVERNANCE.md`
- `docs/standards/ACCESSIBILITY_ACCEPTANCE_STANDARD.md`
- `docs/standards/UI_REGRESSION_AND_VISUAL_VERIFICATION_PLAN.md`

## Verification state — READ BEFORE MERGING

The implementation sandbox could not run the toolchain (win32-only SWC/esbuild binaries; filesystem mount served stale copies of edited files). Structural verification was done by direct file review. **Before commit, run locally:**

```powershell
del .git\index.lock        # held by an IDE git process during the session
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Manual QA minimum: Add Client end-to-end (sheet + page variants, duplicate path, AI quick-add), Record payment from list and from dashboard card, session complete/no-show on a package client (balance preview), planner visual pass, WhatsApp financial-send confirm.

## Pass 3 (2026-07-18, same session) — remainder closed

- **Sheet audit result:** `AssignPackageSheet`, `PackageDetailsSheet`, `StatementSheet`, `UserMenuSheet`, `AddClientSheet` already use `WorkspaceShell` — all inherited the portal/focus-trap/inert upgrade automatically. The two structural exceptions were patched in place:
  - `GoalEditorSheet` — portaled to body, `useFocusTrap`, focus restore, `--fd-overlay`.
  - `BookingSheet` — `useFocusTrap`, Escape-to-close (blocked while pending), surface token instead of hardcoded white.
- New shared hook: `components/ui/useFocusTrap.ts` (exported from `components/ui`).
- `SessionCompletionSheet` — all four footers migrated to the `Button` primitive; hidden-until-valid confirms replaced with **disabled-with-reason** (no-show: "Choose how to handle billing above"; reschedule: "Pick a new date and time"). First full primitive-migration exemplar.
- `Badge` (fan-in 16) — internals rethemed: hardcoded hexes removed, contrast-safe dark text tones on tints (a11y §5). API unchanged; 16 consumers upgraded at once.
- `MobileShell` — dead code neutralized to a deprecation stub (`export {}`); the file itself must be `git rm`-ed in the next commit (build env could not delete).
- Stage C+D+E delivered: `docs/audits/COMPONENT_USAGE_AND_RISK_MAP.md` (generated from a real import scan).
- Stage I tooling: `scripts/perf-baseline.mjs` (zero-dep; `npm run perf:baseline`) — run BEFORE merge to capture the baseline, and after, to compare.
- Visual QA tooling: `scripts/visual-qa/capture.mjs` (`npm run visual:qa`) — requires product-owner approval to add `@playwright/test` as a devDependency before first use.

## Remaining program work (blocked on decisions or separate phases — not UI tasks)

1. **Broader inline-style sweep** — `InvoicesView`/`ClientHubPanel`/`AddClientForm` bodies still carry inline token styles; migrate opportunistically per ADR-UX-012 (no mass rewrite). The Button/Badge exemplars define the pattern.
2. Reschedule conflict pre-check: intentionally deferred — the server action already validates conflicts and errors are mapped (`mapRescheduleError`); a client pre-check would duplicate engine logic without new safety.
3. Invoice line items/origin: requires session↔invoice ERP linking — a separately-approved domain phase (TODO recorded in `InvoicesView`).
4. Product-owner decisions: PWA, dark mode, US-018 placement, secure client completion link, Playwright devDependency.
5. `git rm components/ui/MobileShell.tsx` in the commit.
