# FitDesk Full UI/UX Audit — 2026 SaaS Benchmark

**Audited:** 2026-06-01  
**Branch:** `reconcile/phase1b-secure` (latest committed state)  
**Auditor role:** Senior SaaS UI/UX + mobile product auditor  
**Account used:** `tazuaesa@gmail.com` (live data: 9 clients, 8 invoices, recurring sessions)  
**Viewports tested:** Desktop ~1500px (browser constraint), mobile layout observed via app shell  

---

## 1. Executive Summary

FitDesk has a **strong functional foundation and a clear product identity**. The core architecture is sound: light theme, amber accent, bottom navigation, session calendar, invoice tracking. The scheduling experience (Scheduler-X) is genuinely impressive for a small SaaS. The setup checklist, Today section, and outstanding balance hierarchy are well-conceived.

However, **two P0 bugs make the product unusable for real trainers today**:

1. **Every client detail page returns 404.** Clicking any client in the list goes to `/dashboard/clients/Nour%20Alami` which 404s. The ERP docname ID mismatch means client management is completely inaccessible.
2. **`[object Object]` renders as fitness goals for every client.** The `formatGoal()` utility doesn't handle non-string input from the ERP adapter, so raw JavaScript objects leak into the UI.

Additionally, the onboarding flow has a **stuck/unrecoverable state** (provisioning job lost, no timeout, no retry button visible to user) that would block all new signups.

Fix these three issues and FitDesk is **ready for a controlled pilot with 2–3 trusted trainers**. The visual design and UX structure are polished enough that trainers who see a working build will feel they are using a premium tool.

### Biggest Strengths
- Premium, calm visual system (amber accent, light surfaces, rounded sheets)
- Scheduler-X integration with color-coded client sessions is genuinely differentiated
- New Client form with emoji goal chips feels modern and fast
- Session "Today" section on dashboard gives trainers immediate operational clarity
- Sheet chrome (scrim, radius, tap targets) is well-executed
- Invoice filter tabs with badge counts are clear and correct
- 404 error page is styled and branded (not a raw Next.js error)

### Biggest Risks
- **P0 client navigation breakage** will cause immediate churn in pilot
- **`[object Object]` data leak** destroys trust immediately for anyone who has stored goals
- **Onboarding stuck state** means new user activation fails silently
- **WhatsApp setup page** is so bare it creates confusion rather than activation
- **Session display in Today** shows rate as plain number without currency — ambiguous

### Top 5 Fixes Before Pilot

| Priority | Fix |
|---|---|
| 1 | Fix client detail 404 — align client ID in URL with ERP docname |
| 2 | Fix `[object Object]` in client goals — ensure ERP adapter returns `string`, not object |
| 3 | Fix onboarding stuck state — add timeout detection + retry button after 3 min |
| 4 | Add currency symbol to session rate in Today and schedule blocks |
| 5 | Expand WhatsApp setup page with minimal setup steps and value copy |

---

## 2. Product Readiness Scorecard

| Area | Score | Notes |
|---|---|---|
| **Dashboard clarity** | 7/10 | Good hierarchy; revenue hero confusing ($0 month when 7 paid invoices exist); session rate display ambiguous |
| **Mobile usability** | 6/10 | Shell and bottom nav are solid; viewport couldn't be tested at true 390px; client navigation broken |
| **Scheduling UX** | 8/10 | Scheduler-X is excellent; color-coded sessions; Book session CTA; Day view auto-scroll works |
| **Client management UX** | 2/10 | All client detail links return 404; `[object Object]` goals; only list view works |
| **Invoice/payment UX** | 6/10 | Tab filters + badge counts are good; "To collect" default is correct; no individual invoice detail page apparent |
| **Onboarding activation** | 3/10 | 3-step flow is clear; stuck state on provisioning failure with no recovery; no escape hatch |
| **Navigation** | 8/10 | 4+More bottom nav is focused; WhatsApp correctly moved to More; active states clear |
| **Visual polish** | 8/10 | Light theme, amber accent, sheet chrome all excellent; avatar hydration flicker; small text on schedule blocks |
| **Trust/professional feel** | 6/10 | Strong visual identity undercut by `[object Object]` data leaks and 404 pages |
| **Conversion / pilot readiness** | 4/10 | Not pilot-ready due to P0 bugs; becomes 8/10 after P0 fixes |

