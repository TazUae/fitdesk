import { describe, expect, it } from 'vitest'
import {
  classifySessionForDashboard,
  getTodayTimelineSections,
  getMoneySnapshot,
  getDashboardActionItems,
  getYesterdayRecap,
  buildTodayHeroSentence,
  getTodayCounts,
  buildHeaderStatus,
  resolveNextUp,
} from './derive'
import type { Client, Invoice } from '@/types'
import type { FDSession } from '@/types/scheduling'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Wednesday 2026-05-06 12:00 UTC
const NOW    = new Date('2026-05-06T12:00:00.000Z')
const NOW_MS = NOW.getTime()
const MIN    = 60_000
const HOUR   = 3_600_000
const DAY    = 86_400_000

function makeSession(opts: Partial<FDSession>): FDSession {
  const startAt = opts.startAt ?? NOW
  const endAt   = opts.endAt   ?? new Date(startAt.getTime() + HOUR)
  return {
    id:              'fd-' + Math.random(),
    tenantId:        '',
    trainerId:       't1',
    clientId:        'c1',
    clientName:      'Alice',
    seriesId:        null,
    startAt,
    endAt,
    durationMinutes: 60,
    timezone:        'UTC',
    status:          'scheduled',
    occurrenceKey:   null,
    occurrenceIndex: null,
    isOverride:      false,
    rate:            50,
    sessionType:     null,
    notes:           null,
    invoiceId:              null,
    version:                1,
    isTrialSession:         false,
    sessionConsumedPackage: false,
    ...opts,
  }
}

function makeInvoice(opts: Partial<Invoice>): Invoice {
  return {
    id:                `INV-${Math.random()}`,
    clientId:          'c1',
    clientName:        'Alice',
    trainerId:         't1',
    amount:            100,
    outstandingAmount: 100,
    currency:          'USD',
    status:            'sent',
    dueDate:           '2026-05-01',
    issuedAt:          '2026-05-01',
    ...opts,
  }
}

function makeClient(opts: Partial<Client>): Client {
  return {
    id:        'c1',
    name:      'Alice',
    createdAt: '2026-01-01',
    ...opts,
  }
}

// ─── classifySessionForDashboard ──────────────────────────────────────────────

describe('classifySessionForDashboard', () => {
  it('upcoming: start in the future', () => {
    const s = makeSession({ startAt: new Date(NOW_MS + HOUR), endAt: new Date(NOW_MS + 2 * HOUR) })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('upcoming')
  })

  it('in_progress: start ≤ now < end', () => {
    const s = makeSession({ startAt: new Date(NOW_MS - 30 * MIN), endAt: new Date(NOW_MS + 30 * MIN) })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('in_progress')
  })

  it('in_progress: start == now exactly', () => {
    const s = makeSession({ startAt: NOW, endAt: new Date(NOW_MS + HOUR) })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('in_progress')
  })

  it('needs_resolution: end ≤ now, still scheduled', () => {
    const s = makeSession({ startAt: new Date(NOW_MS - 2 * HOUR), endAt: new Date(NOW_MS - HOUR) })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('needs_resolution')
  })

  it('needs_resolution: end == now exactly', () => {
    const s = makeSession({ startAt: new Date(NOW_MS - HOUR), endAt: NOW })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('needs_resolution')
  })

  it('recently_finished: status completed', () => {
    const s = makeSession({ status: 'completed' })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('recently_finished')
  })

  it('cancelled: status cancelled', () => {
    const s = makeSession({ status: 'cancelled' })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('cancelled')
  })

  it('cancelled: status no_show', () => {
    const s = makeSession({ status: 'no_show' })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('cancelled')
  })

  it('cancelled: status skipped', () => {
    const s = makeSession({ status: 'skipped' })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('cancelled')
  })

  it('confirmed counts as active', () => {
    const s = makeSession({ status: 'confirmed', startAt: new Date(NOW_MS + HOUR), endAt: new Date(NOW_MS + 2 * HOUR) })
    expect(classifySessionForDashboard(s, NOW_MS)).toBe('upcoming')
  })
})

// ─── getTodayTimelineSections ─────────────────────────────────────────────────

