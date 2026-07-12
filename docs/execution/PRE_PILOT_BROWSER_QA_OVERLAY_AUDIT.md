# Pre-Pilot Browser QA — Account Menu Overlay Audit

**Type:** Read-only UI audit + minimal fix plan. No files were edited; no commit was made.

## 1. Observed screenshots summary

Browser smoke QA against production commit `6f2c66b` (via the platform submodule bump)
showed the latest hardening UI rendering correctly, but with one recurring defect: the
account/profile menu (opened from the avatar button in the header) remains visible and
overlapping page content, other drawers, and modals in situations where it should have
closed — most visibly after navigating to a new route or after opening a second
sheet/drawer (e.g. Statement of account, Assign Package) while the account menu was still
open underneath.

## 2. Affected components / files

| Role | File | Notes |
|---|---|---|
| Account/profile menu | [components/modules/UserMenuSheet.tsx](../../components/modules/UserMenuSheet.tsx) | Hand-rolled fixed bottom-sheet. No responsive/desktop variant. |
| Menu owner (state + triggers) | [components/modules/DashboardClientShell.tsx](../../components/modules/DashboardClientShell.tsx) | Owns `menuOpen` state; renders **both** the mobile header button and the desktop header button, both opening the same `UserMenuSheet`. |
| Shared responsive overlay primitive | [components/ui/WorkspaceShell.tsx](../../components/ui/WorkspaceShell.tsx) | Already implements the correct pattern: `matchMedia('(min-width: 1024px)')` → desktop right-side drawer vs. mobile bottom sheet. `UserMenuSheet` does **not** use this. |
| Client detail overlay/drawer | [app/dashboard/@overlay/(.)clients/[id]/page.tsx](../../app/dashboard/@overlay/(.)clients/[id]/page.tsx) → [features/clients/components/ClientWorkspaceOverlay.tsx](../../features/clients/components/ClientWorkspaceOverlay.tsx) | Uses `WorkspaceShell`. Correct desktop/mobile behavior. |
| Client Hub side panel | [components/modules/ClientHubPanel.tsx](../../components/modules/ClientHubPanel.tsx) | Not itself an overlay — page content rendered both inside `ClientWorkspaceOverlay` and on the canonical `/dashboard/clients/[id]` page. Its own sub-sheets (`AssignPackageSheet`, `PackageDetailsSheet`) use `WorkspaceShell` correctly. |
| Statement of account | [components/clients/StatementSheet.tsx](../../components/clients/StatementSheet.tsx) | Uses `WorkspaceShell`. Correct desktop/mobile behavior. |
| Add Client | [components/clients/AddClientSheet.tsx](../../components/clients/AddClientSheet.tsx) | Uses `WorkspaceShell`. Correct. |
| Session completion | [components/scheduling/SessionCompletionSheet.tsx](../../components/scheduling/SessionCompletionSheet.tsx) | Uses `WorkspaceShell`. Correct. |
| Invoices page (record payment sheet) | [components/modules/InvoicesView.tsx](../../components/modules/InvoicesView.tsx) (~line 300–330) | **Also** hand-rolled, fixed bottom-sheet only, no `WorkspaceShell`, no desktop variant — same defect class as `UserMenuSheet`, but not in scope of this fix (see Non-scope). |
| Booking sheet | [components/scheduling/BookingSheet.tsx](../../components/scheduling/BookingSheet.tsx) | Hand-rolled, own z-40/z-50, own desktop handling — not in scope. |
| Workspace Settings | [app/dashboard/settings/page.tsx](../../app/dashboard/settings/page.tsx) | Plain routed page, not an overlay. Relevant only as one of the destinations the leftover account menu has been observed sitting on top of after navigation. |

No `createPortal` usage and no shared overlay-coordination context (`OverlayProvider` /
`useOverlay` / similar) exist anywhere in the codebase — confirmed by search.

## 3. Root cause hypothesis