**Overall pilot readiness: 4/10 now → 8/10 after P0+P1 fixes**

---

## 3. User Journey Audit

### 3.1 Login

**What works:**
- Clean, centered card on light background
- FitDesk wordmark in amber — on-brand
- Google SSO option
- Smooth redirect to dashboard on success

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| L-01 | No "Forgot password" link visible | P2 |
| L-02 | Email field does not auto-focus on page load — trainer must tap before typing | P2 |
| L-03 | No visible error message when incorrect password entered (may be present but not captured) | P2 |
| L-04 | Browser auto-fill can conflict with `form_input` — needs testing on real mobile | P2 |

---

### 3.2 Dashboard

**What works:**
- "Good afternoon, YASSER" greeting with correct time-of-day
- YZ avatar from user name initials
- Setup checklist (3/6 done) is the right activation mechanic for new trainers
- "Needs Attention" panel with Outstanding payments + Follow-ups needed
- Quick Actions (Schedule, Add Client, Send Reminder) in 3-column grid
- "Today" section with 5 sessions — this is the right first visual priority
- "Upcoming" correctly shows tomorrow's sessions without duplicating today

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| D-01 | Revenue hero shows "This Month: $0" despite 7 paid invoices ($210 collected per invoice page) — either the monthly revenue calculation filters wrong month or there's a data sync issue | P1 |
| D-02 | Session cards in Today show `"09:00 · 30"` — the "30" is the session rate (USD) but shows without "$" sign or "min" label — completely ambiguous to a trainer | P1 |
| D-03 | "0 of 20 sessions completed this week" — 20 is the WEEKLY_SESSION_GOAL constant hardcoded; unrealistic for a solo PT; should be configurable or removed | P2 |
| D-04 | "Outstanding payments: All caught up" shown in Needs Attention even though 1 invoice is Preparing — the distinction between "outstanding" and "preparing" is invisible here | P2 |
| D-05 | Avatar shows "TR" (fallback placeholder) briefly before hydrating to "YZ" — visible flicker on page load | P2 |
| D-06 | Setup checklist stays visible even after workspace is fully operational (3 items remaining); no "dismiss" option for trainers who don't want WhatsApp or alternate payment methods | P3 |
| D-07 | "Follow-ups needed: 5 sessions to review" is vague — what does "review" mean? Trainers don't know what action to take | P2 |
| D-08 | Quick action "Send Reminder" links to `/dashboard/messages` which is a general route, not a targeted reminder flow | P2 |
| D-09 | Stats row (This Month / Outstanding / Clients) all showing $0 / $0 / 5 — no currency label on client count is fine, but revenue showing $0 contradicts the invoice data | P1 (see D-01) |
| D-10 | Session cards in Today section are clickable (link to /dashboard/schedule) but there's no visible affordance (no chevron, no arrow) — trainers won't know they're interactive | P2 |

---

### 3.3 Clients List

**What works:**
- Search by name, phone, goal works (text-level)
- Avatar initials with color-coded background look great
- Package type badge (Per Session) is clearly visible
- "Add" button prominent and accessible
- 9 clients load quickly

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| C-01 | **`[object Object]` for all client fitness goals** — ERP adapter returns a JavaScript object; `formatGoal()` receives non-string input. Every client card shows this raw data leak | P0 |
| C-02 | **Client cards link to 404** — `/dashboard/clients/[name]` URL format doesn't match what the detail page's `getClientById()` can resolve from ERPNext | P0 |
| C-03 | No status indicator on client cards (active, inactive, needs renewal) — trainer can't quickly see which clients are active | P2 |
| C-04 | No remaining sessions count visible on cards — a critical operational metric for package clients | P1 |
| C-05 | Phone number shows without formatting — "+96176888999" should be "+961 76 888 999" for readability | P3 |
| C-06 | Scrollbar on right side (desktop) bleeds into the mobile-constrained layout area — minor visual | P3 |

---

### 3.4 Client Detail

