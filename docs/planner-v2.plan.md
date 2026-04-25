# Planner V2 — Google-Calendar-Grade Refactor

## Context

Current scheduler (`ScheduleView` → `CalendarView` + `BookingPanel`) supports tap-to-select slots on a 30-minute grid, then opens a full-page booking panel. No drag, no DnD, no resize, no month view. Overlapping sessions are lane-assigned but width is naive. Server actions are solid (`buildPlanAction`, `bookPlanAction`, `rescheduleSessionAction`, `cancelSessionAction`, `completeSessionAction`, `markNoShowAction`, `listFDSessionsAction`), Phase A/B are live. Design tokens in `lib/ui/scheduleDesignTokens.ts`; styling via CSS vars (`--fd-*`) + Tailwind. Luxon already a dep.

Goal: match Google Calendar's interaction grade while keeping the existing action pipeline and design language.

---

## Phase 1 — Interaction Engine

### 1.1 Drag-to-create + Quick Add

**`components/scheduling/CalendarView.tsx`** — `DayColumn`
- Replace single `onClick` with `onPointerDown` / `onPointerMove` / `onPointerUp` range-draw.
- Track `{ startMin, endMin }` in local state during drag; render a translucent preview block.
- On `pointerUp`: if dragged > 1 slot → emit a range `{ date, startTime, endTime }`; if tap (< threshold) → emit a single slot as today's single-tap behavior.
- Use `setPointerCapture` so drag continues if pointer leaves the column.

**`components/scheduling/QuickAddPopover.tsx`** — NEW
- Floating popover anchored to the drag rect (fixed positioning, computed from column bounding rect).
- Fields: client (searchable select, reuses existing `<ClientPicker>` pattern), session type (chip row like BookingPanel), fee input.
- Primary: **Book** → `buildPlanAction` (one-off) → `bookPlanAction` → optimistic insert into calendar.
- Secondary: **More options** → opens full `BookingPanel` pre-filled with the range (recurrence, multi-slot edits).
- Escape / outside-click closes.

**`components/modules/ScheduleView.tsx`**
- Add `quickAddRange: { date, startTime, endTime } | null` state.
- Route `onRangeSelect` from CalendarView → open QuickAddPopover; route `onSlotsChange` (multi-select) → BookingPanel as today.
- Optimistic insert on book success (same `handleOptimisticReplace` pattern as details sheet).

### 1.2 Drag-to-reschedule + Resize

**`components/scheduling/CalendarView.tsx`** — `SessionBlock` (inline component)
- Wrap block in a pointer handler: `pointerDown` on body → enter drag-move mode; `pointerDown` on a bottom 8px-tall handle → enter resize mode.
- During drag-move: translate the block with CSS `transform: translateY(dy)` in 30-min snaps; on column change (dx crosses column boundary), recompute target date from pointer x vs sibling DayColumn rects.
- During resize: only change bottom edge, snap to 30-min.
- `pointerUp`:
  - Move → call `rescheduleSessionAction` with new `{ newDate, newTime, expectedVersion }`.
  - Resize → call a NEW action (see next).
- Optimistic update via a new prop `onOptimisticReplace` already wired through ScheduleView; rollback on action failure by calling `reconcile()`.

**`lib/scheduling/sessionService.ts`** — extend `rescheduleOne`
- Add optional `newDurationMinutes?: number` to the input. If provided, use it for `newEndAt` calc instead of `current.durationMinutes`. Keep existing behavior when omitted.
- Same conflict/availability re-check against the new window.

**`actions/schedulingActions.ts`** — extend `rescheduleSessionAction`
- Add `newDurationMinutes?: number` to `input`. Pass through.

**Rationale:** one action handles move + resize + time-only changes — avoids a proliferation of narrow actions. Existing callers (SessionDetailsSheet) unchanged because the field is optional.

### 1.3 Waterfall overlap layout

**`components/scheduling/CalendarView.tsx`** — replace `layoutSessions`
- Current: assigns lanes but `totalLanes = concurrent count` which is per-session, not per-cluster. Produces uneven widths.
- New algorithm (matches Google):
  1. Sort by `start`.
  2. Walk sessions; build *clusters* where any pair transitively overlaps.
  3. Within each cluster: greedy lane-assign (first lane whose previous session ends ≤ current start).
  4. Session width = `1 / clusterLaneCount`; left offset = `lane * width`.
  5. If a session ends before the cluster's longest-running session and no sibling starts in that gap, expand its width to `remaining lanes` for visual balance (Google's "waterfall" expansion).
- Keep the pure-function signature; no prop changes.

---

## Phase 2 — UI & Layout

### 2.1 Multi-view (Day / Week / Month)

**`components/scheduling/CalendarView.tsx`**
- Surface the existing `view: 'day' | 'week'` toggle; add `'month'`.
- When `view === 'month'`, render `<MonthView>` instead of time grid. Week nav re-purposes to month nav (+/- 1 month).

**`components/scheduling/MonthView.tsx`** — NEW
- 6×7 grid of day cells (Sun-first or Mon-first, match existing `mondayOf`).
- Each cell: day number + up to 3 session chips (sorted by start) + "+N more" overflow.
- Click a cell → switch to Day view for that date.
- Click a chip → `onSessionClick(session)`.
- Overflow tap → popover listing all sessions for the day.

### 2.2 Now line

**`components/scheduling/NowLine.tsx`** — NEW
- Horizontal red line at current time's Y offset.
- `useEffect` setInterval(60_000) triggers a re-render via a `[tick, setTick]` state.
- Only renders in columns whose date === today (single day comparison in trainer tz).

**`components/scheduling/CalendarView.tsx`** — `DayColumn`
- Render `<NowLine />` inside the column when `isToday(date)`.

