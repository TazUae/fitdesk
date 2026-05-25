# FitDesk — $100M SaaS UX Audit & Roadmap

**Benchmark:** Linear, Stripe, Notion 2026. Web app that feels indistinguishable from a native iOS/Android app on a mobile browser.

**Overall verdict:** FitDesk has unusually strong mobile-native bones — bottom tab bar, safe-area handling on the home indicator, all-skeleton (no-spinner) loading discipline, themed Sonner toasts, custom bottom-anchored sheets, a coherent Google-Calendar-derived token system. The product is roughly **a confident MVP at the visual-design layer**, but it ships several **concrete usability bugs** (iOS input auto-zoom, hardcoded button colors, stale Badge variants), **leaves PWA/installability completely on the table**, has **no motion language**, and is **not enterprise-ready on accessibility** (no landmarks, no `htmlFor`, no destructive-action confirmations). The gap to Linear/Stripe/Notion is roughly two focused sprints of work, not a rewrite.

---

# PART 1 — THE $100M SAAS GAP ANALYSIS

## 1.1 Mobile-Native Feel & PWA Readiness

| # | Gap | Evidence | Why it matters |
| --- | --- | --- | --- |
| **MN-1** | **Inputs trigger iOS auto-zoom on focus.** `.input-base` declares `font-size: 0.875rem` (14px). iOS Safari auto-zooms whenever a focused input has `font-size < 16px`. | `app/globals.css:167` | Every login, every new-client form, every invoice — the viewport jumps. This is the #1 "this is a website, not an app" tell. |
| **MN-2** | **No PWA manifest, no service worker, no installable home-screen icon.** `app/layout.tsx` declares viewport + theme-color but no `<link rel="manifest">`. `public/` has no `manifest.json`, no `sw.js`, no icons. | `app/layout.tsx:31-37` | A "personal trainer's operating system" used between sessions on a phone is the canonical PWA use case. No offline, no Add to Home Screen, no app icon — pure browser tab. |
| **MN-3** | **Bottom-nav icons are 22×22px inside a 64px-tall row.** Touch target is the whole row, but the visual affordance is tiny. | `DashboardClientShell.tsx:164-165` | Linear/Notion mobile use 24-28px icons with clear active-pill backgrounds. FitDesk's nav reads as "compact web", not "iOS Tab Bar." |
| **MN-4** | **Bottom sheets don't drag-to-dismiss.** Custom transform-based open/close; no `vaul` / `@radix-ui/react-dialog`; no pan handler. | `UserMenuSheet.tsx`, `BookingSheet`, `SessionDetailsSheet`, `SelectionTray` | Native users instinctively drag sheets down. Tap-the-X-button is a web-app tell. |
| **MN-5** | **No route transitions — every navigation is a hard cut/white flash.** No `template.tsx`, no `view-transition` CSS, no framer-motion page wrapper. | repo-wide (zero matches for transitions) | iOS apps slide; FitDesk teleports. |
| **MN-6** | **Per-route loading skeletons exist only at `/dashboard`.** Sub-routes (`/clients`, `/invoices`, `/schedule`, `/messages`) have no `loading.tsx`. | `app/dashboard/loading.tsx` exists; no others | Navigation to a sub-route from a cold cache → blank screen → content pops. Linear ships a `loading.tsx` per route. |
| **MN-7** | **`maximum-scale=1` in viewport breaks pinch-zoom for low-vision users.** Justified comment says "prevent iOS double-tap zoom on form inputs", but this is solvable via MN-1 (16px font) instead. | `app/layout.tsx:33` | Accessibility regulation risk (WCAG 1.4.4); MN-1 fix removes the original need. |
| **MN-8** | **No haptic feedback on key interactions.** No `navigator.vibrate()`, no Web Haptics. | repo-wide | Stripe Dashboard mobile uses haptics on swipe-to-archive; FitDesk's session-completed action feels mute. |
| **MN-9** | **`touch-action: manipulation` applied on `body` (too broad).** Disables double-tap-to-zoom *everywhere*, which is overkill and conflicts with the `maximum-scale=1` viewport. | `app/globals.css:126` | Should be scoped to interactive elements, not the entire document. |