**3a. No auto-close on route change.**
`menuOpen` state lives in `DashboardClientShell`, which is a persistent layout shell — only
`children` swap on navigation within `/dashboard/*` (Next.js App Router layout persistence).
`UserMenuSheet` closes itself on: backdrop click, Escape key, and `onClick={onClose}` on each
internal nav `<Link>`. It has **no effect watching `pathname`**, so any navigation that does
not originate from clicking a link *inside* the menu itself (browser back/forward, a
programmatic `router.push`/`router.back()` triggered elsewhere, a hard navigation via
`<a href>` such as `ClientWorkspaceOverlay`'s "Open full profile" CTA) leaves `menuOpen: true`
after the route changes, so the sheet keeps rendering on top of the new page.

**3b. No shared overlay-coordination mechanism.**
Every overlay in the app (`UserMenuSheet`, `WorkspaceShell`-based sheets, `InvoicesView`'s
payment sheet, `BookingSheet`, `GoalCommandDialog`) manages its own independent local `open`
boolean with zero cross-awareness of sibling overlays. Opening a second overlay (e.g. Assign
Package from inside the Client Hub panel) does not close the account menu, because nothing
tells it to — there is no shared registry, context, or "close others on open" convention
anywhere in the codebase.

**3c. Non-deterministic z-index across independently-mounted overlays.**
Every overlay in the app — `WorkspaceShell`, `UserMenuSheet`, `InvoicesView`'s sheet,
`BookingSheet`, `GoalCommandDialog` — reuses the identical `z-40` (backdrop) / `z-50` (panel)
pair. This is internally consistent for any *single* overlay, but when two overlays are
mounted simultaneously (3b), which one visually wins is decided by DOM sibling order, not by
an explicit stacking scheme. There is no reserved z-index band for "menu/nav chrome" vs.
"content sheet" vs. "confirmation dialog."

**3d. Desktop incorrectly uses the mobile bottom-sheet treatment — confirmed.**
`DashboardClientShell` renders **two** header buttons that both call `setMenuOpen(true)`: a
mobile header button (`lg:hidden`, line ~132) and a desktop header button (`hidden lg:flex`,
line ~162) — both open the exact same `UserMenuSheet`, which has no `isDesktop` branching at
all (unlike `WorkspaceShell`, which explicitly detects the `lg` breakpoint and swaps to a
right-side drawer). So on desktop, clicking the account avatar produces the identical
mobile-style bottom sheet, centered at `max-w-[480px]`, rather than a desktop-appropriate
treatment — this is the most visually broken part of what QA observed.

## 4. Minimal implementation plan

Scoped to the account menu only — does not touch `InvoicesView`'s sheet, `BookingSheet`, or
any billing/scheduling/WhatsApp logic.

1. **Close on route change.** In `UserMenuSheet` (or `DashboardClientShell`, whichever owns
   the effect more naturally), add a `usePathname()`-watching `useEffect` that calls
   `onClose()` (dependent on `pathname`, guarded to only fire when `open` is true and
   `pathname` actually changed) — mirrors the existing "close on Escape" effect already in
   the component.
2. **Close on opening another overlay.** Since there is no shared coordination primitive
   today, the smallest safe addition is a single lightweight overlay-registry hook (e.g.
   `useOverlayStack` or similar, colocated with `WorkspaceShell` since that's the existing
   shared overlay primitive) that lets any overlay announce "I am opening" and lets
   `UserMenuSheet` subscribe to close itself when that happens. Alternative smaller option
   (if a full registry feels too broad for this fix): have `DashboardClientShell` close the
   account menu explicitly whenever a route-level overlay (Client detail intercept) mounts,
   since that is the concrete case QA observed. Recommend starting with the pathname-based
   close (item 1) plus explicit close calls at the known intercept boundary, and only reach
   for a shared registry if more overlap cases turn up in QA.
3. **Deterministic z-index.** Introduce a small shared constant/token pair (e.g.
   `Z_OVERLAY_BACKDROP` / `Z_OVERLAY_PANEL`) used consistently by `WorkspaceShell` and
   `UserMenuSheet`, with the account menu's band explicitly *above* content sheets (since the
   account menu is nav-level chrome that should always win if both happen to be open
   momentarily during a close transition). This does not need a full design-token overhaul —
   just consistent shared values instead of each component's own literal `z-40`/`z-50`.