### 2.3 Sticky header + All-day section

**`components/scheduling/CalendarView.tsx`** — structure
- Wrap the time-grid scroll container so `DayHeader` is `position: sticky; top: 0; z-10` inside the overflow parent.
- Add an `AllDayRow` component rendered between header and grid — collapses to 0 height when empty.

**All-day flag — design decision:**
FD Session has no `is_all_day` field. Two options:
- **A (shipped now, recommended)**: derive all-day from `startAt == 00:00 && endAt == 23:59` local. No schema change. Matches behavior most PT tools use.
- **B (deferred)**: add `is_all_day` Check field to `FD Session` DocType JSON + repo normalizer + type. Clean but costs another ERPNext migrate.

**Plan ships A**, leaves a `// TODO: promote to DocType flag` note for B.

### 2.4 Natural Language Input

**`package.json`**
- Add `chrono-node` dependency.

**`components/scheduling/NaturalLanguageInput.tsx`** — NEW
- Controlled `<input>` with live parse preview underneath ("Meeting with John at 2pm tomorrow" → chip row: Client=John (match via fuzzy) · Date=Apr 25 · Time=14:00).
- On Enter: if parse is valid AND a client matched, call `buildPlanAction` + `bookPlanAction` (same flow as QuickAdd). Otherwise open QuickAddPopover pre-filled.
- Fuzzy-match helper: lowercase + trim + substring match against `clients`. Flag ambiguous matches with a "did you mean…" chip.

**`components/modules/ScheduleView.tsx`**
- Mount the input above the CalendarView, between sticky header and calendar card.

---

## Phase 3 — Power Features

### 3.1 Smart-Skip recurrence

**`lib/scheduling/engine.ts`** — `buildBookingPlan`
- Add `onConflict?: 'fail' | 'skip'` option (default `'fail'` to preserve current behavior).
- When `'skip'`: occurrences with `conflicts` or `outOfHours` are filtered OUT of `plan.occurrences` but recorded on `plan.summary.skipped` with reasons. `valid = occurrences.length > 0`.

**`actions/schedulingActions.ts`** — `buildPlanAction`
- Add `onConflict` to input, pass through.

**`components/scheduling/BookingPanel.tsx`**
- Add a toggle: "Skip conflicts" (default off). When on, the preview shows skipped rows greyed out. Book button stays enabled as long as ≥ 1 occurrence would book.

### 3.2 Keyboard shortcuts

**`hooks/useKeyboardShortcuts.ts`** — NEW
- Generic registration: `useKeyboardShortcuts({ t: goToday, w: setWeek, d: setDay, c: openQuickAdd })`.
- Ignores events when target is inside an `<input>`, `<textarea>`, or `contentEditable` element.

**`components/scheduling/CalendarView.tsx`**
- Wire shortcuts. `C` triggers "quick add at current time, today".

---

## Dependencies / schema changes

| Change | Location | Risk |
|---|---|---|
| `chrono-node` added | `package.json` | Low (~50KB gz) |
| `newDurationMinutes` on `rescheduleOne` | service/action | Low (optional field) |
| `onConflict` on `buildPlanAction` | action/engine | Low (default preserves existing behavior) |
| `is_all_day` on FD Session | **deferred** | Would require migrate |

No DocType changes in this plan. Backend surface grows by two optional fields on existing actions; no new actions added.

---

## File manifest (summary)

**New files**
- `components/scheduling/QuickAddPopover.tsx`
- `components/scheduling/MonthView.tsx`
- `components/scheduling/NowLine.tsx`
- `components/scheduling/NaturalLanguageInput.tsx`
- `hooks/useKeyboardShortcuts.ts`

**Modified files**
- `components/scheduling/CalendarView.tsx` — drag-select, DnD/resize, waterfall, month view switch, sticky header, all-day row, now line, keyboard hook
- `components/scheduling/BookingPanel.tsx` — skip-conflicts toggle, recognize pre-filled range from QuickAdd "more options"
- `components/modules/ScheduleView.tsx` — wire QuickAdd + NL input; optimistic state path for DnD/resize
- `lib/scheduling/engine.ts` — `onConflict` in plan builder
- `lib/scheduling/sessionService.ts` — `newDurationMinutes` in `rescheduleOne`
- `actions/schedulingActions.ts` — pass-through options
- `package.json` — `chrono-node`

---

## Ship order (for incremental review)

1. **1.3 Waterfall layout** — pure function, smallest blast radius, instant visual win.
2. **1.1 Drag-to-create + QuickAdd** — biggest UX leap.
3. **1.2 DnD reschedule + resize** — requires the optional service field.
4. **2.2 Now line** — tiny, self-contained.
5. **2.3 Sticky header + all-day (derived)**.
6. **2.1 Month view**.
7. **3.1 Smart-skip recurrence**.
8. **3.2 Keyboard shortcuts**.
9. **2.4 Natural language input** — last because it depends on QuickAdd.

Each step independently shippable; tests added per step; manual smoke per step.

---

## Verification

- `next build` must pass after each step (TS strict).
- After 1.1: drag a slot → QuickAdd opens → book → session appears optimistically.
- After 1.2: drag existing block to new column → ERPNext row reflects the move; drag bottom handle → endAt updated.
- After 1.3: two overlapping sessions render side-by-side at 50% each; three at 33% each.
- After 2.1: Month toggle renders 6×7 grid with session chips; click day → Day view.
- After 2.2: reload at 14:23 → red line at `(14*60+23 - 9*60) / 30 * slotHeight` px offset.
- After 3.1: book 4-week recurrence where week 2 conflicts → 3 sessions booked, 1 skipped shown in toast.
- After 3.2: press `T`, `W`, `D`, `C` — each behaves.
