# FitDesk SaaS UX Upgrade — Implementation Blueprint

**Companion doc:** `FitDesk 2026 SaaS UX Audit.md` (in the same folder) — the Gap Analysis and Recommendations that this blueprint operationalizes.

**Operating principles for the whole rollout:**
- Every task is **atomic** — one focused sitting, 1–4 files typically, independently verifiable.
- Every task has a **single acceptance criterion** (AC). Pass it = task done.
- Every task lists **files** and **dependencies** (other task IDs).
- Within each phase, the verification gate is the same triad: `npx next lint`, `npx vitest run`, `npm run build:verify` — plus a manual mobile browser checklist for tasks that change visible UI.
- Each phase ends with **one commit per logical grouping** (not one giant commit). Branching strategy: continue on the active wip branch; do not push without explicit say-so.
- Constraints inherited from `CLAUDE.md`: no auth/payment/tenant changes without approval; no ERP writes; no `provisioning_api` changes; no destructive git/docker commands.
- "**Done**" for the whole program = all P0 + all P1 shipped, P2 backlog defined and started.

---

## Phase dependency map (high level)

```
PHASE 1 (P0 — Foundation Fixes)
   │
   ├── 1A  Visual bugs & token correctness  ──┐
   ├── 1B  PWA + a11y table-stakes           ─┼──► PHASE 2
   ├── 1C  Flow fixes (loading.tsx, UTC, …)  ─┤
   └── 1D  Auth completion (forgot-password) ─┘
                                             
PHASE 2 (P1 — Primitives + Motion Foundation)
   │
   ├── 2A  UI primitives (Button, Input, Field, Sheet, Dialog, Select, Tabs)
   ├── 2B  Motion tokens + prefers-reduced-motion
   └── 2C  vaul sheets (replaces existing custom sheets)
                  │
                  ▼
PHASE 3 (P1 — Polish & SaaS Standards)
   │
   ├── 3A  Dark mode (needs 1A-4 tokens reconciled)
   ├── 3B  Inline field validation (uses 2A Field primitive)
   ├── 3C  Schedule defaults (mobile = week)
   ├── 3D  Optimistic mutations
   ├── 3E  Bottom-nav badges (overdue, unread)
   ├── 3F  Progressive onboarding checklist
   ├── 3G  File-picker photo upload
   ├── 3H  Inline payment-link send
   └── 3I  Semantic landmarks + skip-to-content
                  │
                  ▼
PHASE 4 (P2 — Elite Polish)
   │
   ├── 4A  View Transitions + tab pill animation (needs 2B motion tokens)
   ├── 4B  Skeleton shimmer (needs 2B)
   ├── 4C  Haptics library
   ├── 4D  Command palette (needs 2A primitives)
   ├── 4E  Pull-to-refresh
   ├── 4F  Swipe-to-archive (needs 2C vaul / framer-motion)
   ├── 4G  Backdrop blur on sheets (needs 2C)
   ├── 4H  Localization scaffolding (next-intl)
   ├── 4I  Sonner theme=system (needs 3A dark mode)
   ├── 4J  <Image> migration in account page
   ├── 4K  aria-live polish on inline status messages
   └── 4L  Empty-state illustrations (blocked on design assets)
```

---

# PHASE 1 — Foundation Fixes (P0)

**Goal:** Stop the bleeding. All bugs that make the app feel broken, all table-stakes a11y holes, all dead-end flows. Mostly parallelizable inside the phase.

**Estimated duration:** 2–3 working days.

**Phase exit gate:** lint + vitest + build:verify all green; manual mobile browser pass on Clients/new, Account, Onboarding, Schedule, Invoices; no commits pushed.

---

## Group 1A — Visual bugs & token correctness

These are concrete, isolated fixes. Mostly parallelizable across separate commits.

### 1A-1 — Raise input font size to 16px (kill iOS auto-zoom)
- **Files:** `app/globals.css`
- **Dependencies:** none
- **AC:** `.input-base` `font-size` is `1rem` (16px); on iOS Safari, focusing any `.input-base` input does not trigger viewport auto-zoom.

### 1A-2 — Remove `maximum-scale=1` from viewport meta
- **Files:** `app/layout.tsx`
- **Dependencies:** 1A-1
- **AC:** Viewport meta is `width=device-width, initial-scale=1, viewport-fit=cover`; pinch-zoom works for low-vision users; no input auto-zooms on focus (still passing 1A-1).

### 1A-3 — Replace hardcoded `#00C853` button color with `--fd-blue`
- **Files:** `app/dashboard/clients/new/page.tsx`
- **Dependencies:** none
- **AC:** Create-Client submit button uses `var(--fd-blue)` background and `var(--fd-text-on-primary)` text; no hex literal remains in the file's inline `style`.