describe('getTodayTimelineSections', () => {
  const TZ       = 'UTC'
  const TODAY    = '2026-05-06'
  // 08:00 UTC — in the past
  const S_PAST   = makeSession({ startAt: new Date('2026-05-06T07:00:00Z'), endAt: new Date('2026-05-06T08:00:00Z'), status: 'completed' })
  // 11:00–12:00 UTC — currently in progress
  const S_ACTIVE = makeSession({ startAt: new Date('2026-05-06T11:00:00Z'), endAt: new Date('2026-05-06T13:00:00Z'), status: 'scheduled' })
  // 14:00–15:00 UTC — next session
  const S_NEXT   = makeSession({ startAt: new Date('2026-05-06T14:00:00Z'), endAt: new Date('2026-05-06T15:00:00Z'), status: 'scheduled' })
  // 16:00–17:00 UTC — remaining
  const S_REM    = makeSession({ startAt: new Date('2026-05-06T16:00:00Z'), endAt: new Date('2026-05-06T17:00:00Z'), status: 'scheduled' })
  // Tomorrow — should be excluded
  const S_TMRW   = makeSession({ startAt: new Date('2026-05-07T10:00:00Z'), endAt: new Date('2026-05-07T11:00:00Z'), status: 'scheduled' })

  it('identifies in-progress, next, remaining, recently-finished', () => {
    const { inProgress, next, remainingToday, recentlyFinished } =
      getTodayTimelineSections([S_PAST, S_ACTIVE, S_NEXT, S_REM, S_TMRW], NOW_MS, TZ, TODAY)

    expect(inProgress?.id).toBe(S_ACTIVE.id)
    expect(next?.id).toBe(S_NEXT.id)
    expect(remainingToday.map(s => s.id)).toEqual([S_REM.id])
    expect(recentlyFinished.map(s => s.id)).toEqual([S_PAST.id])
  })

  it('excludes tomorrow sessions', () => {
    const { inProgress, next } =
      getTodayTimelineSections([S_TMRW], NOW_MS, TZ, TODAY)
    expect(inProgress).toBeNull()
    expect(next).toBeNull()
  })

  it('returns nulls for empty input', () => {
    const { inProgress, next, remainingToday, recentlyFinished } =
      getTodayTimelineSections([], NOW_MS, TZ, TODAY)
    expect(inProgress).toBeNull()
    expect(next).toBeNull()
    expect(remainingToday).toHaveLength(0)
    expect(recentlyFinished).toHaveLength(0)
  })

  it('caps recentlyFinished at 3', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({
        startAt: new Date(`2026-05-06T0${i}:00:00Z`),
        endAt:   new Date(`2026-05-06T0${i + 1}:00:00Z`) ,
        status:  'completed',
      }),
    )
    const { recentlyFinished } = getTodayTimelineSections(sessions, NOW_MS, TZ, TODAY)
    expect(recentlyFinished).toHaveLength(3)
  })

  it('picks the first in-progress when multiple overlap', () => {
    const s1 = makeSession({ startAt: new Date('2026-05-06T11:00:00Z'), endAt: new Date('2026-05-06T13:00:00Z'), status: 'scheduled' })
    const s2 = makeSession({ startAt: new Date('2026-05-06T11:30:00Z'), endAt: new Date('2026-05-06T12:30:00Z'), status: 'confirmed' })
    const { inProgress } = getTodayTimelineSections([s2, s1], NOW_MS, TZ, TODAY)
    expect(inProgress?.id).toBe(s1.id)
  })
})

// ─── getMoneySnapshot ─────────────────────────────────────────────────────────

