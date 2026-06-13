# FitDesk Dashboard — Command Center Visual Blueprint 2026

**Document type:** Visual / UX Blueprint (design specification, no code)
**Status:** Draft for Approval — v2 (QA fixes applied 2026-06-13)
**Source of truth:** [`FITDESK_DASHBOARD_COMMAND_CENTER_V1_1.md`](./FITDESK_DASHBOARD_COMMAND_CENTER_V1_1.md) (Approved)
**Owner:** FitDesk Product
**Date:** 2026-06-13
**Scope:** Trainer Command Center dashboard — desktop + mobile visual layout, component inventory, interaction flows, density rules, and phased delivery.

> This document is a **visual blueprint only**. It does not implement code, modify React components, change Tailwind, alter the ERP/Frappe backend, or redesign `client_index`, Client Hub, or the Action Queue backend. It describes *what the screen should look like and how it should behave*, anchored to the existing FitDesk architecture.

---

## 1. Executive Summary

FitDesk's dashboard is the **Trainer Command Center** — the first screen a trainer opens to run their coaching business. It is not an analytics dashboard and not a reporting screen. Its single job is to answer one question instantly:

> **"What do I need to do right now to run my coaching business?"**

The v1.1 plan is approved. This blueprint translates that plan into concrete, build-ready visual layouts for **two real form factors**:

- **Mobile (primary):** a single calm vertical column with a Floating Action Button. This already exists today as a `480px` shell and is extended, not replaced.
- **Desktop (real desktop layout):** a genuine three-pane workspace — **Sidebar + Main Workspace + AI Rail** — *not* a stretched mobile column. This is **net-new**; today the dashboard renders a centered `max-w-[480px]` column on desktop, which this blueprint explicitly replaces.

The fixed information architecture, top to bottom, is:

```
Daily Brief → Needs Attention → Today Timeline → AI Copilot → Business Health → Client Pulse → Quick Actions
```

Two product rules anchor everything:

1. **Needs Attention is transactional and urgent** (do it now). **Client Pulse is strategic and awareness-focused** (no immediate action required). They never blur together, and Needs Attention always sits **above** AI.
2. **AI is a Copilot, not a Chatbot.** It surfaces suggestions; the trainer always decides and confirms. No autonomous sends, no unreviewed financial actions.

**What is real today vs. new:** The mobile shell, `TodayHero`, `NextUpCard`, `MoneySnapshot`, `ActionCenter`, `TodayTimeline`, `UpcomingList`, and `QuickActions` already exist. The desktop three-pane layout, the AI Copilot rail, and Client Pulse are **new**. Expanding what appears in Needs Attention (today the derive layer only produces `overdue_invoice` attention items) is an **app-layer change to `lib/dashboard/derive.ts`**, not a backend or ERP redesign.

---

## 2. Product Mission

**Mission:** Give a personal trainer a single calm surface that tells them, the moment they open it, exactly what to do next to keep their business running — sessions resolved, money collected, clients followed up — with AI quietly removing busywork and the trainer always in control.

**The dashboard is:**

- **Action-first** — actions appear before metrics.
- **Workflow-first** — every item leads to a complete, finishable task.
- **Trainer-first** — written in the trainer's language, not ERP/accounting language.
- **Mobile-first** — designed for a phone in one hand between sessions.
- **AI-assisted** — AI suggests; the trainer decides.
- **ERP-authoritative** — ERPNext/Frappe remains the system of record; the dashboard reads and triggers, it never owns financial truth.

**The dashboard is NOT:**

- A reporting or BI screen.
- A dense admin table.
- An autonomous agent that sends messages or moves money on its own.
- A place that duplicates or owns financial data outside ERP.

**Success means a trainer immediately knows:**

1. What requires attention right now.
2. What sessions happened (and what they owe a decision on).
3. What money needs collecting.
4. Which clients need follow-up.
5. What the single best next action is.

---

## 3. Information Architecture

### 3.1 Canonical section order (locked)

The vertical priority order is identical on mobile and desktop. It is **not** reorderable, because the order encodes the product's value hierarchy (urgent transactional work first, strategic awareness later, tools last).

```
1. Daily Brief        — orientation: who you are, what today holds, one headline
2. Needs Attention    — URGENT, transactional, action-required-now
3. Today Timeline     — what is happening today (upcoming / live / recently ended / empty)
4. AI Copilot         — assistive suggestions; trainer confirms each one
5. Business Health    — calm KPIs (awareness, not action)
6. Client Pulse       — STRATEGIC, awareness, follow-up-soon (not urgent)
7. Quick Actions      — tools / create flows (desktop bar + mobile FAB)
```

**Invariant:** Needs Attention is always above AI Copilot. AI never outranks a real transactional obligation.

### 3.2 Needs Attention vs. Client Pulse (the hard boundary)

| Dimension | **Needs Attention** | **Client Pulse** |
|---|---|---|
| Nature | Transactional | Strategic |
| Urgency | Now | Soon / ongoing |
| Trainer feeling | "I must resolve this" | "Good to know, I'll get to it" |
| Examples | Session outcome to record, client reply waiting, overdue invoice, missing next session | Onboarding incomplete, missing goals, no active program, retention risk |
| Visual weight | High contrast, accent borders, counts | Calm, muted, low contrast |
| Empty state | Celebrated ("Inbox Zero") | Simply hidden / quiet |

### 3.3 Desktop layout — three real panes

Desktop is a **workspace**, not a centered phone. Three persistent regions:

```
┌──────────┬──────────────────────────────────────────────┬───────────────────┐
│ SIDEBAR  │              MAIN WORKSPACE                    │     AI RAIL       │
│ (nav)    │  (the 7-section command center scrolls here)   │  (AI Copilot)     │
│ ~240px   │              fluid, max ~880px content          │     ~320px        │
└──────────┴──────────────────────────────────────────────┴───────────────────┘
```