### 1A-4 — Reconcile `Badge` variants with Google-Calendar palette + add `coming-soon` variant
- **Files:** `components/modules/Badge.tsx`
- **Dependencies:** none
- **AC:** All Badge variants map to current `--fd-*` tokens (no orphan mint-green `#4ECBA0` RGBA); a new `coming-soon` variant exists using `--fd-muted` palette; no test breaks (`npx vitest run` green).

### 1A-5 — Migrate `BillingSetupSection` inline pill to `Badge` `coming-soon` variant
- **Files:** `components/clients/BillingSetupSection.tsx`
- **Dependencies:** 1A-4
- **AC:** Inline `<span>` pill is removed; replaced by `<Badge variant="coming-soon" />`; visible pill renders identically on `/dashboard/clients/new` when Package is selected.

### 1A-6 — Stop misusing `--fd-accent` (gold) for radio selection state
- **Files:** `components/clients/BillingSetupSection.tsx`
- **Dependencies:** none
- **AC:** Selected billing-mode radio uses `var(--fd-blue)` for border + dot; `--fd-accent` no longer appears in this file; matches the "primary CTA / focus / today → `--fd-blue`" rule documented in `globals.css:11`.

---

## Group 1B — PWA + accessibility table-stakes

### 1B-1 — Create `public/manifest.json`
- **Files:** `public/manifest.json` (new)
- **Dependencies:** none
- **AC:** Manifest declares `name`, `short_name: "FitDesk"`, `start_url: "/dashboard"`, `display: "standalone"`, `orientation: "portrait"`, `theme_color: "#FFFFFF"`, `background_color: "#F8F9FA"`, `icons` array (192/384/512 + maskable); validates against `manifest-validator` MIME `application/manifest+json`.