4. **Desktop treatment: reuse `WorkspaceShell` rather than a hand-rolled popover.**
   `WorkspaceShell` already implements exactly the desktop-drawer/mobile-sheet split the task
   asks for, and every other content sheet in the app already relies on it — the account menu
   is the outlier. Recommend migrating `UserMenuSheet`'s markup into a `WorkspaceShell` usage
   (header slot = avatar/name/email block, body = nav links, footer or inline = sign-out
   confirm state), keeping all existing behavior (Escape, backdrop click, sign-out confirm
   sub-state, body scroll lock) which `WorkspaceShell` already provides natively. This is
   smaller and safer than hand-building a bespoke desktop popover, and keeps the mobile
   bottom-sheet behavior fully intentional and unchanged (mobile output should be visually
   identical to today, since it's the same underlying non-desktop branch `WorkspaceShell`
   already renders for every other sheet).

Net effect: no navigation redesign, no new nav items, mobile behavior unchanged, desktop
gets a proper side-drawer instead of a centered mobile sheet, and the menu can no longer be
left open behind other content.

## 5. Targeted tests to add/update

No test files were found for `UserMenuSheet.tsx` or `DashboardClientShell.tsx` at this time
(component test coverage in this codebase currently skews toward actions/repository layers,
not this class of chrome component). Recommended net-new/updated coverage once implemented:

- `components/modules/UserMenuSheet.test.tsx` (new): renders on `open`, closes on Escape,
  closes on backdrop click, closes when `pathname` changes while open, desktop branch
  renders the drawer container class/attributes, mobile branch renders the bottom-sheet
  container class/attributes (mirror the existing pattern used for `WorkspaceShell`
  consumers, if any exist — else mirror `SessionCompletionSheet`'s test structure).
- `components/modules/DashboardClientShell.test.tsx` (new or extend if one exists): opening
  the account menu then triggering a client-detail overlay navigation closes the account
  menu before/as the new overlay mounts.
- If a shared z-index token module is introduced: a simple assertion test that
  `WorkspaceShell` and `UserMenuSheet` import the same constants (prevents future drift back
  to ad hoc literals).

## 6. Risks

- **Behavior risk:** if the "close on pathname change" effect is not carefully guarded, it
  could also close the menu on its *own* internal navigation clicks before the Link's
  `onClick={onClose}` finishes, causing a double-close (harmless) or, if scoped incorrectly,
  could interfere with the Escape/backdrop transition-out animation timing. Low risk, but
  should be verified visually (animation should still play, not snap shut).
- **Regression risk on desktop:** migrating `UserMenuSheet` onto `WorkspaceShell` changes its
  DOM structure (header/body/footer slots vs. today's single flat block), so the sign-out
  confirmation sub-state UI needs to be re-verified inside the new slot structure, and the
  existing focus-management effect (`cancelBtnRef.current?.focus()`) needs to keep working
  once nested inside `WorkspaceShell`'s body slot.
- **z-index change is global-ish:** even though scoped to a shared constant, changing it
  touches the stacking order used by every `WorkspaceShell` consumer (Client detail overlay,
  Statement, Add Client, Assign Package, Package Details, Session completion) — needs a
  visual pass across all of them, not just the account menu, before shipping.
- **Not full coverage:** `InvoicesView`'s payment sheet and `BookingSheet` share the same
  "hand-rolled, no desktop variant" defect class as `UserMenuSheet` but are explicitly out of
  scope for this fix (see below) — QA may still observe the same visual class of bug there
  until a separate, similarly-scoped fix is done.

## 7. Explicit non-scope

- No changes to navigation structure, nav items, or route layout.
- No changes to `InvoicesView`'s record-payment sheet or `BookingSheet` (same underlying
  defect class, but a separate, explicitly out-of-scope fix).
- No changes to billing logic, scheduling logic, WhatsApp send logic, ERP credentials,
  schema, or migrations.
- No changes to Docker, Dokploy, or provisioning.
- No design-token overhaul beyond the minimal shared z-index constant needed for
  deterministic stacking.
- No commit, no push — this document is the entire deliverable for this task.