describe('getMoneySnapshot', () => {
  it('sums outstanding amounts', () => {
    const invoices = [
      makeInvoice({ status: 'sent',           outstandingAmount: 100 }),
      makeInvoice({ status: 'overdue',         outstandingAmount:  50 }),
      makeInvoice({ status: 'partially_paid',  outstandingAmount:  25 }),
    ]
    const snap = getMoneySnapshot(invoices, '2026-05-01')
    expect(snap.toCollect).toBe(175)
    expect(snap.pendingCount).toBe(3)
  })

  it('excludes draft from outstanding', () => {
    const invoices = [makeInvoice({ status: 'draft', outstandingAmount: 200 })]
    const snap = getMoneySnapshot(invoices, '2026-05-01')
    expect(snap.toCollect).toBe(0)
    expect(snap.pendingCount).toBe(0)
  })

  it('sums paid invoices this month', () => {
    const invoices = [
      makeInvoice({ status: 'paid', issuedAt: '2026-05-03', amount: 120 }),
      makeInvoice({ status: 'paid', issuedAt: '2026-04-30', amount:  80 }), // last month
    ]
    const snap = getMoneySnapshot(invoices, '2026-05-01')
    expect(snap.collectedThisMonth).toBe(120)
  })

  it('uses first invoice currency', () => {
    const invoices = [makeInvoice({ currency: 'LBP', outstandingAmount: 500_000 })]
    expect(getMoneySnapshot(invoices, '2026-05-01').currency).toBe('LBP')
  })

  it('defaults to USD with no invoices', () => {
    const snap = getMoneySnapshot([], '2026-05-01')
    expect(snap.currency).toBe('USD')
    expect(snap.toCollect).toBe(0)
    expect(snap.collectedThisMonth).toBe(0)
    expect(snap.pendingCount).toBe(0)
  })
})

// ─── getDashboardActionItems ──────────────────────────────────────────────────

describe('getDashboardActionItems', () => {
  const baseInput = {
    sessions:          [] as FDSession[],
    invoices:          [] as Invoice[],
    lowBalanceClients: [] as Client[],
    clients:           [] as Client[],
    nowMs:             NOW_MS,
    tz:                'UTC',
    todayYmd:          '2026-05-06',
    whatsappConnected: false,
  }

  it('returns empty when nothing needs attention', () => {
    expect(getDashboardActionItems(baseInput)).toHaveLength(0)
  })

  it('needs_resolution items come before payment items', () => {
    const pastSession = makeSession({
      startAt: new Date(NOW_MS - 2 * HOUR),
      endAt:   new Date(NOW_MS - HOUR),
    })
    const invoice = makeInvoice({ status: 'sent', outstandingAmount: 100 })
    const items = getDashboardActionItems({
      ...baseInput,
      sessions: [pastSession],
      invoices: [invoice],
    })
    expect(items[0].kind).toBe('needs_resolution')
    expect(items[1].kind).toBe('payment')
  })

  it('groups all outstanding invoices into one payment item', () => {
    const invoices = [
      makeInvoice({ status: 'sent', outstandingAmount: 100 }),
      makeInvoice({ status: 'overdue', outstandingAmount: 50 }),
    ]
    const items = getDashboardActionItems({ ...baseInput, invoices })
    const payments = items.filter(i => i.kind === 'payment')
    expect(payments).toHaveLength(1)
    expect(payments[0].title).toContain('150')
  })

  it('attaches billingMode from clients lookup to sessionResolvable', () => {
    const pastSession = makeSession({
      clientId: 'pkg-client',
      startAt:  new Date(NOW_MS - 2 * HOUR),
      endAt:    new Date(NOW_MS - HOUR),
    })
    const pkgClient = makeClient({ id: 'pkg-client', billingMode: 'Package' })
    const items = getDashboardActionItems({
      ...baseInput,
      sessions: [pastSession],
      clients:  [pkgClient],
    })
    const item = items.find(i => i.kind === 'needs_resolution')
    expect(item?.sessionResolvable?.billingMode).toBe('Package')
  })

  it('reminder items only appear when WhatsApp is connected', () => {
    const inv = makeInvoice({ status: 'overdue', clientId: 'c1' })
    const noWa = getDashboardActionItems({ ...baseInput, invoices: [inv], whatsappConnected: false })
    const withWa = getDashboardActionItems({ ...baseInput, invoices: [inv], whatsappConnected: true })
    expect(noWa.filter(i => i.kind === 'reminder')).toHaveLength(0)
    expect(withWa.filter(i => i.kind === 'reminder')).toHaveLength(1)
  })

  it('low_package items appear for each low-balance client', () => {
    const clients = [
      makeClient({ id: 'c1', name: 'Alice', remainingSessions: 2 }),
      makeClient({ id: 'c2', name: 'Bob',   remainingSessions: 1 }),
    ]
    const items = getDashboardActionItems({ ...baseInput, lowBalanceClients: clients })
    expect(items.filter(i => i.kind === 'low_package')).toHaveLength(2)
  })
})