## 1.2 Core User Flows & Routing Friction

| # | Gap | Evidence | Why it matters |
| --- | --- | --- | --- |
| **CF-1** | **Onboarding provisioning blocks dashboard with a 2-minute spinner and no ETA.** Polling starts at 2s, backs off to 8s; "slow notice" appears at ~2 min. | `provisioning-status.tsx:36, 52, 92-97` + `middleware.ts:71-78` | First-run drop-off risk. Linear/Stripe show progressive checklist ("creating workspace ✓ / seeding data ◦ / configuring billing ◦") to convert wait into anticipation. |
| **CF-2** | **Schedule booking takes 3+ taps and requires two sheets.** Tap slot → open BookingSheet → pick client → pick duration → confirm. Default view is month on mobile — wrong for phone. | `ScheduleView.tsx:104-149`, `components/scheduling/` | Calendars on phone start in **week** or **day** view (Google Calendar, Calendly, Cal.com). Booking should be ≤2 taps. |
| **CF-3** | **No optimistic UI on common mutations.** "Mark paid", "complete session", "save profile" all wait for the server roundtrip. `useTransition` is used in a few places but `useOptimistic` is absent. | grep for `useOptimistic` returns nothing | Linear's bug is that everything feels instant — because every mutation paints optimistically and reconciles on failure. |
| **CF-4** | **Clients search hidden until 3+ clients exist.** Discovery cliff: workflow changes the moment the user crosses the threshold. | `ClientsView.tsx:101` | Either always show, or never show — never "show conditionally" for primary navigation. |
| **CF-5** | **No forgot-password / email-verification flow.** | grep — absent | A locked-out trainer can't recover without support. Table-stakes for any SaaS. |
| **CF-6** | **Sign-out has no confirmation modal.** Single tap of the red "Sign out" button = logged out. | `account/page.tsx:267-279` | Misclick rate on mobile is high. Standard: bottom sheet "Sign out of FitDesk?" with Cancel/Sign out. |
| **CF-7** | **Account photo upload is URL-only.** No file picker. | `account/page.tsx:142-155` | Asks the user to host their own profile photo. Abandonment risk on first run. |
| **CF-8** | **Invoice → "Send payment link" routes through a separate Messages page.** No inline copy-link, no inline "Send via WhatsApp" CTA on the invoice card. | `InvoicesView.tsx:177-194` | Stripe sends invoices inline. The current pattern adds 2 unneeded taps. |
| **CF-9** | **Dashboard overdue invoices are buried at the bottom, not surfaced as a nav badge.** | `DashboardView.tsx` (overdue section position) | Most-revenue-critical signal is the most-buried. Bottom-nav "Invoices" should carry a red dot when overdue exists. |
| **CF-10** | **Times shown in UTC, hardcoded.** `toLocaleDateString('en-US', { timeZone: 'UTC' })`. | `DashboardView.tsx:81-86` | A trainer in Beirut sees New York's "today". Showstopper bug for international users. |

## 1.3 UI Polish, Animations, & Micro-interactions

