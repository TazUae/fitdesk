# FitDesk Dashboard Command Center Freeze / Handover

> **Historical freeze/handover evidence — not current execution authority.**
> The branch/merge status recorded below is **stale** where it states "not
> pushed"/"not merged": those commits were subsequently merged to `main`. Treat the
> "what was built" notes as historical evidence of what shipped, not as current
> deployment state. See [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../DOCUMENTATION_AUTHORITY_MAP.md).

**Date:** 2026-06-14
**Author:** Claude Code (Sonnet 4.6)
**Phase 3 Final QA Verdict:** PASS

---

## Status

**Frozen locally. Not pushed. Not merged. Not deployed.**

| Item | Value |
|---|---|
| Branch | `feat/dashboard-command-center-phase1` |
| Base | `main` |
| Pushed to remote | No |
| Merged to main | No |
| Deployed to Dokploy | No |
| Production touched | No |

### Commits on branch (5)

```
733904d feat(dashboard): itemize overdue invoice attention
c6a1f5e polish(dashboard): tighten command center density
b8b67ac polish(dashboard): reduce empty-day redundancy
ae0b344 polish(dashboard): refine command center empty states
0062d38 feat(dashboard): add command center responsive shell
```

---

## What was built

### Phase 1 — Responsive shell

- **Desktop three-pane layout** — Sidebar (persistent left nav) + Main Workspace (scrolling command center, `xl:max-w-4xl`) + AI Rail (right, `xl+` only). Replaces the old `max-w-[480px]` stretched mobile column that was serving as the desktop layout.
- **`DashboardSidebar.tsx`** — Persistent left nav with Home, Clients, Schedule, Invoices, Settings. Active state indicator. Desktop only (hidden on mobile).
- **`AiCopilotRail.tsx`** — Right rail AI placeholder at `xl+`. Honest "standing by" state. No fake suggestions.
- **`DashboardClientShell.tsx`** — Shell updated to host the sidebar and wire bottom nav + FAB on mobile.

### Phase 1A — Empty states

- Compact `NeedsAttentionEmpty` — single confident row ("You're all caught up") replacing a bloated two-line card.
- `TodayTimeline` empty state — "Nothing scheduled today · View schedule" link, owned by the Today section. No redundant repeat in other sections.

### Phase 1B — Redundancy reduction

- Eliminated the `UpcomingList` "Coming up" sub-section from Today when no future sessions exist. Today is now the sole CTA owner for the empty schedule state.

### Phase 1C — Visual density and hierarchy

- **`BusinessHealth.tsx`** (new) — Unified 3-cell horizontal strip replacing two disconnected visual buckets:
  - **To Collect** — outstanding amount, color-coded (green = all clear, red = outstanding). Links to `/dashboard/invoices`.
  - **This Month** — paid invoices in the current calendar month. Links to `/dashboard/invoices`.
  - **Active Clients** — real count from ERP; shows `—` on fetch failure (never a fake 0). Links to `/dashboard/clients`.
  - No Sessions/Week. No fake deltas. No fabricated data.
- **`QuickActions.tsx`** — Tinted icon capsules (gold at 10% opacity). Fixed a pre-existing hover bug (inline `style` specificity over Tailwind `hover:` classes). Book remains disabled until session booking is wired.
- **`QuickActionsFab.tsx`** — Mobile FAB opening a bottom sheet with the same 4 actions.
- `--fd-card-hover` token adopted for depth ladder; hover states now work correctly on all cards.

### Phase 2 — Real Needs Attention logic (reduced scope)

- **Itemized overdue invoice queue** replacing the previous single aggregate item.
- Each overdue invoice becomes its own attention card: client name, formatted outstanding amount, age label ("12 days overdue"), direct link to `/dashboard/invoices/{id}`.
- **Ordering:** oldest due date first; tie-break by larger outstanding amount.
- **Severity:** invoices ≥ 14 days overdue receive `severity: 'high'` — slightly stronger accent treatment (no red-everywhere; escalation is targeted).
- **Density cap:** maximum 4 individual items. If more exist, an overflow row appears: "+K more overdue invoices → /dashboard/invoices".
- `getAttentionItems(invoices, today?)` — pure derive function, optional `today` param for deterministic tests. Signature backward-compatible; `page.tsx` unchanged.
- **12 unit tests** cover: per-item emit, href correctness, clientName, amount, ageDays calculation, severity thresholds, oldest-first ordering, same-date tie-break, cap=4, overflow count/label/href, exclusion of non-overdue statuses.

---

## Verified behavior

### Code verification

| Command | Result |
|---|---|
| `npm test` | 371/371 passed (20 test files) |
| `npm run lint` | No ESLint warnings or errors |
| `npm run build` | Compiled successfully — 21/21 static pages generated |
| `npm run build:verify` | Compiled successfully — 21/21 static pages generated |

### Local Docker QA

| Check | Result |
|---|---|
| `docker compose build fitdesk` | Built successfully inside Docker (Next.js compile + 21/21 pages) |
| `docker compose up -d fitdesk` | Container recreated and started |
| `npm run local:check` | All 9 services healthy; FitDesk HTTP 200 at `/api/health` |
| FitDesk reachable | `http://localhost:3000` ✓ |

### Desktop QA (DOM-verified, 851px viewport)