// ─── getYesterdayRecap ────────────────────────────────────────────────────────

describe('getYesterdayRecap', () => {
  const TZ    = 'UTC'
  const TODAY = '2026-05-06'

  it('counts sessions completed yesterday', () => {
    const sessions = [
      makeSession({ startAt: new Date('2026-05-05T09:00:00Z'), status: 'completed' }),
      makeSession({ startAt: new Date('2026-05-05T10:00:00Z'), status: 'completed' }),
    ]
    const recap = getYesterdayRecap(sessions, TZ, TODAY)
    expect(recap.completedYesterday).toBe(2)
    expect(recap.yesterdayYmd).toBe('2026-05-05')
  })

  it('excludes today\'s completed sessions', () => {
    const sessions = [
      makeSession({ startAt: new Date('2026-05-06T09:00:00Z'), status: 'completed' }), // today
      makeSession({ startAt: new Date('2026-05-05T09:00:00Z'), status: 'completed' }), // yesterday
    ]
    expect(getYesterdayRecap(sessions, TZ, TODAY).completedYesterday).toBe(1)
  })

  it('excludes non-completed sessions from yesterday', () => {
    const sessions = [
      makeSession({ startAt: new Date('2026-05-05T09:00:00Z'), status: 'cancelled' }),
      makeSession({ startAt: new Date('2026-05-05T10:00:00Z'), status: 'no_show' }),
      makeSession({ startAt: new Date('2026-05-05T11:00:00Z'), status: 'scheduled' }),
    ]
    expect(getYesterdayRecap(sessions, TZ, TODAY).completedYesterday).toBe(0)
  })

  it('resolves yesterday in the trainer timezone (Beirut boundary)', () => {
    // 2026-05-05 23:30 UTC is 2026-05-06 02:30 in Beirut (UTC+3) → counts as
    // "today" in Beirut, so it must NOT be counted as yesterday.
    const sessions = [
      makeSession({ startAt: new Date('2026-05-05T23:30:00Z'), status: 'completed' }),
    ]
    expect(getYesterdayRecap(sessions, 'Asia/Beirut', TODAY).completedYesterday).toBe(0)
    // Same instant IS yesterday in UTC.
    expect(getYesterdayRecap(sessions, 'UTC', TODAY).completedYesterday).toBe(1)
  })

  it('returns zero for empty input', () => {
    const recap = getYesterdayRecap([], TZ, TODAY)
    expect(recap.completedYesterday).toBe(0)
    expect(recap.yesterdayYmd).toBe('2026-05-05')
  })

  it('crosses month boundaries correctly', () => {
    const sessions = [makeSession({ startAt: new Date('2026-04-30T09:00:00Z'), status: 'completed' })]
    const recap = getYesterdayRecap(sessions, TZ, '2026-05-01')
    expect(recap.yesterdayYmd).toBe('2026-04-30')
    expect(recap.completedYesterday).toBe(1)
  })
})

// ─── buildTodayHeroSentence ───────────────────────────────────────────────────