**What works:**
- 404 page is styled and branded — recovery link "Go to dashboard" is present
- The 404 doesn't show a raw technical error

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| CD-01 | **All client detail pages return 404** — complete flow breakage | P0 |
| CD-02 | When/if fixed: client detail should show package balance remaining prominently | P1 |
| CD-03 | "Send WhatsApp" button on client detail depends on WhatsApp being connected — if not connected, button should gray out or show connection prompt | P2 |

---

### 3.5 Add / Edit Client

**What works:**
- Emoji goal chip selection (🔥 Fat Loss, 🏋️ Muscle Gain, 💪 Strength, 🦵 Mobility, 🦾 Rehabilitation, ⚡ Conditioning) is excellent UX — visual, fast, delightful
- Country code phone picker (+961 LB) with flag
- "Available on WhatsApp" toggle with explanation
- Avatar preview with "Add photo" affordance
- Age field (optional, unobtrusive)
- Back navigation works

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| AC-01 | **Typo**: "Used to send paymont links via WhatsApp" — should be "payment" | P2 |
| AC-02 | No "billing mode" selector on new client form (Pay Per Session / Package / Trial) — trainer must go elsewhere to set this | P1 |
| AC-03 | No "session rate" field on new client form — trainer will have to set this later for each session | P1 |
| AC-04 | Photo upload shows "Add photo" but if it's decorative/not functional in MVP, should be hidden or clearly marked | P3 |
| AC-05 | After saving a new client, where does the trainer go? No clear success feedback or next action (book first session?) | P2 |

---

### 3.6 Schedule — Day / Week / Month

**What works:**
- Google Calendar visual style is immediately familiar and trusted
- Color-coded sessions by client (teal = Nour, blue = Hala, yellow = Rami) — excellent pattern recognition
- Auto-scroll to current time on Day view
- "Book session" CTA in header (desktop)
- Today date highlighted with blue circle
- View switcher (Week/Day/Month) works

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| S-01 | Session blocks show very small text at desktop zoom — client name barely readable in week 7-column view | P2 |
| S-02 | "TR" avatar placeholder (not "YZ") appears on Schedule page header — hydration race condition | P2 |
| S-03 | "Planner" label next to FitDesk brand in schedule header is confusing — trainers may not understand what "Planner" means | P2 |
| S-04 | No visual difference between scheduled and confirmed sessions — both show as colored blocks | P2 |
| S-05 | Session rate not shown on block in week view — trainer can't quickly see revenue from a day at a glance | P2 |
| S-06 | No FAB (floating action button) visible on the schedule screenshot — may have been cropped; if absent, booking requires going to header CTA | P2 |
| S-07 | Session click doesn't show a visible action affordance — trainer doesn't know tapping a block opens details | P2 |
| S-08 | Desktop month view "overflow" sessions (`+ 1 event`) hides bookings — trainer could miss sessions on busy days | P2 |

---

### 3.7 Invoices

