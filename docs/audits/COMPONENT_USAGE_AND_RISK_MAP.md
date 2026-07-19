# Component Usage Frequency Audit & High-Risk UI Dependency Map

```text
Status: Generated 2026-07-18 (modernization Stages C + D, combined per open PO decision)
Method: static import scan of app/, components/, features/, lib/ (excludes node_modules/.next/worktrees)
Caveat: captured on branch feat/ui-ux-modernization mid-pass; re-run the scan after merge
Amended 2026-07-19: the "gold" selection-state reference below documents the
scan's as-found state (accurate at the time of the scan). The accent
decision has since been resolved — Indigo `#635BFF` is approved, Gold is
rejected as default — so this row will read differently once components are
re-themed and the scan is re-run. Do not treat "gold" below as current
target styling.
```

## Stage C — Usage frequency (import fan-in, top of scan)

| Fan-in | Component | Migration leverage |
|---|---|---|
| 16 | `components/ui/Badge` | HIGH — candidate to converge with `primitives/StatusChip` (keep Badge API, retheme internals) |
| 15 | `components/ui/Avatar` | HIGH — already token-friendly; leave as-is |
| 11 | `components/ui/WorkspaceShell` | DONE — upgraded in place; all 11 consumers inherited portal + focus trap for free |
| 10 | `components/ui/LoadingSkeleton` | MEDIUM — align radii/tokens when touched |
| 3 | `AddClientForm`, `MessagesView`, `QuickActions`, `GoalWorkspace/state` | modernized this pass |
| 2 | dashboard feature set, `PhoneInput`, `ClientHubPanel`, `UserMenuSheet` | modernized or stable |

Reading: the biggest remaining migration leverage is **Badge → StatusChip convergence** and **inline-button replacement with `primitives/Button`** (exemplar done in `SessionCompletionSheet`; remaining heavy files: `InvoicesView`, `ClientHubPanel`, `AddClientForm`).

## Stage D — High-risk dependencies (change with extra care)

| Surface | Why it's risky | Rule |
|---|---|---|
| `app/dashboard/@overlay` + intercepting routes `(.)clients/*` | Parallel/intercepting routing is working architecture the plan forbids replacing | Never restructure as part of styling work |
| `AddClientForm` | Feeds `addClient` server action; goal drafts frozen by Goal System closure | Presentation edits only; never touch `buildPayload`/`runCreate` |
| `BookingSheet` + `lib/scheduling/engine` | Client-side preview must mirror server plan; conflict/package gating | Never fork plan logic into JSX |
| `SessionCompletionSheet` | Version-checked financial mutations; consequence previews | Buttons/layout fair game; handlers are not |
| `InvoicesView` / MarkPaidSheet | Money recording; tenant-aware method availability | Any change needs the payment-methods loading/blocked states re-tested |
| `SchedulerXAdapter` | Third-party Schedule-X internals + custom event render | Theme via `scheduler-x-overrides.css` only |
| `DashboardClientShell` | Route-title map, full-width schedule exception, overlay slot | Width/nav edits only with all three layout modes checked |

## Stage E — As-built interaction patterns (subordinate to ADR-UX-005)

Recorded as-built; deviations are debt, not doctrine:

- **Sheets:** `WorkspaceShell` (mobile bottom sheet / desktop right drawer) — canonical. `BookingSheet` and `GoalEditorSheet` are structural exceptions now patched with `useFocusTrap` + portal; converge them onto WorkspaceShell only in a dedicated slice.
- **Confirmation:** financial/scheduling actions are confirmed-first with server previews; `ConfirmDialog` primitive is the only approved confirm surface (native `confirm()` eliminated).
- **Disabled controls:** disabled-with-reason is the standard (a11y §7). Remaining hidden-until-valid instances: none known after this pass; flag any found.
- **Navigation:** desktop sidebar + mobile bottom tab bar + FAB; planner keeps its own toolbar within shared tokens.
- **Feedback:** Sonner toasts for async outcomes; inline error paragraphs adjacent to the failing control; attention cards carry inline resolve links.
- **Selection:** gold `--fd-primary-soft` fill + `--fd-primary-strong` border (booking chips, steppers); calendar category colors are data semantics, not selection.