describe('buildTodayHeroSentence', () => {
  const emptyMoney = { toCollect: 0, collectedThisMonth: 0, pendingCount: 0, currency: 'USD' }

  it('all-clear when nothing needs attention and no sessions today', () => {
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  0,
      money:       emptyMoney,
      inProgress:  null,
    })
    expect(sentence).toBe("You're all caught up")
  })

  it('includes session count', () => {
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  3,
      money:       emptyMoney,
      inProgress:  null,
    })
    expect(sentence).toContain('3 sessions today')
  })

  it('uses singular for one session', () => {
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  1,
      money:       emptyMoney,
      inProgress:  null,
    })
    expect(sentence).toContain('1 session today')
  })

  it('shows in-progress client name instead of count', () => {
    const s = makeSession({ clientName: 'Bob' })
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  2,
      money:       emptyMoney,
      inProgress:  s,
    })
    expect(sentence).toContain('Bob in progress')
    expect(sentence).not.toContain('sessions today')
  })

  it('includes money to collect', () => {
    const money = { ...emptyMoney, toCollect: 150, currency: 'USD' }
    const sentence = buildTodayHeroSentence({ actionItems: [], todayTotal: 0, money, inProgress: null })
    expect(sentence).toContain('$150 to collect')
  })

  it('includes needs-update count', () => {
    const s = makeSession({ startAt: new Date(NOW_MS - 2 * HOUR), endAt: new Date(NOW_MS - HOUR) })
    const items = getDashboardActionItems({
      sessions:          [s],
      invoices:          [],
      lowBalanceClients: [],
      clients:           [],
      nowMs:             NOW_MS,
      tz:                'UTC',
      todayYmd:          '2026-05-06',
      whatsappConnected: false,
    })
    const sentence = buildTodayHeroSentence({ actionItems: items, todayTotal: 0, money: emptyMoney, inProgress: null })
    expect(sentence).toContain('need an update')
  })

  it('combines all parts with ·', () => {
    const money = { ...emptyMoney, toCollect: 50, currency: 'USD' }
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  2,
      money,
      inProgress: null,
    })
    expect(sentence).toContain(' · ')
  })

  // ── Empty-day enrichment (optional inputs) ──────────────────────────────────

  it('empty day: mentions next session as "tomorrow" with first name', () => {
    const nextSession = makeSession({
      clientName: 'Yasmina Saab',
      startAt:    new Date('2026-05-07T09:00:00Z'),
      endAt:      new Date('2026-05-07T10:00:00Z'),
    })
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  0,
      money:       emptyMoney,
      inProgress:  null,
      nextSession,
      tz:          'UTC',
      todayYmd:    '2026-05-06',
    })
    expect(sentence).toContain('No sessions today')
    expect(sentence).toContain('next tomorrow at 09:00 with Yasmina')
    expect(sentence).not.toContain('Saab') // first name only
  })

  it('empty day: uses a dated label when next session is not tomorrow', () => {
    const nextSession = makeSession({
      clientName: 'Rami',
      startAt:    new Date('2026-05-11T08:00:00Z'),
      endAt:      new Date('2026-05-11T09:00:00Z'),
    })
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  0,
      money:       emptyMoney,
      inProgress:  null,
      nextSession,
      tz:          'UTC',
      todayYmd:    '2026-05-06',
    })
    expect(sentence).toContain('No sessions today')
    expect(sentence).not.toContain('tomorrow')
    expect(sentence).toMatch(/next .+ at 08:00 with Rami/)
  })

  it('empty day: falls back to yesterday recap when no next session', () => {
    const sentence = buildTodayHeroSentence({
      actionItems:        [],
      todayTotal:         0,
      money:              emptyMoney,
      inProgress:         null,
      completedYesterday: 2,
    })
    expect(sentence).toContain('you completed 2 sessions yesterday')
  })

  it('empty day: singular yesterday recap', () => {
    const sentence = buildTodayHeroSentence({
      actionItems:        [],
      todayTotal:         0,
      money:              emptyMoney,
      inProgress:         null,
      completedYesterday: 1,
    })
    expect(sentence).toContain('you completed 1 session yesterday')
  })

  it('empty day: prefers next session over yesterday recap', () => {
    const nextSession = makeSession({
      clientName: 'Maya',
      startAt:    new Date('2026-05-07T06:00:00Z'),
      endAt:      new Date('2026-05-07T07:00:00Z'),
    })
    const sentence = buildTodayHeroSentence({
      actionItems:        [],
      todayTotal:         0,
      money:              emptyMoney,
      inProgress:         null,
      nextSession,
      completedYesterday: 2,
      tz:                 'UTC',
      todayYmd:           '2026-05-06',
    })
    expect(sentence).toContain('next tomorrow at 06:00 with Maya')
    expect(sentence).not.toContain('yesterday')
  })

  it('empty day: still all-clear when no optional context provided', () => {
    const sentence = buildTodayHeroSentence({
      actionItems: [],
      todayTotal:  0,
      money:       emptyMoney,
      inProgress:  null,
      completedYesterday: 0,
    })
    expect(sentence).toBe("You're all caught up")
  })
})