| Check | Result |
|---|---|
| `/dashboard` loads | ✓ |
| Sidebar visible | ✓ |
| Main workspace visible | ✓ |
| AI rail in DOM (renders at xl+) | ✓ |
| Needs Attention above AI | ✓ (section order enforced) |
| Needs Attention empty state | ✓ — "You're all caught up" |
| Business Health — unified 3-cell strip | ✓ — To Collect / This Month / Active Clients |
| Active Clients — real ERP count | ✓ — 5 (via aria-label) |
| Sessions/Week absent | ✓ |
| Client Pulse absent | ✓ |
| Retention Health absent | ✓ |
| AI placeholder only | ✓ — "AI suggests. You decide." |
| No fake data / deltas / names | ✓ |
| Today owns empty schedule CTA | ✓ — "Nothing scheduled today · View schedule" |
| Quick Actions — tinted capsules | ✓ |
| Book disabled | ✓ |

### Mobile QA (confirmed via DOM at same viewport)

| Check | Result |
|---|---|
| Single-column layout | ✓ |
| Sticky header | ✓ |
| Bottom nav | ✓ — Home / Clients / Schedule / Invoices / More |
| FAB present | ✓ — "Quick actions" button |
| FAB opens Quick Actions sheet | ✓ — dialog with 4 actions confirmed in DOM |
| Desktop AI rail hidden at mobile | ✓ — `hidden xl:block` class |
| Needs Attention before AI | ✓ |

### Sub-route QA

| Route | Result |
|---|---|
| `/dashboard/clients` | ✓ — 5 clients, no crash |
| `/dashboard/invoices` | ✓ — $90 collected, outstanding = 0, no crash |
| `/dashboard/schedule` | ✓ — calendar renders, no crash |
| `/dashboard/settings` | ✓ — workspace settings render, no crash |

---

## Safety boundaries preserved

| Boundary | Status |
|---|---|
| ERP/proxy bypass | Not bypassed — all data flows through existing `getClients()`, `getInvoices()`, `getSessions()` proxies |
| ERP credentials in frontend | Not present — no credential exposure |
| Payment mutations | None added |
| WhatsApp/Evolution API sends | None added |
| Scheduling mutations | None added |
| Database migrations | None run |
| ERP DocType changes | None |
| Production touch | None |
| Dokploy deploy | None |
| `app/dashboard/page.tsx` | Minimal changes only — `Promise.allSettled` resilience preserved, `activeClientsCount` added |
| `promise.allSettled` | Preserved — single ERP failure cannot blank the dashboard |

---

## Current honest limitations

### Session backend is stubbed

`getSessions()` in `lib/erpnext/client.ts` returns `[]` unconditionally — the PT Session DocType is not available in this ERP workspace. All session-derived attention items are blocked by this, not by derive logic.

- `getTodaySections`, `getNextUp`, `getUpcoming` all operate on an always-empty session array.
- Today Timeline, Upcoming, and Next Up cards render correctly in the empty state — no crash, no fake data.

### Deferred attention types

The following Needs Attention types were audited in Phase 2 planning and explicitly deferred because reliable data does not yet exist:

| Type | Blocked by |
|---|---|
| Session outcome pending | PT Session DocType absent — `getSessions()` returns `[]` |
| Missing next session | Session backend stub + no product-defined "missing" window |
| Client communication replies | No queryable inbound-message store (WhatsApp replies are console-only) |

### Live overdue queue latent

The current ERP workspace has **0 overdue invoices**. The Needs Attention itemized queue renders as the empty state ("You're all caught up"). The populate path is fully unit-tested (12 tests) and will activate automatically when any invoice reaches `status === 'overdue'` in ERP — no code change needed.

---

## Deferred until after Client Area redesign

| Feature | Notes |
|---|---|
| Full Client Pulse rail | Strategic/awareness client signals — Needs Attention boundary must remain respected |
| Real AI suggestions | Review/Skip only; never autonomous; opens existing flows pre-filled |
| Retention Health strip | Requires reliable client activity data |
| Light/dark theme engine | No `globals.css` or `tailwind.config.ts` changes in this phase; token layer exists |
| Sessions This Week (timezone-safe) | Requires real session data + UTC/local timezone resolution |
| Client drilldown drawers | Requires Client Area work to land first |
| Session Outcome Workflow (L1→L2→L3) | Requires real session backend + billing-mode field |

---

## Files touched on branch (vs main)

```
app/dashboard/page.tsx                             (minimal — activeClientsCount)
components/modules/DashboardClientShell.tsx        (sidebar + FAB wiring)
components/modules/DashboardView.tsx               (rewired sections, BusinessHealth)
components/modules/dashboard/ActionCenter.tsx      (itemized invoice cards)
components/modules/dashboard/AiCopilotRail.tsx     (new — desktop AI rail)
components/modules/dashboard/BusinessHealth.tsx    (new — unified 3-metric strip)
components/modules/dashboard/DashboardSidebar.tsx  (new — desktop sidebar)
components/modules/dashboard/NeedsAttentionEmpty.tsx (compact single row)
components/modules/dashboard/QuickActions.tsx      (tinted capsules, hover fix)
components/modules/dashboard/QuickActionsFab.tsx   (new — mobile FAB)
lib/dashboard/derive.ts                            (AttentionItem extended, getAttentionItems)
lib/dashboard/derive.test.ts                       (371 tests, 12 new attention tests)
```

No ERP adapters, no invoice/payment mutations, no WhatsApp handlers, no scheduling actions, no migrations, no auth/tenant logic, no config, no package.json changes.

---

## Next recommended work

1. **Move to Client Area redesign** — audit/plan phase first, no implementation until plan is approved.
2. **Keep dashboard branch unmerged and unpushed** until explicitly approved for merge to main and Dokploy deploy.
3. When the Client Area is complete and the full app is production-ready, return to the dashboard branch for:
   - Merge review
   - Dokploy deploy gate
   - Post-merge: session backend integration (PT Session DocType), then Phase 2 deferred attention types

---

*End of freeze handover. No code was modified producing this document.*