| # | Gap | Evidence | Why it matters |
| --- | --- | --- | --- |
| **UP-1** | **No motion language.** No durations or easings in Tailwind config; transitions use ad-hoc `duration-150/200/300`. No `prefers-reduced-motion` queries anywhere. | `tailwind.config.ts:61-74` (only accordion keyframes) | Every elite SaaS has a motion spec (e.g. Linear: 100/150/200/300ms with custom easings). |
| **UP-2** | **No dark mode, despite `darkMode: ['class']` declared in Tailwind.** Only light tokens exist; `.dark` selector is empty. | `tailwind.config.ts:5`, `globals.css` (no `.dark` rules) | Trainers work at 6am and 10pm. Dark mode is now table-stakes. |
| **UP-3** | **Hardcoded `#00C853` on the Create Client button doesn't match any token.** Should use `--fd-blue` (primary CTA per design-token doc comment) or `--fd-green`. | `app/dashboard/clients/new/page.tsx:382` | Bug — bypasses the design system, prevents theme switching. |
| **UP-4** | **Badge component palette is stale and inconsistent with current Google-Calendar tokens.** Active = `#4ECBA0` mint; success token is `#188038` Google green. They are visibly different. | `components/modules/Badge.tsx:5-18` | Two parallel green palettes — a "dark theme leftover" bug from Phase 4.x. |
| **UP-5** | **`--fd-accent` (gold #E8C547) is described as "wordmark only" but used as the radio selection ring.** | `globals.css:39-40` vs. `BillingSetupSection.tsx:60, 67, 70` | Token is being misused; on light backgrounds gold-on-white has ~3.2:1 contrast (fails WCAG AA). |
| **UP-6** | **Skeletons pulse, don't shimmer.** Uses Tailwind's `animate-pulse` (opacity fade). | `LoadingSkeleton.tsx` | Pulse signals "broken/old"; shimmer signals "loading premium content". Linear/Stripe use shimmer. |
| **UP-7** | **No generic primitives** — no `<Button>`, `<Input>`, `<Select>`, `<Sheet>`, `<Dialog>` in `components/ui/`. Only domain components (PhoneInput, AgeInput, MultiGoalSelector). | `ls components/ui/` | High duplication; every button is a hand-styled `<button>` with inline styles. Inevitable drift. |
| **UP-8** | **Form errors live in a single bottom block, not inline next to the field.** | `new/page.tsx:364-375`, `MarkPaidSheet` | User has to mentally remap "Phone number is required" to the phone field. |
| **UP-9** | **No empty-state illustrations**, only icon + headline. | `ClientsView`, `InvoicesView` | Acceptable for MVP but reads as "internal tool", not "delightful product". |
| **UP-10** | **Form labels don't focus their inputs on click** (`<label>` wraps content but no `htmlFor` / `id`). | `account/page.tsx`, `clients/new/page.tsx`, `PhoneInput.tsx` | Both an a11y violation *and* a polish miss. |

## 1.4 Accessibility & Enterprise Standards

| # | Gap | Evidence | Why it matters |
| --- | --- | --- | --- |
| **A11Y-1** | **No semantic landmarks.** Entire app is `<div>` soup — no `<main>`, `<nav>`, `<section>`, `<header>`. | repo-wide | Screen-reader users cannot skip navigation, jump between regions. WCAG 2.4.1. |
| **A11Y-2** | **No skip-to-content link.** | repo-wide | Keyboard-only users tab through the entire nav on every page. WCAG 2.4.1. |
| **A11Y-3** | **No focus trap in bottom sheets.** Sheets manually handle Escape, but Tab can escape into the underlying page. | `UserMenuSheet.tsx:22-32` + all sheets | Keyboard users get lost. Stripe/Linear sheets trap focus and return it to the trigger on close. |
| **A11Y-4** | **Form labels lack `htmlFor` → input `id` linking** across most forms. | `account/page.tsx:172, 185`; `clients/new/page.tsx` | Screen readers don't pair the visible label with the input. WCAG 1.3.1. |
| **A11Y-5** | **No `aria-live` on toasts/error blocks.** Sonner may handle this internally; the inline form error block at `new/page.tsx:364-375` does not. | `new/page.tsx:364-375` | A blind user submitting a form has no audible feedback. |
| **A11Y-6** | **`--fd-accent` gold (~3.2:1 vs white) and red-on-pink-tint (`rgba(232,92,106,0.08)` background) likely fail WCAG AA.** | `globals.css`, `InvoicesView.tsx:82-100` | Outstanding-amount text on the pink card may be hard to read. |
| **A11Y-7** | **Schedule-X calendar likely has no keyboard support.** Third-party dependency; not audited. | `components/scheduling/SchedulerXAdapter` | Keyboard users cannot book a session — the app's core action. |
| **A11Y-8** | **No `prefers-reduced-motion` handling.** | repo-wide | WCAG 2.3.3. |
| **A11Y-9** | **No locale / RTL handling.** Currency `$` hardcoded in InvoicesView; no `dir="rtl"`. | `InvoicesView.tsx:59-61` | Lebanon trainer using Arabic — broken. |
| **A11Y-10** | **No global error / not-found tested for screen-reader announcement.** `app/error.tsx` + `app/not-found.tsx` exist (good), but no `aria-live` semantics. | `app/error.tsx`, `app/not-found.tsx` | Standard enterprise security review will flag. |

---

# PART 2 — THE FULL RECOMMENDATION REPORT

Roadmap is sized for two focused engineering weeks, prioritized by impact-per-effort. Every item references a specific file or token so the implementing engineer doesn't need to re-discover anything.

## P0 — Critical for launch / usability (≤ 3 days)

These are concrete bugs and table-stakes. None require architectural change.

| # | Fix | Code-level instruction |
| --- | --- | --- |
| **P0-1** | **Stop iOS input zoom.** | In `app/globals.css:167`, change `.input-base` from `font-size: 0.875rem` to `font-size: 1rem` (16px). Remove the `maximum-scale=1` from the viewport meta in `app/layout.tsx:33` once done — it was a workaround for this. Audit other inputs (PhoneInput.tsx country dropdown filter, date pickers) and set `font-size: 16px` on any focusable input. |
| **P0-2** | **Replace hardcoded `#00C853` with the design token.** | In `app/dashboard/clients/new/page.tsx:382`, swap `style={{ backgroundColor: '#00C853', color: '#0F1117' }}` to use `var(--fd-blue)` + `var(--fd-text-on-primary)`. This restores theme-switching capability and aligns with the documented "Primary CTA / FAB / focus / today → --fd-blue" rule (`globals.css:11`). |
| **P0-3** | **Reconcile Badge variants with the Google-Calendar palette.** | In `components/modules/Badge.tsx:5-18`, replace the stale dark-theme RGBA pairs with token-derived light-theme values. Example: `active` → `bg: 'var(--fd-blue-subtle)' / text: 'var(--fd-blue)'`; `paid` → `bg: '#E6F4EA' / text: 'var(--fd-green)'`; `overdue` → `bg: '#FCE8E6' / text: 'var(--fd-red)'`. Add a `coming-soon` variant now and use it from the BillingSetupSection pill (so the pill stops being inline). |
| **P0-4** | **Add a PWA manifest, icons, and a minimal service worker.** | Create `public/manifest.json` with `name`, `short_name: "FitDesk"`, `start_url: "/dashboard"`, `display: "standalone"`, `theme_color: "#FFFFFF"`, `background_color: "#F8F9FA"`, and icon set (192, 384, 512, maskable). Add `<link rel="manifest" href="/manifest.json" />` and `<link rel="apple-touch-icon" ...>` to `app/layout.tsx:38`. Wire `@ducanh2912/next-pwa` (or `serwist`) with a network-first cache for `/api/*` and a stale-while-revalidate for static assets. |
| **P0-5** | **Wire `htmlFor` → `id` on every form input.** | Sweep `components/clients/BillingSetupSection.tsx` (`FieldLabel`), `components/ui/PhoneInput.tsx`, `AgeInput.tsx`, `account/page.tsx`, `clients/new/page.tsx`. Generate stable IDs (Reach's `useId()` or React 18's `useId`) and bind them. |
| **P0-6** | **Add destructive-action confirmation for sign-out.** | In `app/dashboard/account/page.tsx:267-279`, wrap the sign-out button in a bottom-sheet confirmation (reuse `UserMenuSheet` pattern). Same treatment for delete-client and cancel-session when those exist. |
| **P0-7** | **Add `loading.tsx` to every primary sub-route.** | Create `app/dashboard/clients/loading.tsx`, `…/invoices/loading.tsx`, `…/schedule/loading.tsx`, `…/messages/loading.tsx`, `…/settings/loading.tsx`. Reuse existing `LoadingSkeleton` shapes from `components/modules/LoadingSkeleton.tsx`. |
| **P0-8** | **Fix UTC date display.** | `components/modules/DashboardView.tsx:81-86`: remove the hardcoded `timeZone: 'UTC'`. Use `Intl.DateTimeFormat` with the user's local timezone, plus a relative wrapper (`Today`, `Tomorrow`, `Yesterday`) via `Intl.RelativeTimeFormat` or Luxon (already a dep). Same sweep in `MessagesView`. |
| **P0-9** | **Remove the "search appears at 3 clients" cliff.** | In `components/modules/ClientsView.tsx:101`, render the search input unconditionally. Show a muted empty state when there are no clients. |
| **P0-10** | **Add a forgot-password flow.** | Add `app/auth/forgot-password/page.tsx` and `app/auth/reset-password/[token]/page.tsx`. Better Auth supports password reset; wire its email plugin and add a link from `auth/login/page.tsx`. |

## P1 — Core SaaS standard (~ 1 week)

These bring the product from "competent MVP" to "looks and behaves like SaaS people pay for."

| # | Investment | Code-level instruction |
| --- | --- | --- |
| **P1-1** | **Extract a 6-primitive UI library.** | In `components/ui/`, add `Button.tsx`, `Input.tsx`, `Select.tsx`, `Sheet.tsx`, `Dialog.tsx`, `Tabs.tsx`. Use Radix Primitives (already match shadcn's HSL token system you set up in `globals.css:62-94`). This kills the duplicated `<button>` styling and gives focus management + a11y for free. Migrate `new/page.tsx`, `account/page.tsx`, and one sheet as the pilot. |
| **P1-2** | **Adopt `vaul` for bottom sheets.** | `npm i vaul`. Replace `UserMenuSheet.tsx`, `BookingSheet.tsx`, `SessionDetailsSheet.tsx`, `SelectionTray.tsx`, and `MarkPaidSheet` with `vaul`'s `<Drawer>`. Gives you: drag-to-dismiss, snap points, scroll-aware behavior, focus trap, and a native-feeling spring physics curve — all for ~12kB. |
| **P1-3** | **Add a motion language to Tailwind config.** | In `tailwind.config.ts:61-74`, add `transitionDuration: { fast: '100ms', base: '150ms', slow: '300ms' }` and `transitionTimingFunction: { spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', smooth: 'cubic-bezier(0.16, 1, 0.3, 1)' }`. Then sweep replace ad-hoc `duration-200` etc. Add a global `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` block to `globals.css`. |
| **P1-4** | **Add inline field validation.** | Promote `Field` (currently in `new/page.tsx`) to `components/ui/Field.tsx` with a `error?: string` prop and an `aria-invalid` / `aria-describedby` wire. Replace the bottom-of-form error block on `new/page.tsx`, `account/page.tsx`, and `MarkPaidSheet` with per-field errors. Keep the bottom block as a screen-reader summary (`role="alert" aria-live="assertive"`). |
| **P1-5** | **Add semantic landmarks across all top-level layouts.** | In `components/modules/DashboardClientShell.tsx`, wrap the header in `<header>`, the bottom nav in `<nav aria-label="Primary">`, the content area in `<main id="main">`. In `app/layout.tsx:39`, add a visually-hidden `<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>` at the top of `<body>`. |
| **P1-6** | **Ship dark mode.** | The Tailwind config already declares `darkMode: ['class']`. In `globals.css`, add a `.dark { … }` block that re-maps every `--fd-*` token to a dark-theme value (use the prior dark palette from your Phase 4.x as the starting point). Add a system-preference detector (`useTheme` hook) and a manual toggle in the More sheet. Update `app/layout.tsx:36` `theme-color` to switch via `<meta name="theme-color" content="…" media="(prefers-color-scheme: dark)">`. |
| **P1-7** | **Schedule defaults: week view on mobile, day view on tap.** | In `components/scheduling/` Schedule-X adapter, set `defaultView: viewportWidth < 768 ? 'week' : 'month'`. Add a long-press to open the BookingSheet directly with the slot pre-selected (saves the 2nd-sheet hop). |
| **P1-8** | **Optimistic mutations for mark-paid, complete-session, save-profile.** | Wire `useOptimistic` in the components that call these server actions. Pattern: paint the new state immediately, reconcile on success or rollback + toast on failure. Linear's "feels instant" magic is entirely this. |
| **P1-9** | **Surface revenue-critical signals in the bottom nav.** | Add a small red dot to the "Invoices" tab in `DashboardClientShell.tsx:144-196` when `overdueCount > 0`. Same for "Messages" tab when unread > 0. |
| **P1-10** | **Onboarding "progressive checklist" during provisioning.** | In `components/onboarding/provisioning-status.tsx`, replace the single spinner with a staged checklist: ✓ Account created, ◦ Workspace provisioning, ◦ Seeding default data, ◦ Finalizing. Update as the polling progresses through control-plane job phases. Add an ETA estimate from telemetry of past jobs. |
| **P1-11** | **Replace the URL-only photo input with a file picker.** | `account/page.tsx:142-155` — accept a `File`, upload to ERPNext File DocType (server action), get back a URL, then store. |
| **P1-12** | **Wire inline "Send payment link" from the invoice card.** | In `InvoicesView.tsx:177-194`, the "Send message" button should open a small confirmation sheet ("Send via WhatsApp to {client}?" → Send), not navigate to a separate Messages page. |

## P2 — Elite polish (the "Linear delight" tier, ~ 1 week)

These take the product from "good SaaS" to "people screenshot it for Twitter."

| # | Investment | Code-level instruction |
| --- | --- | --- |
| **P2-1** | **View Transitions API for route changes.** | Wrap `app/layout.tsx` (or a `template.tsx`) with a route-transition. Use the native `document.startViewTransition` (Chrome 111+/Safari 18+) with a fallback. Or add `next-view-transitions`. Pair with `view-transition-name` on the bottom nav so the active pill animates between tabs (the Stripe Atlas signature look). |
| **P2-2** | **Skeleton shimmer instead of pulse.** | In `LoadingSkeleton.tsx`, replace `animate-pulse` with a custom keyframe: linear-gradient sweep from `--fd-border` through `--fd-card-hover` and back, 1.4s ease-in-out infinite. Gives the "premium loading" texture. |
| **P2-3** | **Haptic feedback on key interactions.** | Create `lib/haptics.ts` wrapping `navigator.vibrate(10)` (short tap) and `[10, 30, 10]` (success). Call from: bottom-nav tab change, session complete, mark paid, send message. Gate on `'vibrate' in navigator`. |
| **P2-4** | **Command palette (⌘K / long-press More).** | `npm i cmdk`. Mount under the More sheet with quick actions: "New client", "New invoice", "Log session for…", "Find client…", "Open today's schedule". This is the single biggest power-user signal in modern SaaS. |
| **P2-5** | **Empty-state illustrations.** | Commission a 6-piece illustration set (or generate via your design tool) for: no clients, no sessions today, no invoices, no messages, schedule empty, no goals. Replace the icon-only empties in `ClientsView`, `InvoicesView`, `ScheduleView`, `MessagesView`. |
| **P2-6** | **Pull-to-refresh on list views.** | Add a small `usePullToRefresh` hook (50 lines, no deps) on `ClientsView`, `InvoicesView`, `MessagesView` lists. Trigger the server-action refresh; show a small spinner at the top. |
| **P2-7** | **Swipe-to-archive on invoice and message lists.** | With `vaul` or `framer-motion`'s `useDragControls`, allow horizontal swipe on list rows to reveal "Archive" / "Mark paid" actions. Pair with `P2-3` haptics. |
| **P2-8** | **Backdrop blur on sheets and modals.** | Change sheet overlays from `rgba(0,0,0,0.6)` to `backdrop-filter: blur(8px); background-color: rgba(0,0,0,0.3);`. Modern Safari/Chrome support is fine; degrades gracefully. |
| **P2-9** | **Localization scaffolding.** | Wire `next-intl`. Move hardcoded copy ("Create Client", "Package coming soon", "Outstanding") into a single message catalog. Even shipping only English now sets you up to add Arabic (RTL) and French later — critical for the Lebanon/MENA market the project is targeting. |
| **P2-10** | **`prefers-color-scheme` media-query for the Sonner toast theme.** | `app/layout.tsx:42-43` hardcodes `theme="light"`. After P1-6 ships dark mode, switch to `theme="system"`. |
| **P2-11** | **Replace `<img>` in `account/page.tsx:118` with `<Image>`.** | Caught by lint already. Add `next/image` with `priority` (above the fold) and `placeholder="blur"` if you can derive a small blur data URL. |
| **P2-12** | **Add `aria-live` regions for success toasts and inline errors.** | Even though Sonner is announce-capable, double-check by adding a `role="status" aria-live="polite"` wrapper around inline confirmation messages (e.g., the "Saved" state on `account/page.tsx:240-253`). |

---

## Sequencing recommendation

If this were planned as a single Head-of-Product workstream, ship in three weekly milestones:

| Week | Theme | Outcome |
| --- | --- | --- |
| **1** | All of P0 | "It stops feeling buggy." iOS zoom gone, design tokens consistent, PWA installable, htmlFor wired, sign-out safe, every sub-route has a skeleton, dates show in local time. |
| **2** | P1-1, P1-2, P1-3, P1-4, P1-5, P1-8, P1-9 | "It feels like a real SaaS." Primitive UI library, vaul sheets, motion language, inline validation, semantic landmarks, optimistic mutations, nav badges. |
| **3** | P1-6, P1-7, P1-10, P1-11, P1-12, P2-1, P2-2, P2-3, P2-4 | "People notice." Dark mode, calendar week-view default, progressive onboarding, file-picker upload, inline payment-link send, view-transition tab animation, shimmer skeletons, haptics, command palette. |

P2-5 through P2-12 are the polish backlog you pull from once the above three weeks ship.

---

## Files inspected (audit provenance)

Direct reads:
- `app/layout.tsx`
- `app/globals.css`
- `tailwind.config.ts`
- `components/clients/BillingSetupSection.tsx`
- `components/modules/Badge.tsx`
- `app/dashboard/clients/new/page.tsx`
- `package.json`

Via three parallel Explore agents (mobile-native, design system, flows/a11y):
- All `app/dashboard/**/page.tsx`, `app/auth/**`, `app/onboarding/**`, `app/error.tsx`, `app/not-found.tsx`
- All `components/modules/`, `components/ui/`, `components/scheduling/`, `components/onboarding/`, `components/clients/`
- `middleware.ts`, `next.config.mjs`, `public/`
- Cross-cutting greps for `framer-motion`, `vaul`, `useOptimistic`, `aria-*`, `htmlFor`, `env(safe-area-inset-*)`, `Loader2`, `<img>`, `Coming soon`, `rounded-full`