// ─── getTodayCounts ───────────────────────────────────────────────────────────

describe('getTodayCounts', () => {
  const TODAY_YMD = '2026-05-06'
  const TZ        = 'UTC'

  it('empty day: all zeros', () => {
    expect(getTodayCounts([], TZ, TODAY_YMD)).toEqual({ total: 0, completed: 0, remaining: 0 })
  })

  it('empty day with future upcoming session: zeros (future session not counted)', () => {
    const future = makeSession({
      startAt: new Date('2026-05-07T09:00:00Z'),
      endAt:   new Date('2026-05-07T10:00:00Z'),
      status:  'scheduled',
    })
    expect(getTodayCounts([future], TZ, TODAY_YMD)).toEqual({ total: 0, completed: 0, remaining: 0 })
  })

  it('active day: scheduled and confirmed count as remaining', () => {
    const s1 = makeSession({ startAt: new Date('2026-05-06T08:00:00Z'), endAt: new Date('2026-05-06T09:00:00Z'), status: 'scheduled' })
    const s2 = makeSession({ startAt: new Date('2026-05-06T10:00:00Z'), endAt: new Date('2026-05-06T11:00:00Z'), status: 'confirmed' })
    expect(getTodayCounts([s1, s2], TZ, TODAY_YMD)).toEqual({ total: 2, completed: 0, remaining: 2 })
  })

  it('active day with completed + remaining', () => {
    const done = makeSession({ startAt: new Date('2026-05-06T08:00:00Z'), endAt: new Date('2026-05-06T09:00:00Z'), status: 'completed' })
    const next = makeSession({ startAt: new Date('2026-05-06T10:00:00Z'), endAt: new Date('2026-05-06T11:00:00Z'), status: 'scheduled' })
    expect(getTodayCounts([done, next], TZ, TODAY_YMD)).toEqual({ total: 2, completed: 1, remaining: 1 })
  })

  it('cancelled/no_show/skipped are excluded from total/remaining', () => {
    const cancelled = makeSession({ startAt: new Date('2026-05-06T08:00:00Z'), status: 'cancelled' })
    const noShow    = makeSession({ startAt: new Date('2026-05-06T09:00:00Z'), status: 'no_show' })
    const skipped   = makeSession({ startAt: new Date('2026-05-06T10:00:00Z'), status: 'skipped' })
    const good      = makeSession({ startAt: new Date('2026-05-06T11:00:00Z'), status: 'scheduled' })
    expect(getTodayCounts([cancelled, noShow, skipped, good], TZ, TODAY_YMD)).toEqual({ total: 1, completed: 0, remaining: 1 })
  })

  it('all-done day: only completed', () => {
    const d1 = makeSession({ startAt: new Date('2026-05-06T08:00:00Z'), status: 'completed' })
    const d2 = makeSession({ startAt: new Date('2026-05-06T09:00:00Z'), status: 'completed' })
    expect(getTodayCounts([d1, d2], TZ, TODAY_YMD)).toEqual({ total: 2, completed: 2, remaining: 0 })
  })
})

// ─── buildHeaderStatus ────────────────────────────────────────────────────────

describe('buildHeaderStatus', () => {
  it('empty day', () => {
    expect(buildHeaderStatus({ total: 0, completed: 0, remaining: 0 }))
      .toBe('0 sessions today · All caught up')
  })

  it('1 session today, not started', () => {
    expect(buildHeaderStatus({ total: 1, completed: 0, remaining: 1 }))
      .toBe('1 session today · 1 remaining')
  })

  it('3 sessions: 1 done, 2 remaining', () => {
    expect(buildHeaderStatus({ total: 3, completed: 1, remaining: 2 }))
      .toBe('3 sessions today · 1 completed · 2 remaining')
  })

  it('all done today', () => {
    expect(buildHeaderStatus({ total: 2, completed: 2, remaining: 0 }))
      .toBe('2 sessions today · 2 completed')
  })
})