### 1B-2 — Generate PWA icon set
- **Files:** `public/icons/icon-192.png`, `icon-384.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180px)
- **Dependencies:** none
- **AC:** All five icons present in `public/icons/`; maskable icon respects safe-zone padding (inner 80% safe area); files referenced in `manifest.json` resolve 200 OK in `npm run build:verify`.

### 1B-3 — Wire manifest + apple-touch-icon links in `<head>`
- **Files:** `app/layout.tsx`
- **Dependencies:** 1B-1, 1B-2
- **AC:** `<head>` contains `<link rel="manifest">`, `<link rel="apple-touch-icon">`, and dual `theme-color` meta tags (one for light, one with `media="(prefers-color-scheme: dark)"`); Lighthouse PWA section shows "Installable: Yes".

### 1B-4 — Install and configure `@ducanh2912/next-pwa` with offline fallback
- **Files:** `package.json`, `next.config.mjs`, `public/offline.html` (new), `app/_offline/page.tsx` (or equivalent)
- **Dependencies:** 1B-1, 1B-3
- **AC:** Service worker registers in production build; `/api/*` uses network-first, static assets use stale-while-revalidate, navigation falls back to `/_offline` when offline; offline page matches design tokens. **(Requires user approval: adds a dependency — see `CLAUDE.md` §10.)**

### 1B-5 — Sweep `htmlFor` + `useId` across all form components
- **Files:** `app/dashboard/account/page.tsx`, `app/dashboard/clients/new/page.tsx`, `app/dashboard/clients/[id]/edit/page.tsx`, `components/ui/PhoneInput.tsx`, `components/ui/AgeInput.tsx`, `components/ui/MultiGoalSelector.tsx`, `components/clients/BillingSetupSection.tsx`, `components/onboarding/*`
- **Dependencies:** none
- **AC:** Every `<label>` either wraps its `<input>` directly OR carries a `htmlFor={id}` pointing at the input's `id={useId()}`; clicking any field label focuses its input; `axe-core` audit (manual run via DevTools) reports zero "label not associated" violations on `/dashboard/account` and `/dashboard/clients/new`.

---

## Group 1C — Flow fixes

### 1C-1 — `app/dashboard/clients/loading.tsx`
- **Files:** `app/dashboard/clients/loading.tsx` (new)
- **Dependencies:** none
- **AC:** Renders content-shaped skeleton matching `ClientsView` list (search bar placeholder + N client-card skeletons) using existing `LoadingSkeleton.tsx` primitives; route navigation from cold cache shows skeleton, never blank.

### 1C-2 — `app/dashboard/invoices/loading.tsx`
- **Files:** `app/dashboard/invoices/loading.tsx` (new)
- **Dependencies:** none
- **AC:** Skeleton matches `InvoicesView` tab bar + summary card row + N invoice rows; cold-cache navigation shows skeleton, never blank.

### 1C-3 — `app/dashboard/schedule/loading.tsx`
- **Files:** `app/dashboard/schedule/loading.tsx` (new)
- **Dependencies:** none
- **AC:** Skeleton matches calendar viewport (toolbar + 7-day grid placeholder); cold-cache navigation shows skeleton, never blank.

### 1C-4 — `app/dashboard/messages/loading.tsx`
- **Files:** `app/dashboard/messages/[clientId]/loading.tsx` (new), `app/dashboard/whatsapp/loading.tsx` (new)
- **Dependencies:** none
- **AC:** Both routes render thread-shaped skeletons; cold-cache navigation never shows blank screen.

### 1C-5 — `app/dashboard/settings/loading.tsx`
- **Files:** `app/dashboard/settings/loading.tsx` (new), `app/dashboard/account/loading.tsx` (new)
- **Dependencies:** none
- **AC:** Settings and account routes render form-shaped skeletons; cold-cache navigation never shows blank screen.

### 1C-6 — Replace hardcoded UTC date formatting with user-local timezone
- **Files:** `components/modules/DashboardView.tsx`, `components/modules/MessagesView.tsx`, `app/dashboard/page.tsx` (date filter logic)
- **Dependencies:** none
- **AC:** Removing `{ timeZone: 'UTC' }` from `toLocaleDateString` calls; "today's sessions" filter uses the browser-local date boundary; a trainer in `Asia/Beirut` viewing at 23:30 sees sessions for *their* today, not UTC's today; existing tests in `lib/clients/` still green.

### 1C-7 — Render Clients search input unconditionally + add muted empty state
- **Files:** `components/modules/ClientsView.tsx`
- **Dependencies:** none
- **AC:** Search input renders for any client count (including 0); when list is empty, an existing `EmptyState` renders below with "Add your first client" CTA; no UX cliff at the 3rd client.

### 1C-8 — Add sign-out confirmation bottom sheet on account page
- **Files:** `app/dashboard/account/page.tsx`, optionally extract `components/account/SignOutConfirmSheet.tsx`
- **Dependencies:** none (reuses existing `UserMenuSheet` portal/animation pattern)
- **AC:** Tapping "Sign out" opens a bottom sheet with "Sign out of FitDesk?" + Cancel/Sign out buttons; only after confirming does the actual sign-out fire; Escape and tap-backdrop dismiss without signing out.

---

## Group 1D — Auth completion

These touch auth, so **per `CLAUDE.md` §4 they require explicit user approval before implementation.** Listed here for sequencing; ack required before 1D-1 starts.

### 1D-1 — Add forgot-password page + Better Auth reset flow
- **Files:** `app/auth/forgot-password/page.tsx` (new), `lib/auth/*` (server wiring)
- **Dependencies:** **requires user approval (`CLAUDE.md` §4 — auth change)**
- **AC:** User on `/auth/login` clicks "Forgot password?", reaches a single-field email form, submission triggers Better Auth's email-reset flow, success state shows "Check your email" copy; no error reveals whether the email exists (enumeration safe).

### 1D-2 — Add reset-password page with token handler
- **Files:** `app/auth/reset-password/[token]/page.tsx` (new)
- **Dependencies:** 1D-1, **user approval**
- **AC:** Visiting the reset link from email shows a two-field form (new password + confirm); valid token + matching passwords transitions user to `/dashboard`; invalid/expired token shows a clear "link expired, request a new one" message with a link back to `/auth/forgot-password`.

### 1D-3 — Wire forgot-password link from `auth/login`
- **Files:** `app/auth/login/login-content.tsx`
- **Dependencies:** 1D-1
- **AC:** Forgot-password link appears below the password field on `/auth/login`, routes to `/auth/forgot-password`, and is keyboard-tabbable in logical order.

---

## Phase 1 verification gate

Single task at end of phase, not skippable.
- **AC:** `npx next lint` zero new warnings; `npx vitest run` 100% pass; `npm run build:verify` succeeds; manual mobile browser walkthrough (iPhone Safari simulator or real device): every screen in `/dashboard/*` shows skeleton on cold load; no auto-zoom on any input focus; sign-out requires confirmation; manifest is served at `/manifest.json`; install prompt appears in Chrome desktop devtools "Application > Manifest" tab.

---

# PHASE 2 — UI Primitives + Motion Foundation (P1, foundational subset)

**Goal:** Build the small foundational library that everything in Phase 3 and Phase 4 depends on. No user-visible feature work in this phase — but several existing components migrate to the new primitives.

**Estimated duration:** 2 working days.

**Phase exit gate:** lint + vitest + build:verify all green; existing UI is visually identical (regression guard); new primitives have at least one in-app consumer each.

---

## Group 2A — UI primitives

### 2A-1 — `components/ui/Button.tsx`
- **Files:** `components/ui/Button.tsx` (new)
- **Dependencies:** Phase 1 complete
- **AC:** Exposes variants (`primary`, `secondary`, `ghost`, `destructive`) and sizes (`sm`, `md`, `lg`); uses `--fd-blue`/`--fd-red`/`--fd-bg` tokens (no hex literals); forwards refs; supports `disabled`, `loading` (renders `Loader2` spinner with `aria-busy="true"`), `iconLeft`/`iconRight`; class names compose via `cn()` from `lib/utils`.

### 2A-2 — `components/ui/Input.tsx` (wraps `.input-base`)
- **Files:** `components/ui/Input.tsx` (new)
- **Dependencies:** 2A-1
- **AC:** Renders an `<input>` with `.input-base` class; takes `id` (with `useId()` fallback), `label`, `hint`, `error`, `required`; pairs label via `htmlFor`; sets `aria-invalid`, `aria-describedby` when in error state; supports `iconLeft`/`iconRight` slots.

### 2A-3 — `components/ui/Field.tsx` (label + input + hint/error layout)
- **Files:** `components/ui/Field.tsx` (new)
- **Dependencies:** 2A-2
- **AC:** Renders `<label>` + child input + `<p>` hint + `<p role="alert">` inline error in standard vertical stack; required indicator (red asterisk) appears when `required`; visible error text sits **directly under the field**, not at the bottom of the form.

### 2A-4 — `components/ui/Sheet.tsx` (placeholder API, vaul wiring in 2C)
- **Files:** `components/ui/Sheet.tsx` (new)
- **Dependencies:** 2A-1
- **AC:** Exposes `<Sheet>`, `<SheetTrigger>`, `<SheetContent>`, `<SheetHeader>`, `<SheetFooter>` API surface that mirrors `vaul`; the initial implementation can still use the existing custom portal pattern (vaul lands in 2C); one existing sheet (`UserMenuSheet`) migrates to consume this API as the pilot.

### 2A-5 — `components/ui/Dialog.tsx` (centered modal for desktop / confirmation)
- **Files:** `components/ui/Dialog.tsx` (new)
- **Dependencies:** 2A-1
- **AC:** Renders centered modal on `≥sm` viewports, falls back to bottom-sheet behavior on `<sm`; built on `@radix-ui/react-dialog` (already a dep, shadcn token system already wired); focus trap + Escape close + restore-focus-on-close all work; passes axe accessibility check.

### 2A-6 — `components/ui/Select.tsx`
- **Files:** `components/ui/Select.tsx` (new)
- **Dependencies:** 2A-2
- **AC:** Themed select built on `@radix-ui/react-select`; keyboard navigable (arrow up/down, type-to-search, Escape close); mobile shows native picker via a `data-native` prop fallback so iOS keeps the native wheel UX.

### 2A-7 — `components/ui/Tabs.tsx`
- **Files:** `components/ui/Tabs.tsx` (new)
- **Dependencies:** 2A-1
- **AC:** Themed tabs built on `@radix-ui/react-tabs`; active indicator animates via CSS `transition`; consumed by at least one existing view (Invoices outstanding/preparing/paid tabs).

---

## Group 2B — Motion language

### 2B-1 — Add motion tokens to Tailwind config
- **Files:** `tailwind.config.ts`
- **Dependencies:** none
- **AC:** `theme.extend.transitionDuration` adds `{ fast: '100ms', base: '150ms', slow: '300ms' }`; `theme.extend.transitionTimingFunction` adds `{ smooth: 'cubic-bezier(0.16, 1, 0.3, 1)', spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }`; build:verify succeeds with new utility classes.

### 2B-2 — Add `prefers-reduced-motion` global override to `globals.css`
- **Files:** `app/globals.css`
- **Dependencies:** none
- **AC:** When OS-level reduce-motion is on, all `transition-*` and `animate-*` durations collapse to `0.01ms`; verifiable in DevTools by toggling "Emulate CSS prefers-reduced-motion".

### 2B-3 — Sweep ad-hoc durations to motion tokens
- **Files:** `components/scheduling/*`, `components/ui/PhoneInput.tsx`, `components/modules/InvoicesView.tsx`, others as grepped
- **Dependencies:** 2B-1
- **AC:** Grep for `duration-150|duration-200|duration-300|duration-\[` returns zero hits in components; all transitions reference `duration-fast|base|slow` or `ease-smooth|spring`.

---

## Group 2C — `vaul` integration

### 2C-1 — Install `vaul` and migrate `Sheet` to use it under the hood
- **Files:** `package.json`, `components/ui/Sheet.tsx`
- **Dependencies:** 2A-4, **requires user approval (`CLAUDE.md` §4 — new dependency)**
- **AC:** `<Sheet>` API stays identical to 2A-4; under the hood it uses `vaul`'s `<Drawer>`; drag-to-dismiss works; snap-point at 50% and 100%; focus trap intact; sheets close on swipe-down with haptic-feel inertia.

### 2C-2 — Migrate `UserMenuSheet` to the new `Sheet` primitive
- **Files:** `components/modules/UserMenuSheet.tsx`
- **Dependencies:** 2C-1
- **AC:** Visual presentation is identical to current; drag-down dismiss works; Escape close + backdrop tap close still work; sign-out confirmation sheet (1C-8) also runs through the new primitive.

### 2C-3 — Migrate scheduling sheets (`BookingSheet`, `SessionDetailsSheet`, `SelectionTray`) to `Sheet` primitive
- **Files:** `components/scheduling/BookingSheet.tsx`, `components/scheduling/SessionDetailsSheet.tsx`, `components/scheduling/SelectionTray.tsx`
- **Dependencies:** 2C-1
- **AC:** All scheduling sheets are drag-dismissable; existing keyboard / Escape / focus behaviors preserved; visual diff vs current is purely additive (drag handle, spring physics).

### 2C-4 — Migrate `MarkPaidSheet` to `Sheet` primitive
- **Files:** `components/invoices/MarkPaidSheet.tsx` (or wherever it lives in `components/modules/InvoicesView.tsx`)
- **Dependencies:** 2C-1
- **AC:** Mark-paid flow opens, accepts input, submits, and closes via drag-down or button; identical to current happy path.

---

## Phase 2 verification gate
- **AC:** Build green; all sheets render and dismiss correctly on iOS Safari simulator; new primitives have at least one in-app consumer each; no `<button>` in newly-touched files uses raw inline styles for color (must go through tokens / Button primitive).

---

# PHASE 3 — Polish & SaaS Standards (P1, rest)

**Goal:** Bring the product from "competent MVP" to "looks and behaves like SaaS people pay for." Each task here lands as its own logical commit.

**Estimated duration:** 3–4 working days.

**Phase exit gate:** lint + vitest + build:verify; manual happy-path on every modified flow; dark mode toggleable; landmarks + skip-link verified with VoiceOver.

---

## Group 3A — Dark mode

### 3A-1 — Define `.dark` token block in `globals.css`
- **Files:** `app/globals.css`
- **Dependencies:** 1A-4 (Badge tokens reconciled), 2B (motion language defined for theme transition)
- **AC:** `.dark` selector (and its HSL counterpart for shadcn vars) defines every `--fd-*` token with a dark-theme value; toggling the `.dark` class on `<html>` flips the entire UI to dark with no missing or mis-mapped tokens; smooth ~150ms color-transition on theme switch (or no transition under reduced-motion).

### 3A-2 — Add `useTheme` hook (system / light / dark)
- **Files:** `lib/theme/useTheme.ts` (new), `app/layout.tsx`
- **Dependencies:** 3A-1
- **AC:** Hook returns `{ theme, resolvedTheme, setTheme }`; defaults to `system`, syncs to `localStorage`, respects `prefers-color-scheme` change without reload; no flash-of-wrong-theme on first paint (inline `<script>` in `<head>` reads localStorage before hydration).

### 3A-3 — Add manual theme toggle in More sheet
- **Files:** `components/modules/UserMenuSheet.tsx`
- **Dependencies:** 3A-2
- **AC:** Theme toggle row appears in More sheet with three options (System / Light / Dark); selecting updates immediately; selection persists across reload; matches the design-token theming aesthetic.

---

## Group 3B — Inline field validation

### 3B-1 — Migrate `new-client` form to `Field` primitive with inline errors
- **Files:** `app/dashboard/clients/new/page.tsx`
- **Dependencies:** 2A-3
- **AC:** Required errors ("Full name is required") render directly under their field, not in a bottom block; bottom block remains only as a screen-reader `aria-live="assertive"` summary; submitting a fresh form with empty name shows the inline error and focuses the name field.

### 3B-2 — Migrate `account` form to `Field` primitive with inline errors
- **Files:** `app/dashboard/account/page.tsx`
- **Dependencies:** 2A-3
- **AC:** Per-field validation surfaces inline; "Saved" confirmation announces via `aria-live="polite"`.

### 3B-3 — Migrate `MarkPaidSheet` to `Field` primitive with inline errors
- **Files:** `components/modules/InvoicesView.tsx` (MarkPaidSheet inner component)
- **Dependencies:** 2A-3
- **AC:** Amount and method validation errors render inline; sheet does not close on validation failure.

---

## Group 3C — Schedule mobile defaults

### 3C-1 — Default to week view on mobile, month on desktop
- **Files:** `components/scheduling/SchedulerXAdapter.tsx` (or wherever default view is set)
- **Dependencies:** none
- **AC:** On viewports `<768px`, schedule loads in week view; on `≥768px`, month view; view toggle still works manually; preference persists for the session.

### 3C-2 — Long-press to open `BookingSheet` directly with slot preselected
- **Files:** `components/scheduling/SchedulerXAdapter.tsx`, `components/scheduling/BookingSheet.tsx`
- **Dependencies:** 2C-3
- **AC:** ~500ms long-press on a calendar slot opens the BookingSheet with that slot's start time pre-populated; short tap retains current behavior; works on touch and with mouse-down.

---

## Group 3D — Optimistic mutations

### 3D-1 — `useOptimistic` for "Mark paid" action
- **Files:** `components/modules/InvoicesView.tsx`, related server action file
- **Dependencies:** Phase 2 complete
- **AC:** Tapping "Mark paid" flips the invoice's badge to `Paid` instantly; on server failure, badge reverts + Sonner error toast appears; on success, no visible change occurs (already optimistic).

### 3D-2 — `useOptimistic` for "Complete session" action
- **Files:** `components/scheduling/SessionDetailsSheet.tsx`, related server action
- **Dependencies:** Phase 2 complete
- **AC:** Session marked complete in the UI instantly; failure reverts; success is silent.

### 3D-3 — `useOptimistic` for account profile save
- **Files:** `app/dashboard/account/page.tsx`
- **Dependencies:** 3B-2
- **AC:** Saved state shows immediately on submit; reverts on failure with inline error.

---

## Group 3E — Bottom-nav badges

### 3E-1 — Add red dot badge to `Invoices` tab when `overdueCount > 0`
- **Files:** `components/modules/DashboardClientShell.tsx`, server-side count fetch
- **Dependencies:** none
- **AC:** When trainer has ≥1 overdue invoice, a small red dot appears at the top-right of the Invoices tab icon; clears immediately when count drops to 0; count refresh on route change.

### 3E-2 — Add red dot badge to `Messages`/`WhatsApp` tab when unread > 0
- **Files:** `components/modules/DashboardClientShell.tsx`
- **Dependencies:** 3E-1 (same pattern)
- **AC:** Same dot pattern as 3E-1 for unread messages; design and animation identical.

---

## Group 3F — Progressive onboarding checklist

### 3F-1 — Replace single spinner with staged checklist in `provisioning-status`
- **Files:** `components/onboarding/provisioning-status.tsx`
- **Dependencies:** none, **requires user approval (`CLAUDE.md` §4 — provisioning UX change)**
- **AC:** Provisioning screen shows ≥3 stages (e.g., "Account created", "Workspace provisioning", "Seeding default data", "Finalizing"); current stage animates a subtle pulse; completed stages have a checkmark; ETA badge appears after 30s based on `process.env.NEXT_PUBLIC_PROVISIONING_TYPICAL_SECONDS` or a hardcoded constant for now.

---

## Group 3G — File-picker photo upload

### 3G-1 — Add server action for photo upload to ERPNext File DocType
- **Files:** `actions/uploadProfilePhoto.ts` (new), `lib/erpnext/*` adapter
- **Dependencies:** **requires user approval (`CLAUDE.md` §4 — ERPNext write + new server action)**
- **AC:** Server action accepts a `File`, uploads it to ERPNext File DocType for the current trainer, returns the public URL; max 5MB, only `image/*` MIME, rate-limited per trainer; failure returns typed error.

### 3G-2 — Replace URL input with `<input type="file">` on account page
- **Files:** `app/dashboard/account/page.tsx`
- **Dependencies:** 3G-1
- **AC:** Account page shows a "Choose photo" button; selecting an image previews it immediately, then uploads on Save; existing URL field hidden behind a "Use URL instead" toggle for backwards compat.

---

## Group 3H — Inline payment-link send

### 3H-1 — Replace "Send message" navigation with inline confirm sheet
- **Files:** `components/modules/InvoicesView.tsx`
- **Dependencies:** 2C-1 (Sheet primitive)
- **AC:** Tapping "Send" on an invoice card opens a bottom sheet titled "Send payment link to {client}?" with WhatsApp logo + "Send" button; tapping Send fires the existing server action to send via Evolution API and shows a Sonner success toast; no navigation to `/dashboard/messages/[clientId]` occurs.

---

## Group 3I — Semantic landmarks + skip-to-content

### 3I-1 — Add landmarks in `DashboardClientShell`
- **Files:** `components/modules/DashboardClientShell.tsx`
- **Dependencies:** none
- **AC:** Top chrome wrapped in `<header>`, bottom nav in `<nav aria-label="Primary">`, content area in `<main id="main">`; VoiceOver "rotor > landmarks" lists three named landmarks per dashboard page.

### 3I-2 — Add `Skip to content` link in root layout
- **Files:** `app/layout.tsx`
- **Dependencies:** 3I-1
- **AC:** First Tab on any page focuses a visually-hidden "Skip to content" link; pressing Enter jumps focus to `#main`; link uses `.sr-only focus:not-sr-only` pattern, themed to match design tokens.

### 3I-3 — Wire `aria-label` on icon-only buttons
- **Files:** `components/modules/DashboardClientShell.tsx`, `components/modules/ClientsView.tsx`, `components/scheduling/*`
- **Dependencies:** none
- **AC:** Every `<button>` whose only child is a Lucide icon has an `aria-label`; axe-core "buttons must have discernible text" violation count is 0 on the audited pages.

---

## Phase 3 verification gate
- **AC:** Same triad + a full VoiceOver pass on Dashboard, Clients, Invoices, Schedule (every landmark named, every button labeled); dark mode toggleable from More sheet with no flash-of-wrong-theme.

---

# PHASE 4 — Elite Polish (P2)

**Goal:** The "people screenshot it for Twitter" tier. Order is flexible — each task is independent unless noted.

**Estimated duration:** 1 week, or rolling backlog if shipping is prioritized.

**Phase exit gate:** lint + vitest + build:verify; new polish features have at least one happy-path E2E or manual check; performance budget (Lighthouse mobile ≥ 90 across the board) maintained.

---

### 4A — View Transitions API for route changes + bottom-nav pill animation
- **Files:** `app/template.tsx` (new) or `next-view-transitions` wrapper, `components/modules/DashboardClientShell.tsx`
- **Dependencies:** 2B
- **AC:** Tab switches at the bottom nav animate the active-state pill between icons via `view-transition-name`; route changes fade-cross (not white flash); fallback in unsupported browsers is the current hard cut; reduced-motion disables both.

### 4B — Skeleton shimmer (replace `animate-pulse`)
- **Files:** `components/modules/LoadingSkeleton.tsx`, `app/globals.css` (new `@keyframes shimmer`)
- **Dependencies:** 2B
- **AC:** Skeletons render a left-to-right gradient sweep (1.4s ease-in-out infinite) using `--fd-border`→`--fd-card-hover`→`--fd-border`; no opacity pulse; reduced-motion replaces with a static muted background.

### 4C — Haptic feedback library
- **Files:** `lib/haptics.ts` (new), wire into `DashboardClientShell`, `MarkPaidSheet`, schedule complete action
- **Dependencies:** none
- **AC:** `hapticTap()`, `hapticSuccess()`, `hapticError()` exposed; each gated on `'vibrate' in navigator`; called on tab change, mark-paid success, session-complete success, send-message success, validation failure; no errors in browsers without vibrate.

### 4D — Command palette (⌘K / long-press More)
- **Files:** `components/ui/CommandPalette.tsx` (new), `components/modules/DashboardClientShell.tsx`, `package.json`
- **Dependencies:** 2A-1, 2A-5, **requires user approval (new dep: `cmdk`)**
- **AC:** ⌘K (or long-press More on mobile) opens a fuzzy-search palette with at least 6 actions: New client, New invoice, Log session, Find client, Open today's schedule, Toggle dark mode; Enter executes; Escape closes; arrow keys navigate.

### 4E — Pull-to-refresh on list views
- **Files:** `lib/hooks/usePullToRefresh.ts` (new), `components/modules/ClientsView.tsx`, `components/modules/InvoicesView.tsx`, `components/modules/MessagesView.tsx`
- **Dependencies:** none
- **AC:** Dragging the top of a list down past ~80px triggers a refresh spinner at the top and re-fetches; on completion, spinner retracts smoothly; no interference with normal scroll on shorter drags.

### 4F — Swipe-to-archive on invoice and message rows
- **Files:** `components/modules/InvoicesView.tsx`, `components/modules/MessagesView.tsx`
- **Dependencies:** 2C-1 (vaul or framer-motion drag primitive), 4C (haptic on threshold)
- **AC:** Horizontal swipe-left on a row reveals "Mark paid" (invoices) or "Archive" (messages); haptic fires at threshold; release past threshold commits the action with optimistic UI; release before threshold snaps back.

### 4G — Backdrop blur on sheets and modals
- **Files:** `components/ui/Sheet.tsx`, `components/ui/Dialog.tsx`, `app/globals.css`
- **Dependencies:** 2C
- **AC:** Sheet backdrop uses `backdrop-filter: blur(8px) saturate(120%); background-color: rgba(0,0,0,0.3)`; degrades gracefully in browsers without `backdrop-filter` to current opaque overlay.

### 4H — Localization scaffolding (`next-intl`)
- **Files:** `package.json`, `i18n/en.json` (new), `next.config.mjs`, several view files
- **Dependencies:** **requires user approval (new dep + architectural change)**
- **AC:** All user-facing strings in dashboard / auth / clients flow are moved to `i18n/en.json`; `next-intl` configured with English-only baseline; app builds and renders identically; RTL handling stubbed (`dir="auto"` on body) for future Arabic support.

### 4I — Sonner `theme="system"` after dark mode ships
- **Files:** `app/layout.tsx`
- **Dependencies:** 3A
- **AC:** Toaster's `theme` switches from hardcoded `light` to `system`; verified by toggling OS theme and confirming toast colors flip.

### 4J — Replace `<img>` with `<Image>` in account page
- **Files:** `app/dashboard/account/page.tsx`
- **Dependencies:** none
- **AC:** Profile photo uses `next/image` with `priority`, fixed dimensions, and an empty placeholder; lint warning at `account/page.tsx:118` is gone.

### 4K — `aria-live` on inline status messages
- **Files:** `app/dashboard/account/page.tsx` (Saved state), `components/clients/BillingSetupSection.tsx`, others as found
- **Dependencies:** 3I (landmarks scaffold)
- **AC:** "Saved" / "Updated" / inline success states wrap in `role="status" aria-live="polite"`; "Error" / "Failed" states wrap in `role="alert"`; VoiceOver announces on appearance.

### 4L — Empty-state illustrations
- **Files:** `public/illustrations/*.svg` (new), `components/modules/EmptyState.tsx`
- **Dependencies:** **blocked on design assets** (external)
- **AC:** Six SVG illustrations (no clients / no sessions today / no invoices / no messages / schedule empty / no goals) added to `public/illustrations/`; `EmptyState` component accepts an `illustration` prop; default empty states across views show illustration above headline.

---

# Cross-cutting standards (apply to every task)

1. **No new dependencies** without an explicit approval in chat (per `CLAUDE.md` §4).
2. **No auth, payment, tenant, ERPNext, or provisioning changes** without explicit approval. Tasks that touch these are flagged in the AC.
3. **Every task ends with the verification triad** (`npx next lint`, `npx vitest run`, `npm run build:verify`) green.
4. **Every PR-equivalent commit ends with a manual mobile browser pass** (iPhone Safari simulator or real device) when the task changes visible UI.
5. **No `npm run build` while `npm run dev` is running** (per `FitDesk/CLAUDE.md` build-isolation rule). Always use `build:verify`.
6. **No pushes** without explicit instruction.
7. **No `--no-verify`, no `--force`, no destructive git or docker.**
8. **Every commit message follows the existing convention** (`feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`).
9. **Atomic commits**: one logical change per commit. The Phase 1 23-task list above implies ~12–15 commits (some closely related tasks bundle), not 23 micro-commits and not 1 mega-commit.
10. **Memory hygiene**: after each phase completes, save a `project` memory entry noting which P0/P1/P2 items are done.

---

# Risk register

| Risk | Mitigation |
| --- | --- |
| Adding `vaul` (~12kB) introduces sheet regressions | 2C-1 keeps the `Sheet` API stable; one-sheet pilot (UserMenuSheet) before sweeping all four. Roll back to 2A-4 implementation if regression found. |
| `next-pwa` service worker caches stale assets on next deploy | Configure SW with `cacheOnNavigation: false` for `/api/*`; document a "kill switch" (version bump on SW path) in the commit message. |
| Better Auth password-reset email requires SMTP config | 1D-1 explicitly blocks on user approval and SMTP credentials; do not implement until both confirmed. |
| Schedule-X library lacks keyboard nav (A11Y-7) | Out of scope for Phase 3; track as a P2 dependency on the schedule-x roadmap or a wrapper layer. |
| Dark mode introduces visual regressions in Badge / chart areas | 3A-1 lands last in Phase 3; visual diff every pre-existing screen in both themes before merging. |
| Existing tests (465 passing) may break on htmlFor sweep | Run `vitest` after each migrated component; if any component has tests, update tests in the same task. |

---

# Suggested execution rhythm

- **End of every task**: report what changed, files touched, verification result, next task ID. Same shape as Phase C0 reports we've been doing.
- **End of every phase**: write a `project` memory entry summarizing what shipped; offer to push (only if authorized) and pause for review.
- **One running TodoWrite list per phase**: Phase 1 is seeded at execution time; re-seed for Phase 2 once Phase 1 ships.