- **Sidebar (left, persistent):** Home, Clients, Schedule, Invoices, Messages, Settings, Profile. Mirrors today's `DashboardClientShell` nav items, promoted from a bottom bar to a vertical rail. Collapsible to icons on narrower desktops.
- **Main Workspace (center):** the scrolling command center — sections 1–7 in canonical order, with denser two-column arrangement where it helps (KPIs, Pulse).
- **AI Rail (right, persistent):** AI Copilot lives here as a calm column of suggestion cards. This keeps AI *present but subordinate* — Needs Attention in the main column still reads first.

> Note: AI Copilot appears in the **right rail on desktop** but as an **inline section (#4) on mobile**. Position differs by form factor; priority order (Needs Attention above AI) is preserved in both because on desktop the eye reads the main column before the rail.

### 3.4 Mobile layout — single calm column

```
Header (sticky)
↓ Daily Brief
↓ Needs Attention
↓ Today Timeline
↓ AI Copilot
↓ Business Health
↓ Client Pulse
↓ (Quick Actions = Floating Action Button, always reachable)
```

One column, generous spacing, thumb-reachable primary actions, FAB pinned bottom-right.

### 3.5 Responsive breakpoints (visual intent, not implementation)

| Range | Layout |
|---|---|
| `< 768px` (phone) | Single column + bottom nav + FAB. **Primary.** |
| `768–1024px` (tablet) | Single wide column; AI as inline section; optional left nav rail. |
| `≥ 1024px` (desktop) | Three-pane: Sidebar + Main Workspace + AI Rail. |
| `≥ 1440px` (large) | Same three-pane; main workspace gains a second column for KPIs/Pulse; content max-width capped to stay calm. |

---

## 4. Desktop Visual Blueprint

All wireframes are illustrative ASCII. Accent/urgency is shown with `‖` (accent edge), `▣` filled, `▢` empty/calm.

### 4.1 Desktop — Normal Day

A typical morning: a couple of things to resolve, sessions on the clock, money mostly fine.

```
┌────────────┬───────────────────────────────────────────────┬──────────────────────┐
│  FitDesk   │  Good morning, Yasser 👋                        │  AI COPILOT          │
│            │  Sat · Jun 13 · 4 sessions · 1 done             │  ──────────────────  │
│ ▣ Home     │                                                 │  ✨ 2 suggestions    │
│ ▢ Clients  │  ┌─ NEEDS ATTENTION (3) ───────────────────┐   │                      │
│ ▢ Schedule │  │ ‖ ▣ Session ended · Sara K.             │   │  ┌────────────────┐  │
│ ▢ Invoices │  │ ‖    Record outcome  →                  │   │  │ Remind Omar of │  │
│ ▢ Messages │  │ ‖ ▣ Reply from Omar (2h)               │   │  │ tomorrow 9am   │  │
│            │  │ ‖    Open chat  →                       │   │  │ [Review] [Skip]│  │
│ ──────────  │  │ ‖ ▣ Invoice #1043 overdue · $120       │   │  └────────────────┘  │
│ ⚙ Settings │  │ ‖    Send reminder  →                   │   │  ┌────────────────┐  │
│ ◐ Profile  │  └────────────────────────────────────────┘   │  │ Lina follow-up │  │
│            │                                                 │  │ queued in Needs│  │
│            │  ┌─ TODAY ──────────────────────────────────┐  │  │ Attention ↑    │  │
│            │  │ ● 14:00  Live · Maya  ▣ End session       │  │  └────────────────┘  │
│            │  │ ○ 16:00  Upcoming · Khaled                │  │                      │
│            │  │ ○ 18:00  Upcoming · Group HIIT (4)        │  │  AI suggests.        │
│            │  │ ✓ 09:00  Ended · Sara (needs outcome)     │  │  You decide.         │
│            │  └───────────────────────────────────────────┘  │                      │
│            │                                                 │                      │
│            │  ┌─ BUSINESS HEALTH ────────────────────────┐  │                      │
│            │  │ Active Clients  18  │ Collected  $2,140   │  │                      │
│            │  │ Outstanding  $360   │ Sessions/wk    6    │  │                      │
│            │  └───────────────────────────────────────────┘  │                      │
│            │                                                 │                      │
│            │  ┌─ CLIENT PULSE (calm) ────────────────────┐  │                      │
│            │  │ ◦ Lina — onboarding incomplete            │  │                      │
│            │  │ ◦ Khaled — no active program              │  │                      │
│            │  └───────────────────────────────────────────┘  │                      │
│            │                                                 │                      │
│            │  [+ Add Client] [Book Session] [Invoice] [Msg] │                      │
└────────────┴───────────────────────────────────────────────┴──────────────────────┘
```

### 4.2 Desktop — Busy Day

Many outcomes pending, several replies, a live session, multiple overdue invoices. Density rules engage: Needs Attention shows the top items and collapses the rest behind a count; lower sections compress.

```
┌────────────┬───────────────────────────────────────────────┬──────────────────────┐
│  FitDesk   │  Good morning, Yasser 👋                        │  AI COPILOT          │
│            │  Sat · Jun 13 · 9 sessions · 3 done             │  ──────────────────  │
│ ▣ Home     │                                                 │  ✨ 5 suggestions    │
│ ▢ Clients  │  ┌─ NEEDS ATTENTION (11) ──────────────────┐   │  (showing 3)         │
│ ▢ Schedule │  │ ‖ ▣ Session ended · Sara K.  → outcome  │   │  ┌────────────────┐  │
│ ▢ Invoices │  │ ‖ ▣ Session ended · Maya     → outcome  │   │  │ 4 reminders    │  │
│ ▢ Messages │  │ ‖ ▣ Session ended · Khaled   → outcome  │   │  │ ready to send  │  │
│            │  │ ‖ ▣ Reply · Omar (2h)        → chat     │   │  │ [Review all]   │  │
│ ──────────  │  │ ‖ ▣ Invoice #1043 overdue    → remind   │   │  └────────────────┘  │
│ ⚙ Settings │  │ ─────────────────────────────────────── │   │  ┌────────────────┐  │
│ ◐ Profile  │  │   ▾ Show 6 more (2 outcomes, 3 replies, │   │  │ Booking follow-│  │
│            │  │      1 overdue)                          │   │  │ ups queued in  │  │
│            │  └────────────────────────────────────────┘   │  │ Needs Attention│  │
│            │                                                 │  └────────────────┘  │
│            │  ┌─ TODAY (9) ──────────────────────────────┐  │  ┌────────────────┐  │
│            │  │ ● 14:00 Live · Maya  ▣ End                │  │  │ Revenue risk:  │  │
│            │  │ ○ 15:00 Lara  ○ 16:00 Khaled  ○ 17:00 …   │  │  │ 2 overdue 14d+ │  │
│            │  │ ▾ Show full timeline (9)                  │  │  │ [Review]       │  │
│            │  └───────────────────────────────────────────┘  │  └────────────────┘  │
│            │                                                 │  ▾ 2 more            │
│            │  ┌─ HEALTH (compact) ──────────┐  ┌─ PULSE (3) ▾ ───┐    │             │
│            │  │ 18 · $2.1k · $720 ⚠ · 6/wk │  │ ◦ 3 awareness  │    │             │
│            │  └─────────────────────────────┘  └────────────────┘    │             │
│            │  [+ Add] [Book] [Invoice] [Msg]                 │                      │
└────────────┴───────────────────────────────────────────────┴──────────────────────┘
```

### 4.3 Desktop — Inbox Zero

Everything transactional is resolved. Needs Attention is *celebrated* (not just empty). Today Timeline and calm awareness remain.

```
┌────────────┬───────────────────────────────────────────────┬──────────────────────┐
│  FitDesk   │  Good afternoon, Yasser 👋                      │  AI COPILOT          │
│            │  Sat · Jun 13 · 4 sessions · 4 done             │  ──────────────────  │
│ ▣ Home     │                                                 │  ✨ Nothing urgent.  │
│ ▢ Clients  │  ┌─ NEEDS ATTENTION ────────────────────────┐  │                      │
│ ▢ Schedule │  │            ✓  You're all caught up         │  │  1 idea for later:   │
│ ▢ Invoices │  │     No outcomes, replies, or overdue       │  │  ┌────────────────┐  │
│ ▢ Messages │  │            invoices waiting.               │  │  │ Re-engage Lina │  │
│            │  └───────────────────────────────────────────┘  │  │ (quiet 21 days)│  │
│ ──────────  │                                                 │  │ [Draft msg]    │  │
│ ⚙ Settings │  ┌─ TODAY ──────────────────────────────────┐  │  └────────────────┘  │
│ ◐ Profile  │  │ ✓ All 4 sessions completed.               │  │                      │
│            │  │   Next session: Mon 09:00 · Omar          │  │  AI suggests.        │
│            │  └───────────────────────────────────────────┘  │  You decide.         │
│            │  ┌─ BUSINESS HEALTH ────────────────────────┐  │                      │
│            │  │ Active Clients  18  │ Collected  $2,140   │  │                      │
│            │  │ Outstanding   $0 ✓  │ Sessions/wk    6    │  │                      │
│            │  └───────────────────────────────────────────┘  │                      │
│            │  ┌─ CLIENT PULSE (calm) ────────────────────┐  │                      │
│            │  │ ◦ Lina — onboarding incomplete            │  │                      │
│            │  └───────────────────────────────────────────┘  │                      │
│            │  [+ Add Client] [Book Session] [Invoice] [Msg] │                      │
└────────────┴───────────────────────────────────────────────┴──────────────────────┘
```

### 4.4 Desktop — Empty Day

No sessions scheduled today (e.g. a rest day or a brand-new trainer). The screen stays useful: it points to the next real thing and to setup actions, never showing a blank void.

```
┌────────────┬───────────────────────────────────────────────┬──────────────────────┐
│  FitDesk   │  Good morning, Yasser 👋                        │  AI COPILOT          │
│            │  Sat · Jun 13 · No sessions today               │  ──────────────────  │
│ ▣ Home     │                                                 │  ✨ A calm day.       │
│ ▢ Clients  │  ┌─ NEEDS ATTENTION ────────────────────────┐  │  Good time to:       │
│ ▢ Schedule │  │            ✓  Nothing needs you now        │  │  ┌────────────────┐  │
│ ▢ Invoices │  └───────────────────────────────────────────┘  │  │ Review capacity│  │
│ ▢ Messages │                                                 │  │ for next week  │  │
│            │  ┌─ TODAY ──────────────────────────────────┐  │  │ [Review][Skip] │  │
│ ──────────  │  │   🗓  No sessions scheduled today.         │  │  └────────────────┘  │
│ ⚙ Settings │  │   Next: Mon 09:00 · Omar                  │  │                      │
│ ◐ Profile  │  │   [Book a session]                        │  │  You decide.         │
│            │  └───────────────────────────────────────────┘  │                      │
│            │  ┌─ BUSINESS HEALTH ────────────────────────┐  │                      │
│            │  │ Active Clients  18  │ Collected  $2,140   │  │                      │
│            │  │ Outstanding  $360   │ Sessions/wk    0    │  │                      │
│            │  └───────────────────────────────────────────┘  │                      │
│            │  ┌─ CLIENT PULSE (calm) ────────────────────┐  │                      │
│            │  │ ◦ Lina — onboarding incomplete            │  │                      │
│            │  │ ◦ Khaled — no active program              │  │                      │
│            │  └───────────────────────────────────────────┘  │                      │
│            │  [+ Add Client] [Book Session] [Invoice] [Msg] │                      │
└────────────┴───────────────────────────────────────────────┴──────────────────────┘
```

> **Empty Day for a brand-new trainer** (zero clients): Needs Attention is hidden; Today shows a "Let's set up your business" panel; Client Pulse becomes a short onboarding checklist (Add your first client → Book first session → Send first invoice). This reuses the Empty Day frame, swapping content for activation guidance.

---

## 5. Mobile Visual Blueprint

Mobile is the **primary** form factor. One column, sticky header, FAB. Widths illustrative for a ~390px phone.

### 5.1 Mobile — Normal Day

```
┌─────────────────────────────┐
│ FitDesk           ◐ (you)   │  ← sticky header
├─────────────────────────────┤
│ Good morning, Yasser 👋     │  Daily Brief
│ Sat · Jun 13                │
│ 4 sessions · 1 done         │
│ ▸ "Record Sara's outcome"   │  one headline next-action
├─────────────────────────────┤
│ NEEDS ATTENTION        (3)  │
│ ┌─────────────────────────┐ │
│ │‖ Session ended · Sara   │ │
│ │‖ ▣ Record outcome    →  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │‖ Reply · Omar (2h)      │ │
│ │‖ ▣ Open chat         →  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │‖ Invoice #1043 · $120   │ │
│ │‖ ▣ Send reminder     →  │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ TODAY                       │
│ ● 14:00 Live · Maya  [End]  │
│ ○ 16:00 Khaled              │
│ ○ 18:00 Group HIIT (4)      │
│ ✓ 09:00 Sara (outcome ↑)    │
├─────────────────────────────┤
│ ✨ AI COPILOT          (2)  │
│ ┌─────────────────────────┐ │
│ │ Remind Omar of 9am      │ │
│ │ [Review]        [Skip]  │ │
│ └─────────────────────────┘ │
│ ▾ 1 more suggestion         │
├─────────────────────────────┤
│ BUSINESS HEALTH             │
│ Active Clients      18      │
│ Collected      $2,140       │
│ Outstanding    $360 (2)     │
│ Sessions/wk       6         │
├─────────────────────────────┤
│ CLIENT PULSE (calm)         │
│ ◦ Lina — onboarding         │
│ ◦ Khaled — no program       │
├─────────────────────────────┤
│                       ╭───╮ │
│                       │ + │ │  ← FAB (Quick Actions)
│                       ╰───╯ │
└─────────────────────────────┘
```

FAB tap opens a bottom sheet:

```
┌─────────────────────────────┐
│        Quick Actions        │
│  ─────────────────────────  │
│  👤  Add Client             │
│  🗓  Book Session           │
│  🧾  Create Invoice         │
│  💬  Message Client         │
│           [ Close ]         │
└─────────────────────────────┘
```

### 5.2 Mobile — Busy Day

Needs Attention caps visible items and collapses the rest; lower sections compress to summaries.

```
┌─────────────────────────────┐
│ FitDesk           ◐ (you)   │
├─────────────────────────────┤
│ Good morning, Yasser 👋     │
│ 9 sessions · 3 done         │
│ ▸ "5 outcomes to record"    │  AI-summarized headline
├─────────────────────────────┤
│ NEEDS ATTENTION       (11)  │
│ ┌─────────────────────────┐ │
│ │‖ ▣ Outcome · Sara    →  │ │
│ │‖ ▣ Outcome · Maya    →  │ │
│ │‖ ▣ Outcome · Khaled  →  │ │
│ │‖ ▣ Reply · Omar      →  │ │
│ └─────────────────────────┘ │
│ ▾ Show 7 more               │  collapse beyond 4–5
│   (2 outcomes, 3 replies,   │
│    2 overdue)               │
├─────────────────────────────┤
│ TODAY                  (9)  │
│ ● 14:00 Live · Maya  [End]  │
│ ○ next: 15:00 Lara          │
│ ▾ Show full timeline        │
├─────────────────────────────┤
│ ✨ AI COPILOT          (5)  │
│ ┌─────────────────────────┐ │
│ │ 4 reminders ready       │ │
│ │ [Review all]            │ │
│ └─────────────────────────┘ │
│ ▾ 4 more                    │
├─────────────────────────────┤
│ HEALTH  18 · $2.1k · $720⚠ · 9/wk  │  compact one-line
├─────────────────────────────┤
│ PULSE (3)               ▾   │  collapsed by default
├─────────────────────────────┤
│                       ╭───╮ │
│                       │ + │ │
│                       ╰───╯ │
└─────────────────────────────┘
```

### 5.3 Mobile — Empty Day

```
┌─────────────────────────────┐
│ FitDesk           ◐ (you)   │
├─────────────────────────────┤
│ Good morning, Yasser 👋     │
│ No sessions today           │
├─────────────────────────────┤
│ NEEDS ATTENTION             │
│ ┌─────────────────────────┐ │
│ │   ✓ Nothing needs you   │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ TODAY                       │
│ 🗓 No sessions today.       │
│ Next: Mon 09:00 · Omar      │
│ [ Book a session ]          │
├─────────────────────────────┤
│ ✨ AI COPILOT               │
│ A calm day. Good time to:   │
│ ┌─────────────────────────┐ │
│ │ Review capacity for     │ │
│ │ next week               │ │
│ │ [Review]        [Skip]  │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ HEALTH  18 · $2.1k · $360 · 0/wk  │
├─────────────────────────────┤
│ CLIENT PULSE (calm)         │
│ ◦ Lina — onboarding         │
│ ◦ Khaled — no program       │
├─────────────────────────────┤
│                       ╭───╮ │
│                       │ + │ │
│                       ╰───╯ │
└─────────────────────────────┘

### 5.4 Mobile — Inbox Zero

Everything transactional is resolved. Needs Attention celebrates the clear state; all other sections remain visible and calm.

```
┌─────────────────────────────┐
│ FitDesk           ◐ (you)   │  ← sticky header
├─────────────────────────────┤
│ Good afternoon, Yasser 👋   │  Daily Brief
│ Sat · Jun 13                │
│ 4 sessions · 4 done         │
│ ▸ "You're all caught up"    │  headline: inbox zero
├─────────────────────────────┤
│ NEEDS ATTENTION             │
│ ┌─────────────────────────┐ │
│ │   ✓ You're all caught   │ │
│ │     up — nothing needs  │ │
│ │     you right now.      │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ TODAY                       │
│ ✓ All 4 sessions complete   │
│ Next: Mon 09:00 · Omar      │
├─────────────────────────────┤
│ ✨ AI COPILOT               │
│ A great day. One idea:      │
│ ┌─────────────────────────┐ │
│ │ Re-engage Lina          │ │
│ │ (quiet 21 days)         │ │
│ │ [Draft msg]    [Skip]   │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ BUSINESS HEALTH             │
│ Active Clients      18      │
│ Collected      $2,140       │
│ Outstanding      $0 ✓       │
│ Sessions/wk       4         │
├─────────────────────────────┤
│ CLIENT PULSE (calm)         │
│ ◦ Lina — onboarding         │
│ ◦ Khaled — no program       │
├─────────────────────────────┤
│                       ╭───╮ │
│                       │ + │ │  ← FAB
│                       ╰───╯ │
└─────────────────────────────┘
```

Tone: rewarding and calm. The ✓ is the reward for clearing the queue — the rest of the screen keeps the trainer oriented and closes the day well.

---

## 6. Component Inventory

Each component lists: purpose, anchor to current code (if any), inputs, states, and primary action. "New" = not yet built; "Exists" = already shipped (extend, don't rebuild).

### 6.1 Daily Brief Card  *(Exists — `TodayHero` + greeting)*

- **Purpose:** Orient the trainer in one glance: name, date, today's session count/done, and one headline next-action.
- **Anchor:** greeting block + `TodayHero` in `DashboardView` (`scheduledCount`, `completedCount`).
- **Inputs:** trainer first name, greeting, date, today's scheduled/completed counts, single highest-priority next action label.
- **States:** Normal · Empty Day (no sessions) · New trainer (activation headline).
- **Primary action:** tapping the headline jumps to the relevant Needs Attention item or Timeline entry.

### 6.2 Attention Card  *(Exists partially — `ActionCenter` / `AttentionItem`)*

- **Purpose:** A single transactional obligation requiring action now.
- **Anchor:** `ActionCenter.tsx`, `AttentionItem` in `lib/dashboard/derive.ts`. **Today the derive layer only emits `type: 'overdue_invoice'`.** Adding `session_outcome`, `client_reply`, and `missing_next_session` is an **app-layer derive expansion** (read more from existing ERP data), not a backend change.
- **Inputs:** `type`, label, target `href`, severity, optional client name/amount/age.
- **Variants:** Session Outcome (→ Session Outcome Card) · Client Communication (→ Communication Card) · Overdue Payment (→ send reminder / record payment) · Missing Next Session (→ book).
- **States:** Default · High-severity (accent edge `‖`, e.g. 14d+ overdue) · Resolving (optimistic) · Resolved (animates out).
- **Primary action:** one click/tap to the completing flow.

### 6.3 Session Outcome Card  *(New — Progressive Disclosure)*

- **Purpose:** Resolve what happened in a session, using the v1.1 three-level disclosure.
- **Disclosure levels:**
  - **L1:** "Session ended · {client}" → tap **Record outcome**.
  - **L2:** Completed · No Show · Cancelled · Rescheduled.
  - **L3 (branches by client billing type):**
    - **Completed → Package client:** decrement package balance.
    - **Completed → Pay-per-session:** generate invoice.
    - **No Show → Package client:** "Deduct session? Yes / No".
    - **No Show → Pay-per-session:** "Charge missed session? Yes / No".
- **States:** Awaiting · In-progress (L2/L3 open) · Submitting · Done.
- **Rules:** Any money-affecting branch (generate invoice / charge missed) requires explicit confirmation; nothing auto-charges. ERP performs the write; the card reflects the result.

### 6.4 Communication Card  *(New, links to existing Messages)*

- **Purpose:** Surface a waiting client reply and route to the existing message thread.
- **Anchor:** links to `/dashboard/messages/[clientId]`.
- **Inputs:** client name, last message preview, age (e.g. "2h"), unread count.
- **States:** Unread · Snoozed · Opened.
- **Primary action:** "Open chat →". **Sending remains template-based and user-confirmed** per FitDesk WhatsApp rules — no auto-send from the dashboard.

### 6.5 AI Suggestion Card  *(New — AI Copilot)*

- **Purpose:** One assistive suggestion the trainer can accept, review, or dismiss. Never acts autonomously.
- **Anatomy:** icon (✨) · plain-language suggestion · rationale (optional, one line) · `[Review]` (opens the real flow pre-filled) · `[Skip]` (dismiss).
- **MVP suggestion types:** session reminders, overdue invoice nudges. Missing Next Session is owned by Needs Attention (§7.4); AI Copilot may reference it as supporting context only, never as a standalone action card.
- **Future types:** revenue risk, retention risk, capacity planning.
- **States:** Suggested · Reviewing (opens underlying flow) · Accepted · Skipped.
- **Hard rule:** "Review" always opens a confirmable action (e.g. the message composer with a draft). AI **never** sends a message or records a payment by itself.

### 6.6 KPI Card  *(Exists partially — `MoneySnapshot`)*

- **Purpose:** Calm awareness metric. Read-only. Not an action.
- **Anchor:** `MoneySnapshot` (`outstandingAmount`, `overdueCount`, `monthlyRevenue`, `currency`). Business Health KPIs per v1.1: Active Clients, Collected This Month, Outstanding Balance, Sessions This Week.
- **Inputs:** label, value, unit/currency, optional trend, optional warning flag.
- **States:** Normal · Warning (e.g. outstanding > 0, accent dot) · Zero/healthy (✓).
- **Behavior:** tapping a KPI may deep-link to the underlying list (e.g. Outstanding → Invoices filtered), but the card itself prompts no action.

### 6.7 Pulse Card  *(New — Client Pulse)*

- **Purpose:** Strategic, low-urgency awareness about a client's relationship health.
- **Inputs:** client name, pulse reason (onboarding incomplete · missing goals · no active program · retention risk), optional age.
- **Visual:** deliberately **calm** — muted text, `◦` bullet, no accent edge, no red. Distinguishes it sharply from Attention Cards.
- **States:** Default · Dismissed/Snoozed.
- **Primary action:** opens the relevant client area to act *when the trainer chooses* — never framed as urgent.

### 6.8 Quick Action / FAB  *(Exists — `QuickActions`)*

- **Purpose:** Fast access to create flows: Add Client, Book Session, Create Invoice, Message Client.
- **Anchor:** `QuickActions.tsx`.
- **Desktop:** a horizontal action bar at the bottom of the main workspace (and/or a top-right "+ New" menu).
- **Mobile:** a Floating Action Button opening a bottom sheet with the four actions.
- **States:** Default · Sheet open (mobile).
- **Rule:** Quick Actions are tools, always ranked last; they never compete visually with Needs Attention.

---

## 7. Interaction Flows

Each flow is described as states/transitions (text), not code. All money/message-affecting steps are explicitly **trainer-confirmed**, and ERP remains authoritative.

### 7.1 Session Ended

```
Trigger: a session's end time passes (or trainer taps "End" on a live session).
  → Attention Card appears: "Session ended · {client}"  (Needs Attention)
  → Trainer taps "Record outcome"            [L1 → L2]
  → Chooses: Completed / No Show / Cancelled / Rescheduled
  → Branch [L2 → L3], by client billing type:
      • Completed + Package      → confirm "Decrement 1 session"  → ERP write
      • Completed + Pay/session  → "Generate invoice"  → confirm  → ERP creates Sales Invoice
      • No Show + Package        → "Deduct session? Yes/No"
      • No Show + Pay/session    → "Charge missed session? Yes/No"
  → On success: card shows ✓, animates out; counts update; Business Health refreshes.
  → On ERP failure: card stays, shows safe error + retry; no silent failure.
```

### 7.2 Client Reply

```
Trigger: inbound client message detected.
  → Communication Card appears: "Reply · {client} ({age})"  (Needs Attention)
  → Trainer taps "Open chat →"  → /dashboard/messages/[clientId]
  → Trainer replies using a template (per WhatsApp rules); send is user-confirmed.
  → Sent message logged (timestamp, user, result); delivery failures surface in UI.
  → Card clears once the thread is opened/handled.
```

### 7.3 Overdue Invoice

```
Trigger: invoice past due (derive layer already emits 'overdue_invoice').
  → Attention Card: "Invoice #{n} overdue · {amount}"  (high severity if 14d+)
  → Trainer chooses:
      • "Send reminder"  → opens template message → confirm send (no auto-send)
      • "Record payment" → manual payment fallback → ERP Payment Entry → invoice marked paid
  → ERP verifies; invoice status updates; Outstanding KPI recalculates.
  → AI Copilot may *suggest* the reminder, but the trainer still confirms the send.
```

### 7.4 Missing Next Session

```
Trigger: an active client has no upcoming session booked.
  → Surfaces exclusively as a Needs Attention item (transactional: keep the client
    on the calendar). Needs Attention is the single actionable owner.
  → Trainer taps "Book" → Schedule new-session flow, pre-filled with the client.
  → On confirm → ERP creates Session → Timeline + counts update → item clears.
  Note: distinct from Client Pulse "no active program," which is strategic, not urgent.
```

**Ownership rule (no dual-placement):**

- Missing Next Session belongs to **Needs Attention only** while it is actionable.
- AI Copilot **must not** create a parallel action card for the same client.
- AI Copilot may reference it only as *supporting context* (e.g. bundled in a summary like "3 clients need booking — see Needs Attention"), never as a standalone action card.
- If Needs Attention is at capacity, Missing Next Session follows the §8.3 priority ordering and collapses inside the "▾ Show N more" summary. It does not migrate to AI Copilot as a secondary actionable source.
- Once the trainer books the session (in Needs Attention), the item clears in both Needs Attention and any AI context reference.

### 7.5 Inbox Zero

```
Trigger: zero Needs Attention items remain.
  → Needs Attention region renders the celebrated state:
       "✓ You're all caught up — no outcomes, replies, or overdue invoices waiting."
  → Today Timeline and Business Health remain visible.
  → AI Copilot may offer ONE low-pressure, strategic idea (e.g. re-engage a quiet client),
    clearly optional.
  → Tone: rewarding and calm — never a blank or broken-looking screen.
```

---

## 8. Density Rules

### 8.1 Max visible cards (before collapse)

| Section | Mobile max visible | Desktop max visible | Overflow behavior |
|---|---|---|---|
| Needs Attention | 4–5 | 6–7 | "▾ Show N more" with a typed breakdown (e.g. "2 outcomes, 3 replies") |
| Today Timeline | Live + next 3 | Live + next 5 | "▾ Show full timeline (N)" |
| AI Copilot | 2 | 3 (rail) | "▾ N more"; bundle similar (e.g. "4 reminders ready · Review all") |
| Business Health | 3–4 KPIs | 4 KPIs | Compresses to one line on Busy Day |
| Client Pulse | 2–3 | 3–4 | Collapsed (`▾`) by default on Busy Day |
| Quick Actions | 4 (FAB sheet) | 4 (bar) | — |

### 8.2 Collapse behavior

- Sections collapse **downward in priority**: when the day is busy, lower-priority sections (Pulse, then Health detail) compress first; Needs Attention and Today retain the most room.
- Collapsed groups always show a **count and a typed summary**, never a bare "more". The trainer must know *what* is hidden.
- Collapse state is per-session and remembered while on the page; it resets on reload (no persisted preference in MVP).
- AI bundles repetitive suggestions into a single card with a count ("4 reminders ready → Review all") rather than stacking four cards.

### 8.3 Priority ordering (within Needs Attention)

When more items exist than fit, order by urgency:

```
1. Live/just-ended session outcomes (time-sensitive, money-linked)
2. Overdue invoices — oldest / largest first (severity-weighted)
3. Waiting client replies — oldest first
4. Missing next session for active clients
```

Within a tie, oldest item wins. Section order across the dashboard is fixed (§3.1); this rule governs only ordering *inside* Needs Attention.

### 8.4 Escalation rules

- **Time escalation:** an overdue invoice crossing a threshold (e.g. 14 days) gains the high-severity accent edge `‖` and rises in Needs Attention order.
- **Volume escalation:** if Needs Attention exceeds ~10 items, the Daily Brief headline switches to an AI-summarized count ("5 outcomes to record") to keep orientation calm.
- **No escalation to red-everywhere:** escalation raises *one* item's prominence; it never floods the screen in alarm colors. Calm is a hard requirement.
- **Pulse never escalates into Attention automatically.** A strategic signal becoming urgent (e.g. retention risk → client churning) is a deliberate, documented rule change — not silent promotion.

---

## 9. Visual Language

### 9.1 Inspiration

| Inspired by | What we borrow |
|---|---|
| **Linear** | Speed, keyboard-fast feel, crisp typographic hierarchy, restrained color |
| **Notion** | Calm whitespace, content-first blocks, gentle structure |
| **Ramp** | Money shown clearly and unanxiously; action-oriented finance cards |
| **Stripe** | Precise spacing, trustworthy data presentation, subtle depth |
| **Apple Fitness** | Warmth, motivating tone, friendly rings/counts, single clear focus |

### 9.2 Explicitly avoid

- **ERPNext / Frappe desk UI** — dense forms, list views, grid-of-everything.
- **Salesforce / legacy CRM** — tab soup, cluttered toolbars, enterprise chrome.
- **Generic admin dashboards** — wall-of-charts, KPI overload, "analytics first".
- A **stretched mobile column** masquerading as a desktop app.

### 9.3 Principles

- **Calm by default, accent on purpose.** Color/contrast is spent on what needs action (Needs Attention), not spread evenly.
- **One headline focus per screen.** The Daily Brief names the single most important next step.
- **Action > metric.** Anything actionable reads louder than anything merely informational.
- **Quiet awareness.** Client Pulse and KPIs use muted treatment so they never feel like alarms.
- **Honest empty states.** Empty = calm and celebratory, never broken.

### 9.4 Tokens & primitives (reuse existing, no Tailwind redesign)

The blueprint reuses FitDesk's existing CSS variables and component primitives — **it does not propose new Tailwind config or a new design system**:

- Colors via existing tokens: `--fd-bg`, `--fd-text`, `--fd-accent`, `--fd-border` (and any siblings already defined).
- Iconography via the existing **lucide-react** set already in use.
- Cards, sheets, and lists follow the existing `components/ui` and `components/modules` patterns.
- Typography: existing scale; hierarchy expressed through weight/size already present, not new fonts.

| Role | Treatment |
|---|---|
| Urgent / action | `--fd-accent` edge `‖`, higher contrast text, count badge |
| Live session | pulsing dot `●` + accent |
| Neutral content | `--fd-text` on `--fd-bg`, `--fd-border` dividers |
| Calm awareness (Pulse/KPI) | muted text, `◦` bullets, no accent edge |
| Success / Inbox Zero | check `✓`, gentle positive tint |

---

## 10. MVP / Pilot-Safe Scope

Aligned to v1.1 MVP scope and FitDesk's existing **Pilot mode** (`PilotBanner` / `isPilotMode`). MVP ships value without risky surface area.

**In scope (MVP):**

1. **Daily Brief** — extend existing greeting + `TodayHero`.
2. **Needs Attention** — extend `ActionCenter`/`AttentionItem` from overdue-only to include **session outcomes**, **client replies**, **missing next session**, **overdue payments** (app-layer derive, reading existing ERP data).
3. **Session Outcome Workflow** — full L1→L2→L3 progressive disclosure, all money branches trainer-confirmed.
4. **Today Timeline** — existing `TodayTimeline`, with Live / Recently-Ended / Empty states.
5. **AI Suggestions (Copilot)** — session reminders, overdue nudges; **Review/Skip only, never autonomous**. Missing Next Session is surfaced exclusively in Needs Attention (§7.4); AI Copilot may reference it as context only.
6. **Business Health** — existing `MoneySnapshot` plus the four v1.1 KPIs.
7. **Quick Actions** — existing `QuickActions` (desktop bar + mobile FAB).
8. **Responsive shell** — build the layout shell that delivers:
   - **Mobile (`< 768px`):** single-column + bottom nav + FAB (extends the existing `480px` shell).
   - **Desktop (`≥ 1024px`):** Sidebar + Main Workspace + AI Rail — **replaces the current `max-w-[480px]` desktop column**. This is a presentational/layout change only; it does not touch the backend, ERP, `client_index`, Client Hub, or Action Queue.
   - The desktop must not ship as a stretched mobile column.

**Explicitly OUT of MVP:**

- AI future types (revenue risk, retention risk, capacity planning).
- Any autonomous AI actions.
- Persisted collapse preferences, customization, reordering.
- Any backend/ERP/DocType/`client_index`/Client Hub/Action Queue redesign.

**Pilot-safety guarantees:**

- No auto-send of WhatsApp; no auto-charge; manual payment fallback always present.
- `Promise.allSettled` resilience (as in current `page.tsx`) preserved — one ERP failure must not blank the dashboard.
- All actions return typed success/error and surface failures in the UI.

---

## 11. Production-Hardening Soon

After the pilot validates the layout, before broad rollout:

- **Desktop three-pane shell hardening** — validate and performance-harden the Sidebar + Main Workspace + AI Rail layout shipped in MVP Phase 1, including AI rail density, keyboard navigation, and responsive behavior across breakpoints.
- **Performance:** ensure parallel data derivation stays fast; lazy-load AI Rail and below-the-fold sections; skeletons for each section.
- **Resilience & observability:** per-section error boundaries; structured logging of action outcomes (timestamp, trainer, action, result) per error-handling rules.
- **Accessibility:** focus order matching visual priority, ARIA on cards/sheets, keyboard-completable Needs Attention actions (Linear-grade), color-contrast for accent/muted states.
- **Density tuning:** validate the collapse thresholds (§8) against real busy-day data from pilot trainers.
- **AI guardrails:** rate/visibility limits, clear "AI suggested" labeling, audit trail for every accepted suggestion.
- **Empty/edge states:** new-trainer activation, single-client, timezone correctness for "today" boundaries.

---

## 12. Future Platform Architecture Later

Longer-horizon, explicitly **not** part of this blueprint's build (captured so the design doesn't paint us into a corner):

- **AI Copilot v2:** revenue risk, retention risk, capacity planning — still assistive, still trainer-confirmed.
- **Cross-surface command center:** the same Needs Attention model powering notifications / a daily digest, without duplicating ERP truth.
- **Personalization:** trainer-configurable section emphasis and collapse defaults.
- **Multi-location / team trainers:** if the product grows beyond solo trainers, the sidebar and Needs Attention scoping would need a tenancy-aware revision (requires separate approval).
- **Deeper ERP automation:** any move toward automated financial actions would require explicit product + risk approval and is out of scope here.

> None of the above implies backend, ERP DocType, `client_index`, Client Hub, or Action Queue redesign. Those remain owned by their existing services and are out of scope for the dashboard.

---

## 13. Implementation Roadmap

> Sequencing only. **No code in this document.** This is the recommended order of future work, each step independently shippable and reversible.

```
Phase 0 — Approval & alignment
  • Approve this blueprint. Confirm token reuse.

Phase 1 — Responsive shell (MVP — presentational only)
  • Build the layout shell:
      - Mobile: single-column + bottom nav + FAB (extends existing shell).
      - Desktop: Sidebar + Main Workspace + AI Rail; retire the 480px desktop column.
  • Presentational change only — no backend, ERP, or architecture impact.

Phase 2 — Needs Attention expansion (highest value, app-layer)
  • Extend lib/dashboard/derive.ts to emit session_outcome, client_reply,
    missing_next_session (in addition to existing overdue_invoice).
  • Render new Attention Card variants in ActionCenter. No backend change.

Phase 3 — Session Outcome Workflow (L1→L2→L3)
  • Progressive disclosure + confirmed money branches via existing ERP actions.

Phase 4 — Daily Brief headline + Today Timeline states
  • Single next-action headline; Live / Recently-Ended / Empty modes.

Phase 5 — AI Copilot (MVP suggestions)
  • Reminders / missing next / overdue nudges. Review + Skip only.

Phase 6 — Business Health + Client Pulse
  • Four KPIs; calm Pulse cards (strategic, non-urgent).

Phase 7 — Production hardening
  • A11y, error boundaries, density tuning, audit logging, performance.
```

Each phase: define success criteria → build smallest safe change → verify (`npm run build`, `npm test`/`vitest`, `next lint`) → ship. No phase requires touching ERP DocTypes, server scripts, provisioning, or Dokploy.

---

## 14. Open Questions / Risks

**Open questions (need product input):**

1. **Client billing type source:** the Session Outcome L3 branch depends on knowing Package vs. Pay-per-session per client. Where is this read from today, and is it reliably available in `getSessions`/client data? (Relates to the open client identity / ERP customer sync question.)
2. **Client reply detection:** is inbound-message state available to the dashboard derive layer in MVP, or does §7.2 wait until messaging state is queryable server-side?
3. **Missing-next-session definition:** what window defines "missing" (e.g. active client with no booking in next N days)? Needed before it can be derived. Ownership is now resolved: Needs Attention only (§7.4). This question governs the derive-layer threshold, not placement.
4. **Desktop timing:** ~~does the real three-pane shell land in MVP (presentational) or Phase 6?~~ **Resolved — desktop three-pane is MVP Phase 1 (presentational shell only).**
5. **"Today" boundary:** current `page.tsx` derives `today` from UTC; trainers in local timezones may see off-by-hours session bucketing — confirm intended timezone handling.

**Risks:**

- **Scope creep into backend.** Expanding Needs Attention is tempting to "fix in ERP." Guardrail: it must stay an app-layer derive read; any ERP/DocType change requires separate approval.
- **AI overreach.** Pressure to "just auto-send the reminder." Guardrail: Review/Skip only; confirmed sends; no exceptions in MVP.
- **Desktop afterthought.** ~~Risk of shipping the stretched mobile column again.~~ **Mitigated — desktop three-pane is committed MVP scope (Phase 1).** Guardrail: this blueprint mandates it and the responsive shell must ship before Needs Attention expansion.
- **Density misjudgment.** Collapse thresholds (§8) are estimates; validate against real busy-day data before locking.
- **Empty-state neglect.** Empty/Inbox-Zero states must be designed, not defaulted — they're a core part of the calm experience.

**Assumptions:**

- Existing components (`TodayHero`, `NextUpCard`, `MoneySnapshot`, `ActionCenter`, `TodayTimeline`, `UpcomingList`, `QuickActions`) and `lib/dashboard/derive.ts` are the foundation and will be extended, not rewritten.
- Existing `--fd-*` tokens and lucide-react cover the visual language; no new design system.
- ERPNext/Frappe remains the system of record; the dashboard reads and triggers confirmed actions only.
- Pilot mode remains the safe rollout vehicle.

---

## 15. Final Approval Checklist

- [ ] Mission confirmed: dashboard is the **Trainer Command Center**, action-first (not analytics).
- [ ] Section order locked: **Daily Brief → Needs Attention → Today Timeline → AI Copilot → Business Health → Client Pulse → Quick Actions**.
- [ ] **Needs Attention stays above AI Copilot.**
- [ ] **Needs Attention = transactional/urgent; Client Pulse = strategic/awareness.** Boundary accepted.
- [ ] **AI is Copilot, not Chatbot** — suggests only, trainer confirms; no autonomous sends/charges.
- [ ] **Mobile is primary**; single column + FAB approved.
- [ ] **Desktop uses a real three-pane layout** (Sidebar + Main Workspace + AI Rail), not a stretched mobile column.
- [ ] Component inventory (8 components) and their current-code anchors accepted.
- [ ] Interaction flows (5) and confirmation gates on money/messaging accepted.
- [ ] Density & escalation rules (§8) accepted as starting thresholds (to be validated in pilot).
- [ ] Visual language (Linear/Notion/Ramp/Stripe/Apple Fitness; avoid ERPNext/Salesforce/legacy CRM) accepted.
- [ ] Scope respected: **no backend / ERP / DocType / `client_index` / Client Hub / Action Queue / Tailwind redesign**; Needs Attention expansion is app-layer derive only.
- [ ] MVP / Pilot-safe scope (§10) confirmed.
- [ ] Roadmap sequencing (§13) accepted; **no code begins until this checklist is signed off**.
- [ ] Open questions (§14) routed to product for answers.

---

*End of Visual Blueprint. This document specifies design and sequencing only. No code, components, Tailwind, backend, ERP, migrations, deployment, or production systems were modified in producing it.*