// ─── resolveNextUp ────────────────────────────────────────────────────────────

describe('resolveNextUp', () => {
  const HOUR = 3_600_000
  const futureSession = makeSession({
    clientId:   'c2',
    clientName: 'Bob',
    startAt:    new Date('2026-05-07T09:00:00Z'),
    endAt:      new Date('2026-05-07T10:00:00Z'),
    status:     'scheduled',
  })
  const inProgressSession = makeSession({
    clientId:   'c1',
    clientName: 'Alice',
    startAt:    new Date(NOW_MS - 30 * 60_000),
    endAt:      new Date(NOW_MS + 30 * 60_000),
    status:     'scheduled',
  })
  const nextTodaySession = makeSession({
    clientId:   'c1',
    clientName: 'Alice',
    startAt:    new Date(NOW_MS + HOUR),
    endAt:      new Date(NOW_MS + 2 * HOUR),
    status:     'scheduled',
  })
  const completedSession = makeSession({
    clientId:   'c1',
    clientName: 'Alice',
    startAt:    new Date(NOW_MS - 2 * HOUR),
    endAt:      new Date(NOW_MS - HOUR),
    status:     'completed',
  })
  const clientWithBilling = makeClient({ id: 'c1', billingMode: 'Package', remainingSessions: 3 })
  const clientWithoutBilling = makeClient({ id: 'c1' })

  const baseInput = {
    inProgress:       null,
    nextToday:        null,
    remainingToday:   [],
    recentlyFinished: [],
    nextFuture:       null,
    clients:          [],
    todayTotal:       0,
  }

  it('mode=none when no sessions exist', () => {
    const result = resolveNextUp(baseInput)
    expect(result.mode).toBe('none')
    expect(result.session).toBeNull()
  })

  it('mode=next_future: empty day with upcoming session', () => {
    const result = resolveNextUp({ ...baseInput, nextFuture: futureSession, clients: [makeClient({ id: 'c2' })] })
    expect(result.mode).toBe('next_future')
    expect(result.session?.clientName).toBe('Bob')
  })

  it('mode=none: empty day with no upcoming sessions', () => {
    const result = resolveNextUp(baseInput)
    expect(result.mode).toBe('none')
  })

  it('mode=in_progress: in-progress takes highest priority', () => {
    const result = resolveNextUp({
      ...baseInput,
      inProgress:  inProgressSession,
      nextToday:   nextTodaySession,
      nextFuture:  futureSession,
      clients:     [clientWithBilling],
    })
    expect(result.mode).toBe('in_progress')
    expect(result.session?.clientName).toBe('Alice')
  })

  it('mode=next_today: no in-progress but next today exists', () => {
    const result = resolveNextUp({
      ...baseInput,
      nextToday:  nextTodaySession,
      nextFuture: futureSession,
      clients:    [clientWithBilling],
    })
    expect(result.mode).toBe('next_today')
    expect(result.session?.clientName).toBe('Alice')
  })

  it('mode=all_done_future: finished today sessions + future session', () => {
    const result = resolveNextUp({
      ...baseInput,
      recentlyFinished: [completedSession],
      nextFuture:       futureSession,
      clients:          [makeClient({ id: 'c2' })],
    })
    expect(result.mode).toBe('all_done_future')
    expect(result.session?.clientName).toBe('Bob')
  })

  it('billing chip attached when client has billingMode', () => {
    const result = resolveNextUp({
      ...baseInput,
      nextToday: nextTodaySession,
      clients:   [clientWithBilling],
    })
    expect(result.billingMode).toBe('Package')
    expect(result.remainingSessions).toBe(3)
  })

  it('billing chip safely omitted when client not in clients array', () => {
    const result = resolveNextUp({
      ...baseInput,
      nextToday: nextTodaySession,
      clients:   [], // no matching client
    })
    expect(result.billingMode).toBeNull()
    expect(result.remainingSessions).toBeNull()
  })

  it('billing chip safely omitted when billingMode is undefined', () => {
    const result = resolveNextUp({
      ...baseInput,
      nextToday: nextTodaySession,
      clients:   [clientWithoutBilling],
    })
    expect(result.billingMode).toBeNull()
  })
})