**What works:**
- "8 invoices" count with "Collected $210" summary card (green, prominent) — excellent
- Filter tabs: To collect / Preparing 1 / Paid 7 / All 8 — badge counts are accurate and useful
- Default to "To collect" is the right business-first choice
- Empty state copy on "To collect": "Nothing to collect right now. You have invoices still preparing. Open Preparing to review them." — contextual and actionable
- Tab pill design is clean

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| I-01 | "Collected $210" shows on the summary even when "To collect" is empty — slightly misleading (is this month's? all-time?) — needs "This month" label | P2 |
| I-02 | No individual invoice detail page discoverable — no way to see full invoice breakdown, line items, or issue date from the list | P1 |
| I-03 | "Record Payment" button appears to float even on an empty "To collect" state — purpose unclear without an invoice selected | P2 |
| I-04 | "Preparing" invoices need a one-tap "Send / Finalize" action visible from the list — trainer shouldn't need to dig | P1 |
| I-05 | No "Create invoice" / "New invoice" button on the invoices screen — trainer must know to go to a client detail page (which is broken) | P1 |
| I-06 | Invoice items/amounts visible in "All" tab but no way to see the actual invoice PDF or formatted view | P2 |

---

### 3.8 WhatsApp Setup

**What works:**
- Accessible via More → WhatsApp Setup (correct placement)
- Status clearly shows "Not connected"
- Single clear CTA "Connect WhatsApp"

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| W-01 | Page is completely empty except a status chip and one button — no explanation of what WhatsApp connection does, why it's valuable, what the trainer's number will be used for | P1 |
| W-02 | No setup steps (scan QR code? enter number? select instance?) — trainer has no idea what will happen when they click "Connect WhatsApp" | P1 |
| W-03 | No WhatsApp number pre-filled from account settings — trainer enters phone number in account settings but the WhatsApp page shows nothing | P2 |
| W-04 | No connection status history or last-connected timestamp | P3 |

---

### 3.9 Account Settings

**What works:**
- YZ avatar with camera/edit icon affordance
- Full name, email, phone, currency, business name fields
- Email change via "Contact support" — acceptable for MVP
- Phone number pre-filled from registration
- Currency selection

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| AS-01 | No "Save Changes" button visible in the portion captured — may be below fold; trainer unclear when changes auto-save vs. need to submit | P1 |
| AS-02 | Email change requires contacting support — poor UX but acceptable for MVP; should have inline copy explaining this | P2 |
| AS-03 | "Business / Studio name" partially visible — what does changing this affect? (Invoices? Onboarding? No explanation) | P2 |

---

### 3.10 Onboarding

**What works:**
- Step 1 of 3 collects name, business name, country, currency — all relevant
- Step 2 "Preparing your workspace" with spinner is clear about what's happening
- Progress dots (●●○) give a sense of completion

**Issues:**
| ID | Issue | Severity |
|---|---|---|
| ON-01 | **Stuck state: "Preparing your workspace — CURRENT STEP: QUEUED" persists indefinitely if provisioning job fails** — user is completely trapped with no timeout, no retry button, no support link | P0 |
| ON-02 | The provisioning status polling returns `{"error":"Provisioning job not found"}` after a failure but UI just keeps spinning — raw error not surfaced to user | P0 |
| ON-03 | No escape hatch — user cannot go back to step 1, contact support, or sign out during the preparation step | P1 |
| ON-04 | "This usually takes 1–2 minutes" copy is shown but there's no indication of actual time elapsed | P2 |
| ON-05 | Step 3 (unknown) not reached due to stuck state — cannot audit | — |

---

## 4. Mobile-First Audit

**Note:** The browser window minimum size prevented true 390px viewport testing. The following is based on the mobile app shell visible at desktop width (480px max-width constrained shell) plus code analysis.

### What's confirmed working at mobile shell width (480px max):
- Bottom navigation (Home/Clients/Schedule/Invoices/More) — 5 items, `h-16` nav bar, adequate tap area
- Header with FITDESK wordmark + title + avatar — `h-14`
- Session cards in Today section — full width, readable
- Setup checklist — scrolls vertically
- Invoice filter pill tabs — all 4 visible in a row without overflow

### Mobile concerns (code + visual inference):
| ID | Issue | Severity |
|---|---|---|
| M-01 | `"0 of 20 sessions completed this week"` in quick actions — 20 is unrealistic for a solo mobile PT and may read as a broken metric | P2 |
| M-02 | Quick actions 3-column grid (`min-h-[92px]`) — tight at 390px; "Send Reminder" action misleadingly links to all messages, not a specific reminder flow | P2 |
| M-03 | Clients search bar appears above all clients — takes up vertical space on first load before trainer needs it | P3 |
| M-04 | Schedule page bypasses the mobile shell entirely (full-width route) — no bottom nav visible in Planner, correct per design, but trainer must use browser back | P2 |
| M-05 | Session details sheet and BookingSheet not tested due to client 404 preventing access to session flows | — |
| M-06 | Dashboard horizontal scroll not confirmed: "Today" sessions > 4 items may push content far below fold requiring significant scrolling | P2 |

---

## 5. Dashboard 2026 Best-Practice Gap Analysis

### Information Hierarchy Assessment

The current dashboard order:
1. Greeting + date
2. Setup checklist (always at top until dismissed)
3. Revenue hero ($0 / "You're on track this month")
4. Needs Attention panel
5. Quick Actions (Schedule / Add Client / Send Reminder)
6. Stats mini-row (This Month / Outstanding / Clients)
7. Today section (5 sessions)
8. Upcoming section (3 sessions tomorrow)

**Recommended 2026 order for an active trainer:**
1. Greeting
2. **Today** (operational urgency — "what must I do in the next 8 hours")
3. **Money to collect** (if outstanding > 0) or **This Month revenue** (if all caught up)
4. **Needs Attention** (follow-ups, renewals)
5. Quick Actions
6. **Setup checklist** (demoted once 3+ items done — it's a distraction after activation)
7. Upcoming

**Gap**: Today section is currently position #7. For an active trainer opening the app between sessions, their most urgent question is "Who do I see next and when?" — this should be above the revenue hero.

### Empty States
| State | Current | Best Practice | Gap |
|---|---|---|---|
| To collect = $0 | "Nothing to collect right now" ✅ | contextual hint | Good |
| Today = no sessions | Not tested | "Rest day" or "No sessions today — schedule one" | Unknown |
| No clients | "No clients yet" with CTA | ✅ Confirmed working | Good |
| Invoices Paid tab | Shows list | — | Fine |
| WhatsApp not connected | Status chip | Steps + value prop | Bare |

### Money Visibility
- **Outstanding balance** becomes dominant card (featured, amber) only when > 0 ✅ — excellent decision
- **Collected $210** on invoices page is the right framing ✅
- **"This Month: $0"** on dashboard hero contradicts the $210 data — broken calculation is damaging trust

---

## 6. Scheduling UX Audit

### Day View (single-column time grid)
- **Session blocks**: ~120–140px per hour, full column width — comfortable readability
- **Session card content**: initials chip + client name + time range — correct information density
- **Auto-scroll**: scrolls to current time − 60min on Today, first session − 60min on other days — smart
- **Day boundary**: 09:00–21:00 — appropriate for personal training
- **Color coding per client**: teal (Nour), blue/purple (Hala), yellow/cream (Rami) — excellent pattern recognition, no visible legend needed after first use

### Week View (7-column time grid on desktop)
- Very dense at desktop width — text in blocks is barely readable without zoom
- Color pattern helps navigation when text is small
- Mobile uses `week-agenda` (list) — correct decision

### Booking Flow (BookingSheet)
*Could not test due to client 404 preventing session creation from client detail.*
From code audit: BookingSheet has the correct components (client selector, date/time picker, duration, rate, session type).

### Session Actions
- Complete session → billing hook (pay-per-session creates invoice) ✅
- Cancel → status = cancelled ✅
- No-show → status = no_show ✅
- Reschedule → updateSession with new time ✅
*Could not visually test these flows in this audit.*

---

## 7. Client + Invoice UX Audit

### Client Package Balance Visibility
- **Not visible on client list** — package clients with 1–3 sessions remaining should have a warning badge
- **findLowBalanceClients()** is implemented and surfaces to dashboard "Needs Attention" — good
- **remainingSessions** field exists in the Client type — just needs surfacing on the list card

### Invoice Payment Clarity
- **"Collected $210"** summary is correct and prominent ✅
- **Filter tabs** with badge counts are the right pattern ✅
- **Individual invoice actions** (mark paid, send reminder) appear on the `All` tab cards — the flow is: choose invoice → MarkPaidSheet → enter amount + method → confirm ✅
- **Missing**: No "Send invoice to client" action — trainers need to share an invoice link or PDF

### Reminder Flow
- Dashboard "Send Reminder" → `/dashboard/messages` (general) — should link to specific client message with invoice pre-filled
- Invoice list "Send" button → `/dashboard/messages/[clientId]` — correct destination but requires WhatsApp to be connected

---

## 8. Visual Design / Premium Feel Audit

### Typography
| Element | Current | Assessment |
|---|---|---|
| Greeting | `text-xl font-bold` | ✅ Appropriate hero weight |
| Section headers | `text-sm font-semibold` | ✅ Clean hierarchy |
| Client name in card | `text-sm font-semibold` | ✅ |
| Phone/meta | `text-xs` | ✅ Correct demotion |
| Setup checklist items | `text-sm` | ✅ |
| Session time in Today | `text-xs` | ⚠️ Small for operational urgency |

### Color System
- Amber accent (`--fd-accent`) used consistently for CTA, active nav, highlights ✅
- Blue used for Google SSO button and "Book session" CTA — inconsistency (accent should be amber)
- Red for overdue/outstanding — correct semantic use ✅
- Green (`--fd-green`) for WhatsApp actions — appropriate association ✅
- Card backgrounds and surface separation are subtle but sufficient ✅

### Spacing and Cards
- Cards use `rounded-2xl` consistently — premium feel ✅
- `space-y-5 p-4` on dashboard — comfortable breathing room ✅
- Bottom safe-area insets handled (`env(safe-area-inset-bottom)`) ✅

### Sheet Chrome
- Scrim: `backdrop-blur-[2px]` + `rgba(15,23,42,0.55)` — polished ✅
- Corner radius: `rounded-t-[28px]` — modern and consistent ✅
- Close buttons: `h-11 w-11` — meets 44px minimum ✅
- Drag handle present ✅

### Navigation
- Bottom nav 4+More is correct for the screen count ✅
- Active states use accent color + bold stroke weight ✅
- Schedule page uses full-width chrome (no bottom nav) — correct for calendar UX ✅
- `h-16` nav bar with `py-2` items — adequate touch area ✅

### Issues
| ID | Issue | Severity |
|---|---|---|
| V-01 | "Book session" button on Schedule page header uses blue — should use `--fd-blue` or amber to match brand | P3 |
| V-02 | FITDESK all-caps wordmark in header changes to "Planner" label on schedule page — inconsistent branding | P2 |
| V-03 | Avatar hydration flicker (TR → YZ) visible on multiple page transitions | P2 |
| V-04 | Desktop layout shows a browser scrollbar to the right of the mobile shell — looks unfinished at desktop widths above 480px | P2 |
| V-05 | No favicon or app icon visible in browser tab (may be present, not confirmed) | P3 |
| V-06 | `text-xs` session time labels on the dashboard Today cards are too small for at-a-glance reading during an actual training day | P2 |

---

## 9. Accessibility / Usability Audit

### Tap Targets
| Element | Size | Pass? |
|---|---|---|
| Bottom nav items | Full flex-1 col × h-16 | ✅ |
| Close buttons (sheets) | h-11 w-11 (44px) | ✅ |
| Avatar button (header) | h-10 w-10 (40px) | ⚠️ Just under 44px minimum |
| Goal chips (new client) | min ~44px height | ✅ |
| Invoice filter pills | py-1.5 px-3.5 | ⚠️ Height may be 34–36px |
| "Add" button (clients) | h-8 py-1.5 | ⚠️ Small for primary action |

### Contrast
- Amber on white background: `#E8C547` on `#FFFFFF` — **likely fails WCAG AA** (contrast ratio ~2.5:1 for text)
- Dark text on light surface: ✅
- Muted text (`--fd-muted`) on surface — adequate for supplementary info
- Badge text in pill tabs needs verification

### Labels and ARIA
- `aria-label="Open account menu"` on avatar button ✅
- `role="dialog" aria-modal="true"` on sheets ✅
- `aria-label="Close menu"` on close buttons ✅
- Input labels present on all forms confirmed in code ✅

### Focus and Keyboard
- Escape key closes sheets ✅
- Focus management in sign-out confirmation sheet ✅
- Form navigation (tab between fields) — not tested live

### Loading States
- Dashboard shows skeleton or live data (no loading skeleton visible in capture — ERP loaded fast)
- Edit client page shows 4 skeleton shimmer cards while loading ✅
- No explicit global loading indicator

### Error States
- 404 page styled with "Go to dashboard" CTA ✅
- Form validation errors shown in red text ✅
- Toast notifications for actions (from Sonner) ✅
- Raw API errors sometimes exposed (provisioning "Provisioning job not found" JSON shown raw in browser) — P1

---

## 10. Prioritized Fix Roadmap

### MVP / Pilot-Safe Now

These fixes are required before showing FitDesk to any pilot trainer.

| Priority | Fix | Files | Effort |
|---|---|---|---|
| P0-1 | Fix client 404 — investigate actual ERPNext Customer docname format returned by adapter; align `client.id` with what the detail page can query | `lib/business-data/erp-adapter.ts`, `components/modules/ClientsView.tsx`, `app/dashboard/clients/[id]/page.tsx` | S |
| P0-2 | Fix `[object Object]` — ensure ERP adapter normalizes `custom_fitness_goals` to string before returning; add type guard in `formatGoal()` to handle non-string input | `lib/business-data/erp-adapter.ts`, `lib/format/goal.ts` | S |
| P0-3 | Fix onboarding stuck state — detect provisioning job failure after 3 min timeout; show error state with retry button + support link | `app/onboarding/page.tsx` or the WorkspaceProvisioning polling component | M |
| P1-1 | Fix session rate display — add `$` currency prefix to rate shown in Today cards and session blocks | `components/modules/DashboardView.tsx`, `components/scheduling/SessionCard.tsx` | XS |
| P1-2 | Fix revenue hero — investigate why monthly revenue shows $0 when 7 invoices are paid; check `monthlyRevenue` calculation and date range | `app/dashboard/page.tsx`, `lib/dashboard/metrics.ts` | S |
| P1-3 | Add billing mode + rate to new client form | `app/dashboard/clients/new/page.tsx` | M |
| P1-4 | Add "Create Invoice" entry point from invoices list (not just from client detail) | `components/modules/InvoicesView.tsx` | S |
| P1-5 | Expand WhatsApp setup page — add setup steps, value copy, phone pre-fill from account | `components/modules/WhatsAppView.tsx` | M |
| P1-6 | Fix typo "paymont" → "payment" on new client form | `app/dashboard/clients/new/page.tsx` | XS |

---

### Production-Hardening Soon

These fix real gaps that would hurt a trainer's daily use within the first week.

| Priority | Fix | Notes |
|---|---|---|
| P2-1 | Add "remaining sessions" badge to client list cards | Uses `client.remainingSessions` already fetched |
| P2-2 | Show package balance prominently on client detail | After P0-1 is fixed |
| P2-3 | Dashboard "Follow-ups needed" — clarify what action is needed (complete session, mark no-show?) | Copy change + link target |
| P2-4 | Replace "0 of 20 sessions completed this week" hardcoded goal with actual week count only | Remove the `/20` or make configurable |
| P2-5 | Re-order dashboard: Today → Money → Needs Attention → Quick Actions → Checklist | DashboardView.tsx reorder |
| P2-6 | Fix avatar hydration flicker — pre-render initials server-side or show nothing until ready | DashboardClientShell.tsx |
| P2-7 | Amber on white — replace or darken accent text uses to meet WCAG AA contrast | Global CSS token audit |
| P2-8 | Add "next action" affordance to Today session cards (chevron or tap indicator) | DashboardView.tsx |
| P2-9 | Add invoice count to client detail (after P0-1 fix) | Already in page, verify display |
| P2-10 | Add account save button clearly visible (verify auto-save vs. form submit) | account/page.tsx |

---

### Future Platform / Architecture Later

| Fix | Notes |
|---|---|
| B4 Scheduler-X mobile density | Awaiting 390px screenshots; Day view likely fine |
| Notification system | Push notifications for session reminders, payment received |
| Offline support / PWA shell | Trainer on gym floor with spotty signal |
| Invoice PDF generation | "Send invoice" WhatsApp link with hosted PDF |
| Calendar sync (Google/Apple) | Critical for trainer adoption |
| Session history on client detail | Show completed + cancelled history |
| Package management UI | Buy/assign packages, track credits |
| Email notifications | Invoice overdue, session reminder |
| Multi-trainer support (future) | Architecture decision deferred |

---

## 11. Exact Implementation Backlog

### Immediate (P0/P1) — Required for pilot

| ID | Title | Sev | Screen/File | User Impact | Fix | Risk |
|---|---|---|---|---|---|---|
| BL-01 | Client detail 404 | P0 | `erp-adapter.ts`, `ClientsView.tsx` | All client navigation broken | Inspect actual ERPNext Customer docname format; ensure `client.id` returned by adapter matches docname | Low — data read only |
| BL-02 | [object Object] goals | P0 | `erp-adapter.ts`, `goal.ts` | All client cards show raw JS objects | Add `typeof goal === 'string' ? goal : String(goal)` guard before formatGoal, or fix adapter to always serialize strings | Low |
| BL-03 | Onboarding stuck | P0 | `app/onboarding/` | New user activation fails silently | Add 3-min timeout; show "Taking longer than expected" + retry + support link | Low |
| BL-04 | Session rate no $ | P1 | `DashboardView.tsx`, `SessionCard.tsx` | Trainer sees "09:00 · 30" not "$30" | Add `${session.currency ?? '$'}${session.rate}` or just `$${rate}` | XS |
| BL-05 | Monthly revenue $0 | P1 | `app/dashboard/page.tsx` | Revenue hero wrong; damages trust | Debug `monthlyRevenue` calculation; check if invoice `issuedAt` date range is correct | S |
| BL-06 | Billing mode on new client | P1 | `app/dashboard/clients/new/` | Trainer can't set billing until editing | Add billing mode + rate fields to new client form | M |
| BL-07 | Create invoice entry point | P1 | `InvoicesView.tsx` | No way to create invoice from invoice list | Add "+ Invoice" button in invoices header linking to `/dashboard/invoices/new` | XS |
| BL-08 | WhatsApp setup bare | P1 | `WhatsAppView.tsx` | No guidance on what WhatsApp connection does | Add 3-step explanation, value prop copy, pre-fill phone from account | M |
| BL-09 | Typo "paymont" | P1 | `app/dashboard/clients/new/` | Unprofessional | Fix spelling | XS |
| BL-10 | Remaining sessions on client card | P1 | `ClientsView.tsx` | Can't see package clients at risk | Show `remainingSessions` badge on card if package client with ≤ 5 remaining | XS |

---

## 12. What Not To Change

These are working well and should not be touched:

| Area | Notes |
|---|---|
| **Sheet chrome** (scrim, radius, close button, scroll lock) | Fully consistent across all 5 sheets after recent commits |
| **Session ownership security gate** | H5 ownership check is correct and complete |
| **Bottom navigation structure** | 4+More is the right focus — WhatsApp correctly moved to More |
| **Scheduler-X color coding** | Client-keyed colors are excellent UX |
| **Today section concept** | The B1 decision to give today its own section is correct |
| **Outstanding balance dominant card** | B2 implementation is exactly right — calm urgency, amber, featured |
| **Invoice tab filters** | "To collect" default + badge counts are good |
| **New client goal chips** | Emoji goal chips are premium and delightful |
| **404 error page** | Styled, branded, has recovery CTA |
| **Billing hooks** | Pay-per-session → invoice, Trial → no charge logic must not change |
| **`encodeURIComponent` on URLs** | Keep all URL encoding fixes from A3 |

---

## 13. Final Recommendation

### Is FitDesk ready for pilot after the current branch merge?

**Not yet — blocked by 3 P0 issues:**

1. **Client detail 404** — the most visible product failure. Any pilot trainer who tries to view a client's detail or history hits an error page. This is immediate credibility destruction.
2. **`[object Object]` in client goals** — visible the moment a trainer opens the clients list. Trainers will think the app is broken.
3. **Onboarding stuck state** — any new pilot trainer who signs up and hits a provisioning hiccup gets permanently stuck with no recovery path.

### What "pilot-ready" looks like after fixes:

After the 3 P0 fixes and the 5 highest P1 items (BL-04 through BL-08):

- A trainer can **log in, see their dashboard with today's sessions**
- They can **navigate to clients, view client details, see session history**
- They can **create and complete sessions** with correct billing
- They can **track invoices and record payments**
- They can **understand what WhatsApp connection does and attempt to connect**
- The numbers shown (revenue, session counts) match reality

At that point FitDesk is ready for a **2–3 trainer controlled pilot** with the explicit understanding that:
- WhatsApp messaging may need support to connect
- Invoice creation from client detail is the primary path
- Package management is limited (Pay Per Session works, Package billing deferred)

**Estimated time to pilot-ready:** P0 fixes likely 1–2 days engineering. P1 polish another 1–2 days. Total: **3–4 days focused work**.

The product is fundamentally sound. The visual design is genuinely premium. The scheduling experience is differentiated. FitDesk is 3–4 focused days of fixing from being a product a trainer would trust.

---

*Report generated: 2026-06-01. No code was changed during this audit.*
