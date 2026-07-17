import { describe, expect, it } from 'vitest'
import {
  getNextUp,
  getTodaySections,
  getMoneySnapshot,
  getUpcoming,
  getAttentionItems,
  getUnresolvedSessions,
  getUnresolvedSessionAttentionItems,
  getMissingNextSessionAttentionItems,
  combineAttentionItems,
  formatOverflowLabel,
  getSessionsThisWeek,
} from './derive'
import type { AttentionItem } from './derive'
import type { Session, Invoice, Client } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY    = '2024-06-08'
const TOMORROW = '2024-06-09'
const FUTURE   = '2024-06-15'
const PAST     = '2024-06-01'
const MONTH_START = '2024-06-01'

function makeSession(partial: Partial<Session> & { id: string }): Session {
  return {
    clientId:   'C1',
    clientName: 'Alice',
    trainerId:  'T1',
    date:       TODAY,
    status:     'scheduled',
    createdAt:  '2024-01-01',
    ...partial,
  }
}

function makeInvoice(partial: Partial<Invoice> & { id: string }): Invoice {
  return {
    clientId:          'C1',
    clientName:        'Alice',
    trainerId:         'T1',
    amount:            100,
    outstandingAmount: 100,
    currency:          'USD',
    status:            'sent',
    dueDate:           TODAY,
    issuedAt:          TODAY,
    ...partial,
  }
}

function makeClient(partial: Partial<Client> & { id: string }): Client {
  return {
    firstName:    'Alice',
    name:         'Alice',
    phone:        '+15550000',
    status:       'active',
    trainerId:    'T1',
    sessionCount: 1,
    createdAt:    '2024-01-01',
    ...partial,
  }
}

// ─── getNextUp ────────────────────────────────────────────────────────────────

describe('getNextUp', () => {
  it('returns null when there are no sessions', () => {
    expect(getNextUp([], TODAY)).toBeNull()
  })

  it('returns null when all sessions are cancelled or completed', () => {
    const sessions = [
      makeSession({ id: 'S1', status: 'cancelled', date: TODAY }),
      makeSession({ id: 'S2', status: 'completed', date: TODAY }),
    ]
    expect(getNextUp(sessions, TODAY)).toBeNull()
  })

  it('returns null when only past sessions exist', () => {
    const sessions = [
      makeSession({ id: 'S1', status: 'scheduled', date: PAST }),
    ]
    expect(getNextUp(sessions, TODAY)).toBeNull()
  })

  it('returns the earliest upcoming scheduled session today', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, time: '14:00' }),
      makeSession({ id: 'S2', date: TODAY, time: '09:00' }),
    ]
    const result = getNextUp(sessions, TODAY)
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe('S2')
    expect(result!.isToday).toBe(true)
    expect(result!.label).toContain('Today')
    expect(result!.label).toContain('9:00 AM')
  })

  it('returns a future session on an empty today', () => {
    const sessions = [
      makeSession({ id: 'S1', date: FUTURE, time: '10:00' }),
    ]
    const result = getNextUp(sessions, TODAY)
    expect(result).not.toBeNull()
    expect(result!.isToday).toBe(false)
  })

  it('prefers today over a future session', () => {
    const sessions = [
      makeSession({ id: 'S1', date: FUTURE, time: '08:00' }),
      makeSession({ id: 'S2', date: TODAY,  time: '17:00' }),
    ]
    const result = getNextUp(sessions, TODAY)
    expect(result!.session.id).toBe('S2')
    expect(result!.isToday).toBe(true)
  })

  it('includes duration in the label when present', () => {
    const sessions = [makeSession({ id: 'S1', date: TODAY, time: '09:00', durationMinutes: 60 })]
    const result = getNextUp(sessions, TODAY)
    expect(result!.label).toContain('60 min')
  })

  // ── nowTime (time-of-day awareness) ─────────────────────────────────────────

  it('excludes a past scheduled session today when nowTime is passed', () => {
    const sessions = [makeSession({ id: 'S1', date: TODAY, time: '09:00' })]
    expect(getNextUp(sessions, TODAY, '11:00')).toBeNull()
  })

  it('keeps a future-time session today eligible when nowTime is passed', () => {
    const sessions = [makeSession({ id: 'S1', date: TODAY, time: '14:00' })]
    const result = getNextUp(sessions, TODAY, '11:00')
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe('S1')
  })

  it('picks the next future-time session today when an earlier one is past, given nowTime', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, time: '09:00' }),
      makeSession({ id: 'S2', date: TODAY, time: '14:00' }),
    ]
    const result = getNextUp(sessions, TODAY, '11:00')
    expect(result!.session.id).toBe('S2')
  })

  it('still returns a past-time session today when nowTime is omitted (2-arg backward compatibility)', () => {
    const sessions = [makeSession({ id: 'S1', date: TODAY, time: '09:00' })]
    const result = getNextUp(sessions, TODAY)
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe('S1')
  })

  it('does not exclude a today session with no time when nowTime is passed', () => {
    const sessions = [makeSession({ id: 'S1', date: TODAY, time: undefined })]
    const result = getNextUp(sessions, TODAY, '11:00')
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe('S1')
  })

  it('keeps a future-dated session eligible when nowTime is passed', () => {
    const sessions = [makeSession({ id: 'S1', date: FUTURE, time: '08:00' })]
    const result = getNextUp(sessions, TODAY, '23:00')
    expect(result).not.toBeNull()
    expect(result!.session.id).toBe('S1')
  })
})

// ─── getTodaySections ─────────────────────────────────────────────────────────

describe('getTodaySections', () => {
  it('returns empty arrays on an empty session list', () => {
    const { upcoming, completed } = getTodaySections([], TODAY)
    expect(upcoming).toHaveLength(0)
    expect(completed).toHaveLength(0)
  })

  it('returns only today\'s scheduled sessions as upcoming', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY,    status: 'scheduled' }),
      makeSession({ id: 'S2', date: TOMORROW, status: 'scheduled' }),
      makeSession({ id: 'S3', date: TODAY,    status: 'completed' }),
    ]
    const { upcoming, completed } = getTodaySections(sessions, TODAY)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].id).toBe('S1')
    expect(completed).toHaveLength(1)
    expect(completed[0].id).toBe('S3')
  })

  it('sorts upcoming by time asc and completed by time desc', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, time: '14:00', status: 'scheduled' }),
      makeSession({ id: 'S2', date: TODAY, time: '09:00', status: 'scheduled' }),
      makeSession({ id: 'S3', date: TODAY, time: '16:00', status: 'completed' }),
      makeSession({ id: 'S4', date: TODAY, time: '11:00', status: 'completed' }),
    ]
    const { upcoming, completed } = getTodaySections(sessions, TODAY)
    expect(upcoming[0].id).toBe('S2')
    expect(upcoming[1].id).toBe('S1')
    expect(completed[0].id).toBe('S3')
    expect(completed[1].id).toBe('S4')
  })

  it('caps completed at 3', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ id: `S${i}`, date: TODAY, status: 'completed', time: `${9 + i}:00` }),
    )
    const { completed } = getTodaySections(sessions, TODAY)
    expect(completed).toHaveLength(3)
  })
})

// ─── getMoneySnapshot ─────────────────────────────────────────────────────────

describe('getMoneySnapshot', () => {
  it('returns zero amounts on empty invoice list', () => {
    const snap = getMoneySnapshot([], MONTH_START)
    expect(snap.outstandingAmount).toBe(0)
    expect(snap.overdueCount).toBe(0)
    expect(snap.monthlyRevenue).toBe(0)
    expect(snap.currency).toBe('USD')
  })

  it('counts outstanding as 0 when all invoices are paid', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'paid', outstandingAmount: 0 })]
    const snap = getMoneySnapshot(invoices, MONTH_START)
    expect(snap.outstandingAmount).toBe(0)
    expect(snap.overdueCount).toBe(0)
  })

  it('counts sent invoices as outstanding', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'sent', outstandingAmount: 200 })]
    const snap = getMoneySnapshot(invoices, MONTH_START)
    expect(snap.outstandingAmount).toBe(200)
  })

  it('counts partially_paid invoices as outstanding', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'partially_paid', outstandingAmount: 75 })]
    const snap = getMoneySnapshot(invoices, MONTH_START)
    expect(snap.outstandingAmount).toBe(75)
  })

  it('sums outstanding across overdue + sent + partially_paid', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'overdue',       outstandingAmount: 100 }),
      makeInvoice({ id: 'I2', status: 'sent',          outstandingAmount: 50  }),
      makeInvoice({ id: 'I3', status: 'partially_paid', outstandingAmount: 30 }),
      makeInvoice({ id: 'I4', status: 'paid',          outstandingAmount: 0   }),
    ]
    const snap = getMoneySnapshot(invoices, MONTH_START)
    expect(snap.outstandingAmount).toBe(180)
    expect(snap.overdueCount).toBe(1)
  })

  it('calculates monthly revenue from paid invoices in the month', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'paid', amount: 150, outstandingAmount: 0, issuedAt: TODAY }),
      makeInvoice({ id: 'I2', status: 'paid', amount: 100, outstandingAmount: 0, issuedAt: '2024-05-31' }),
    ]
    const snap = getMoneySnapshot(invoices, MONTH_START)
    expect(snap.monthlyRevenue).toBe(150)
  })
})

// ─── getUpcoming ──────────────────────────────────────────────────────────────

describe('getUpcoming', () => {
  it('returns empty on no sessions', () => {
    expect(getUpcoming([], TODAY)).toHaveLength(0)
  })

  it('excludes today and past sessions', () => {
    const sessions = [
      makeSession({ id: 'S1', date: PAST,    status: 'scheduled' }),
      makeSession({ id: 'S2', date: TODAY,   status: 'scheduled' }),
      makeSession({ id: 'S3', date: TOMORROW, status: 'scheduled' }),
    ]
    const result = getUpcoming(sessions, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('S3')
  })

  it('caps at the limit (default 3)', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ id: `S${i}`, date: FUTURE, time: `${9 + i}:00` }),
    )
    expect(getUpcoming(sessions, TODAY)).toHaveLength(3)
    expect(getUpcoming(sessions, TODAY, 5)).toHaveLength(5)
  })

  it('excludes cancelled and completed future sessions', () => {
    const sessions = [
      makeSession({ id: 'S1', date: FUTURE, status: 'cancelled' }),
      makeSession({ id: 'S2', date: FUTURE, status: 'completed' }),
      makeSession({ id: 'S3', date: FUTURE, status: 'scheduled' }),
    ]
    const result = getUpcoming(sessions, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('S3')
  })
})

// ─── getAttentionItems ────────────────────────────────────────────────────────

// Fixed reference date for deterministic ageDays calculations.
const REF_DATE = '2024-06-15'

describe('getAttentionItems', () => {
  it('returns empty array when invoice list is empty', () => {
    expect(getAttentionItems([], REF_DATE)).toHaveLength(0)
  })

  it('returns empty array when all invoices are paid, draft, or cancelled', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'paid' }),
      makeInvoice({ id: 'I2', status: 'draft' }),
      makeInvoice({ id: 'I3', status: 'cancelled' }),
    ]
    expect(getAttentionItems(invoices, REF_DATE)).toHaveLength(0)
  })

  // ── overdue_invoice items ──────────────────────────────────────────────────

  it('returns one overdue_invoice item per overdue invoice', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'overdue', dueDate: '2024-06-10' }),
      makeInvoice({ id: 'I2', status: 'overdue', dueDate: '2024-06-05' }),
    ]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items).toHaveLength(2)
    expect(items.every(i => i.type === 'overdue_invoice')).toBe(true)
  })

  it('maps href to /dashboard/invoices/{id}', () => {
    const invoices = [makeInvoice({ id: 'I42', status: 'overdue', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].href).toBe('/dashboard/invoices/I42')
  })

  it('maps clientName from the invoice', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'overdue', clientName: 'Sara K.', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].clientName).toBe('Sara K.')
  })

  it('maps outstandingAmount and currency', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'overdue', outstandingAmount: 250, currency: 'USD', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].outstandingAmount).toBe(250)
    expect(items[0].currency).toBe('USD')
  })

  it('calculates ageDays from dueDate vs today', () => {
    // REF_DATE = 2024-06-15, dueDate = 2024-06-10 → 5 days
    const invoices = [makeInvoice({ id: 'I1', status: 'overdue', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].ageDays).toBe(5)
  })

  it('assigns severity "high" for invoices >= 14 days overdue', () => {
    // 2024-06-15 - 2024-06-01 = 14 days → high
    const invoices = [makeInvoice({ id: 'I1', status: 'overdue', dueDate: '2024-06-01' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].severity).toBe('high')
  })

  it('assigns severity "normal" for invoices < 14 days overdue', () => {
    // 2024-06-15 - 2024-06-03 = 12 days → normal
    const invoices = [makeInvoice({ id: 'I1', status: 'overdue', dueDate: '2024-06-03' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].severity).toBe('normal')
  })

  it('orders overdue by oldest dueDate first', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'overdue', dueDate: '2024-06-10' }),
      makeInvoice({ id: 'I2', status: 'overdue', dueDate: '2024-06-03' }),
      makeInvoice({ id: 'I3', status: 'overdue', dueDate: '2024-06-07' }),
    ]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items.map(i => i.href)).toEqual([
      '/dashboard/invoices/I2',
      '/dashboard/invoices/I3',
      '/dashboard/invoices/I1',
    ])
  })

  it('breaks ties in dueDate by larger outstandingAmount first', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'overdue', dueDate: '2024-06-10', outstandingAmount: 50 }),
      makeInvoice({ id: 'I2', status: 'overdue', dueDate: '2024-06-10', outstandingAmount: 200 }),
    ]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].href).toBe('/dashboard/invoices/I2')
    expect(items[1].href).toBe('/dashboard/invoices/I1')
  })

  it('caps at 4 items without overflow when exactly 4 overdue', () => {
    const invoices = Array.from({ length: 4 }, (_, i) =>
      makeInvoice({ id: `I${i}`, status: 'overdue', dueDate: `2024-06-0${i + 1}` }),
    )
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items).toHaveLength(4)
    expect(items.every(i => i.type === 'overdue_invoice')).toBe(true)
  })

  it('appends invoice_overflow item when more than 4 overdue', () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makeInvoice({ id: `I${i}`, status: 'overdue', dueDate: `2024-06-0${i + 1}` }),
    )
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items).toHaveLength(5)
    const overflow = items[4]
    expect(overflow.type).toBe('invoice_overflow')
    expect(overflow.href).toBe('/dashboard/invoices')
    expect(overflow.label).toContain('+2')
  })

  it('overflow label is singular when exactly 1 extra', () => {
    const invoices = Array.from({ length: 5 }, (_, i) =>
      makeInvoice({ id: `I${i}`, status: 'overdue', dueDate: `2024-06-0${i + 1}` }),
    )
    const items = getAttentionItems(invoices, REF_DATE)
    const overflow = items[4]
    expect(overflow.label).toMatch(/\+1 more invoice\b(?!s)/)
  })

  // ── pending_invoice items ──────────────────────────────────────────────────

  it('sent invoice appears as pending_invoice item (a)', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'sent', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('pending_invoice')
    expect(items[0].href).toBe('/dashboard/invoices/I1')
  })

  it('partially_paid invoice appears as pending_invoice item (b)', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'partially_paid', outstandingAmount: 60, dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('pending_invoice')
    expect(items[0].outstandingAmount).toBe(60)
  })

  it('pending_invoice maps clientName, outstandingAmount, and currency', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'sent', clientName: 'Bob T.', outstandingAmount: 80, currency: 'USD', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].clientName).toBe('Bob T.')
    expect(items[0].outstandingAmount).toBe(80)
    expect(items[0].currency).toBe('USD')
  })

  it('pending_invoice has no ageDays or severity', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'sent', dueDate: '2024-06-10' })]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].ageDays).toBeUndefined()
    expect(items[0].severity).toBeUndefined()
  })

  it('overdue items appear before pending_invoice items (c)', () => {
    const invoices = [
      makeInvoice({ id: 'P1', status: 'sent',    dueDate: '2024-06-01' }),
      makeInvoice({ id: 'O1', status: 'overdue', dueDate: '2024-06-10' }),
    ]
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items[0].type).toBe('overdue_invoice')
    expect(items[0].href).toBe('/dashboard/invoices/O1')
    expect(items[1].type).toBe('pending_invoice')
    expect(items[1].href).toBe('/dashboard/invoices/P1')
  })

  it('paid, draft, and cancelled invoices are excluded (d)', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'paid' }),
      makeInvoice({ id: 'I2', status: 'draft' }),
      makeInvoice({ id: 'I3', status: 'cancelled' }),
    ]
    expect(getAttentionItems(invoices, REF_DATE)).toHaveLength(0)
  })

  it('combined overdue + pending overflow fires as invoice_overflow (e)', () => {
    const invoices = [
      makeInvoice({ id: 'O1', status: 'overdue', dueDate: '2024-06-01' }),
      makeInvoice({ id: 'O2', status: 'overdue', dueDate: '2024-06-02' }),
      makeInvoice({ id: 'O3', status: 'overdue', dueDate: '2024-06-03' }),
      makeInvoice({ id: 'P1', status: 'sent',    dueDate: '2024-06-04' }),
      makeInvoice({ id: 'P2', status: 'sent',    dueDate: '2024-06-05' }),
    ]
    const items = getAttentionItems(invoices, REF_DATE)
    // 4 visible (3 overdue + 1 pending) + 1 overflow
    expect(items).toHaveLength(5)
    expect(items[0].type).toBe('overdue_invoice')
    expect(items[3].type).toBe('pending_invoice')
    const overflow = items[4]
    expect(overflow.type).toBe('invoice_overflow')
    expect(overflow.label).toContain('+1')
    expect(overflow.href).toBe('/dashboard/invoices')
  })
})

// ─── getUnresolvedSessions (US-057) ────────────────────────────────────────────

describe('getUnresolvedSessions', () => {
  it('returns empty array when there are no sessions', () => {
    expect(getUnresolvedSessions([], TODAY)).toEqual([])
  })

  it('includes a past scheduled session', () => {
    const s = makeSession({ id: 'S1', date: PAST, status: 'scheduled' })
    const result = getUnresolvedSessions([s], TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].session.id).toBe('S1')
  })

  it('excludes a future scheduled session', () => {
    const s = makeSession({ id: 'S1', date: FUTURE, status: 'scheduled' })
    expect(getUnresolvedSessions([s], TODAY)).toEqual([])
  })

  it('excludes a completed session even if in the past', () => {
    const s = makeSession({ id: 'S1', date: PAST, status: 'completed' })
    expect(getUnresolvedSessions([s], TODAY)).toEqual([])
  })

  it('excludes a cancelled session even if in the past', () => {
    const s = makeSession({ id: 'S1', date: PAST, status: 'cancelled' })
    expect(getUnresolvedSessions([s], TODAY)).toEqual([])
  })

  it('excludes a missed (no-show) session even if in the past', () => {
    const s = makeSession({ id: 'S1', date: PAST, status: 'missed' })
    expect(getUnresolvedSessions([s], TODAY)).toEqual([])
  })

  it('excludes a today session scheduled later than nowTime', () => {
    const s = makeSession({ id: 'S1', date: TODAY, time: '18:00', status: 'scheduled' })
    expect(getUnresolvedSessions([s], TODAY, '09:00')).toEqual([])
  })

  it('includes a today session scheduled earlier than nowTime', () => {
    const s = makeSession({ id: 'S1', date: TODAY, time: '08:00', status: 'scheduled' })
    const result = getUnresolvedSessions([s], TODAY, '09:00')
    expect(result).toHaveLength(1)
  })

  it('excludes a today session when nowTime is omitted (cannot determine if it has passed)', () => {
    const s = makeSession({ id: 'S1', date: TODAY, time: '08:00', status: 'scheduled' })
    expect(getUnresolvedSessions([s], TODAY)).toEqual([])
  })

  it('excludes a today session with no time even when nowTime is passed', () => {
    const s = makeSession({ id: 'S1', date: TODAY, status: 'scheduled' })
    expect(getUnresolvedSessions([s], TODAY, '23:59')).toEqual([])
  })

  it('sorts oldest-first', () => {
    const sessions = [
      makeSession({ id: 'S-recent', date: '2024-06-05', status: 'scheduled' }),
      makeSession({ id: 'S-oldest', date: '2024-06-01', status: 'scheduled' }),
      makeSession({ id: 'S-mid',    date: '2024-06-03', status: 'scheduled' }),
    ]
    const result = getUnresolvedSessions(sessions, TODAY)
    expect(result.map(r => r.session.id)).toEqual(['S-oldest', 'S-mid', 'S-recent'])
  })

  it('computes daysOverdue relative to today', () => {
    const s = makeSession({ id: 'S1', date: '2024-06-01', status: 'scheduled' })
    const result = getUnresolvedSessions([s], TODAY)
    expect(result[0].daysOverdue).toBe(7) // 2024-06-08 - 2024-06-01
  })

  it('a today, past-time session has daysOverdue 0', () => {
    const s = makeSession({ id: 'S1', date: TODAY, time: '08:00', status: 'scheduled' })
    const result = getUnresolvedSessions([s], TODAY, '09:00')
    expect(result[0].daysOverdue).toBe(0)
  })

  it('mixed batch: only unresolved sessions are returned, others excluded', () => {
    const sessions = [
      makeSession({ id: 'S-unresolved-1', date: PAST, status: 'scheduled' }),
      makeSession({ id: 'S-completed',    date: PAST, status: 'completed' }),
      makeSession({ id: 'S-future',       date: FUTURE, status: 'scheduled' }),
      makeSession({ id: 'S-unresolved-2', date: '2024-06-03', status: 'scheduled' }),
      makeSession({ id: 'S-cancelled',    date: PAST, status: 'cancelled' }),
    ]
    const result = getUnresolvedSessions(sessions, TODAY)
    expect(result.map(r => r.session.id)).toEqual(['S-unresolved-1', 'S-unresolved-2'])
  })
})

// ─── getUnresolvedSessionAttentionItems (US-003) ───────────────────────────────

describe('getUnresolvedSessionAttentionItems', () => {
  it('returns empty array for no unresolved sessions', () => {
    expect(getUnresolvedSessionAttentionItems([])).toEqual([])
  })

  it('maps an unresolved session to an attention item', () => {
    const s = makeSession({ id: 'S1', clientName: 'Bob', date: PAST })
    const result = getUnresolvedSessionAttentionItems([{ session: s, daysOverdue: 7 }])
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('unresolved_session')
    expect(result[0].clientName).toBe('Bob')
    expect(result[0].label).toContain('Bob')
    expect(result[0].label).toContain('7 days ago')
    expect(result[0].href).toBe('/dashboard/schedule')
  })

  it('singularizes "1 day ago"', () => {
    const s = makeSession({ id: 'S1', clientName: 'Bob', date: PAST })
    const result = getUnresolvedSessionAttentionItems([{ session: s, daysOverdue: 1 }])
    expect(result[0].label).toContain('1 day ago')
    expect(result[0].label).not.toContain('1 days ago')
  })

  it('omits the "days ago" suffix for daysOverdue 0', () => {
    const s = makeSession({ id: 'S1', clientName: 'Bob', date: TODAY })
    const result = getUnresolvedSessionAttentionItems([{ session: s, daysOverdue: 0 }])
    expect(result[0].label).not.toContain('days ago')
    expect(result[0].label).not.toContain('day ago')
  })

  it('caps at 4 with an overflow item', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      session:     makeSession({ id: `S${i}`, clientName: `Client${i}`, date: PAST }),
      daysOverdue: i + 1,
    }))
    const result = getUnresolvedSessionAttentionItems(items)
    expect(result).toHaveLength(5) // 4 visible + 1 overflow
    expect(result[4].label).toContain('+2 more')
  })

  it('does not append an overflow item at exactly the cap', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      session:     makeSession({ id: `S${i}`, clientName: `Client${i}`, date: PAST }),
      daysOverdue: i + 1,
    }))
    const result = getUnresolvedSessionAttentionItems(items)
    expect(result).toHaveLength(4)
  })
})

// ─── getMissingNextSessionAttentionItems (US-003) ──────────────────────────────

describe('getMissingNextSessionAttentionItems', () => {
  it('returns empty array with no clients', () => {
    expect(getMissingNextSessionAttentionItems([], [], TODAY)).toEqual([])
  })

  it('excludes an active client with a future scheduled session', () => {
    const client = makeClient({ id: 'C1', status: 'active' })
    const sessions = [makeSession({ id: 'S1', clientId: 'C1', date: FUTURE, status: 'scheduled' })]
    expect(getMissingNextSessionAttentionItems([client], sessions, TODAY)).toEqual([])
  })

  it('includes an active client with only past sessions (no future one)', () => {
    const client = makeClient({ id: 'C1', name: 'Bob', status: 'active' })
    const sessions = [makeSession({ id: 'S1', clientId: 'C1', date: PAST, status: 'completed' })]
    const result = getMissingNextSessionAttentionItems([client], sessions, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('missing_next_session')
    expect(result[0].clientName).toBe('Bob')
    expect(result[0].href).toBe('/dashboard/clients/C1')
  })

  it('excludes a client with zero session history entirely (brand new / never booked)', () => {
    const client = makeClient({ id: 'C1', status: 'active' })
    expect(getMissingNextSessionAttentionItems([client], [], TODAY)).toEqual([])
  })

  it('excludes an inactive client even with only past sessions', () => {
    const client = makeClient({ id: 'C1', status: 'inactive' })
    const sessions = [makeSession({ id: 'S1', clientId: 'C1', date: PAST, status: 'completed' })]
    expect(getMissingNextSessionAttentionItems([client], sessions, TODAY)).toEqual([])
  })

  it('a session scheduled today (not yet past) counts as a future session', () => {
    const client = makeClient({ id: 'C1', status: 'active' })
    const sessions = [
      makeSession({ id: 'S0', clientId: 'C1', date: PAST, status: 'completed' }),
      makeSession({ id: 'S1', clientId: 'C1', date: TODAY, status: 'scheduled' }),
    ]
    expect(getMissingNextSessionAttentionItems([client], sessions, TODAY)).toEqual([])
  })

  it('a cancelled future session does not count as an upcoming session', () => {
    const client = makeClient({ id: 'C1', status: 'active' })
    const sessions = [
      makeSession({ id: 'S0', clientId: 'C1', date: PAST, status: 'completed' }),
      makeSession({ id: 'S1', clientId: 'C1', date: FUTURE, status: 'cancelled' }),
    ]
    const result = getMissingNextSessionAttentionItems([client], sessions, TODAY)
    expect(result).toHaveLength(1)
  })

  it('caps at 4 with an overflow item', () => {
    const clients = Array.from({ length: 6 }, (_, i) => makeClient({ id: `C${i}`, status: 'active' }))
    const sessions = clients.map((c, i) =>
      makeSession({ id: `S${i}`, clientId: c.id, date: PAST, status: 'completed' }),
    )
    const result = getMissingNextSessionAttentionItems(clients, sessions, TODAY)
    expect(result).toHaveLength(5) // 4 visible + 1 overflow
    expect(result[4].label).toContain('+2 more')
    expect(result[4].href).toBe('/dashboard/clients')
  })

  it('mixed set: only active clients with history and no future session are included', () => {
    const clientA = makeClient({ id: 'C-A', status: 'active' })   // has future session -> excluded
    const clientB = makeClient({ id: 'C-B', status: 'active' })   // only past -> included
    const clientC = makeClient({ id: 'C-C', status: 'inactive' }) // inactive -> excluded
    const clientD = makeClient({ id: 'C-D', status: 'active' })   // no history at all -> excluded
    const sessions = [
      makeSession({ id: 'S-A', clientId: 'C-A', date: FUTURE, status: 'scheduled' }),
      makeSession({ id: 'S-B', clientId: 'C-B', date: PAST,   status: 'completed' }),
      makeSession({ id: 'S-C', clientId: 'C-C', date: PAST,   status: 'completed' }),
    ]
    const result = getMissingNextSessionAttentionItems([clientA, clientB, clientC, clientD], sessions, TODAY)
    expect(result.map(r => r.clientName)).toEqual(['Alice']) // only clientB (default name from fixture)
  })
})

// ─── combineAttentionItems (US-027) ────────────────────────────────────────────

function makeAttentionItem(partial: Partial<AttentionItem> & { type: AttentionItem['type'] }): AttentionItem {
  return {
    label: 'item',
    href:  '/dashboard',
    ...partial,
  }
}

describe('combineAttentionItems', () => {
  it('returns empty array when all sources are empty', () => {
    expect(combineAttentionItems([[], [], []])).toEqual([])
  })

  it('concatenates sources in the order given when under the cap', () => {
    const overdue     = [makeAttentionItem({ type: 'overdue_invoice', label: 'A' })]
    const unresolved  = [makeAttentionItem({ type: 'unresolved_session', label: 'B' })]
    const missingNext = [makeAttentionItem({ type: 'missing_next_session', label: 'C' })]
    const result = combineAttentionItems([overdue, unresolved, missingNext])
    expect(result.map(r => r.label)).toEqual(['A', 'B', 'C'])
  })

  it('does not truncate or add an overflow row at exactly the cap', () => {
    const items = Array.from({ length: 6 }, (_, i) => makeAttentionItem({ type: 'overdue_invoice', label: `I${i}` }))
    const result = combineAttentionItems([items])
    expect(result).toHaveLength(6)
    expect(result.map(r => r.label)).toEqual(items.map(i => i.label))
  })

  it('truncates and appends one combined overflow row when the total exceeds the cap', () => {
    const overdue     = Array.from({ length: 4 }, (_, i) => makeAttentionItem({ type: 'overdue_invoice', label: `O${i}` }))
    const unresolved  = Array.from({ length: 5 }, (_, i) => makeAttentionItem({ type: 'unresolved_session', label: `U${i}` }))
    const result = combineAttentionItems([overdue, unresolved])
    expect(result).toHaveLength(6) // 5 visible + 1 combined overflow
    expect(result.slice(0, 5).map(r => r.label)).toEqual(['O0', 'O1', 'O2', 'O3', 'U0'])
    expect(result[5].label).toContain('+4 more')
    expect(result[5].href).toBe('/dashboard/clients')
  })

  it('respects a custom cap', () => {
    const items = Array.from({ length: 5 }, (_, i) => makeAttentionItem({ type: 'overdue_invoice', label: `I${i}` }))
    const result = combineAttentionItems([items], 3)
    expect(result).toHaveLength(3)
    expect(result[2].label).toContain('+3 more')
  })

  it('preserves priority order — higher-priority source appears first even when it would be truncated last', () => {
    const overdue = [makeAttentionItem({ type: 'overdue_invoice', label: 'urgent' })]
    const missingNext = Array.from({ length: 10 }, (_, i) => makeAttentionItem({ type: 'missing_next_session', label: `soft${i}` }))
    const result = combineAttentionItems([overdue, missingNext], 3)
    expect(result[0].label).toBe('urgent') // highest-priority source's item survives truncation
  })

  it('uses plural grammar when 7 items are combined under a cap of 6 (7 - 5 visible = 2 hidden)', () => {
    const items = Array.from({ length: 7 }, (_, i) => makeAttentionItem({ type: 'overdue_invoice', label: `I${i}` }))
    const result = combineAttentionItems([items], 6)
    expect(result[5].label).toBe('+2 more items need attention')
  })

  it('uses plural grammar when 4 items are combined under a cap of 3 (4 - 2 visible = 2 hidden)', () => {
    const items = Array.from({ length: 4 }, (_, i) => makeAttentionItem({ type: 'overdue_invoice', label: `I${i}` }))
    const result = combineAttentionItems([items], 3)
    expect(result[2].label).toBe('+2 more items need attention')
  })
})

// ─── formatOverflowLabel (US-027 grammar) ──────────────────────────────────────
//
// combineAttentionItems always reserves one visible slot for the overflow
// row itself, so overflowCount is never less than 2 through normal use of
// the function (see its own doc comment) — the singular "1 hidden item"
// branch of the grammar is untestable through combineAttentionItems without
// a degenerate cap. formatOverflowLabel is tested directly instead so both
// branches are covered without relying on unreachable/degenerate input.
describe('formatOverflowLabel', () => {
  it('uses singular grammar for exactly 1 hidden item', () => {
    expect(formatOverflowLabel(1)).toBe('+1 more item needs attention')
  })

  it('uses plural grammar for multiple hidden items', () => {
    expect(formatOverflowLabel(2)).toBe('+2 more items need attention')
    expect(formatOverflowLabel(5)).toBe('+5 more items need attention')
  })
})

// ─── getSessionsThisWeek (US-045) ──────────────────────────────────────────────

describe('getSessionsThisWeek', () => {
  // TODAY = 2024-06-08. This week: [2024-06-02, 2024-06-08]. Last week: [2024-05-26, 2024-06-01].

  it('returns all zeros for no sessions', () => {
    expect(getSessionsThisWeek([], TODAY)).toEqual({ thisWeekCount: 0, lastWeekCount: 0, trend: 0 })
  })

  it('counts a session on today (inclusive upper bound)', () => {
    const s = makeSession({ id: 'S1', date: TODAY, status: 'completed' })
    expect(getSessionsThisWeek([s], TODAY).thisWeekCount).toBe(1)
  })

  it('counts a session exactly 6 days ago (inclusive lower bound of this week)', () => {
    const s = makeSession({ id: 'S1', date: '2024-06-02', status: 'completed' })
    expect(getSessionsThisWeek([s], TODAY).thisWeekCount).toBe(1)
  })

  it('excludes a session exactly 7 days ago from this week (falls in last week instead)', () => {
    const s = makeSession({ id: 'S1', date: '2024-06-01', status: 'completed' })
    const result = getSessionsThisWeek([s], TODAY)
    expect(result.thisWeekCount).toBe(0)
    expect(result.lastWeekCount).toBe(1)
  })

  it('counts a session exactly 13 days ago (inclusive lower bound of last week)', () => {
    const s = makeSession({ id: 'S1', date: '2024-05-26', status: 'completed' })
    expect(getSessionsThisWeek([s], TODAY).lastWeekCount).toBe(1)
  })

  it('excludes a session exactly 14 days ago from both windows', () => {
    const s = makeSession({ id: 'S1', date: '2024-05-25', status: 'completed' })
    const result = getSessionsThisWeek([s], TODAY)
    expect(result.thisWeekCount).toBe(0)
    expect(result.lastWeekCount).toBe(0)
  })

  it('excludes a future session from this week', () => {
    const s = makeSession({ id: 'S1', date: FUTURE, status: 'scheduled' })
    expect(getSessionsThisWeek([s], TODAY).thisWeekCount).toBe(0)
  })

  it('excludes cancelled sessions from both windows', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, status: 'cancelled' }),
      makeSession({ id: 'S2', date: '2024-06-01', status: 'cancelled' }),
    ]
    const result = getSessionsThisWeek(sessions, TODAY)
    expect(result.thisWeekCount).toBe(0)
    expect(result.lastWeekCount).toBe(0)
  })

  it('includes scheduled, completed, and missed sessions (only cancelled is excluded)', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, status: 'scheduled' }),
      makeSession({ id: 'S2', date: TODAY, status: 'completed' }),
      makeSession({ id: 'S3', date: TODAY, status: 'missed' }),
    ]
    expect(getSessionsThisWeek(sessions, TODAY).thisWeekCount).toBe(3)
  })

  it('computes a positive trend when this week is busier than last', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, status: 'completed' }),
      makeSession({ id: 'S2', date: TODAY, status: 'completed' }),
      makeSession({ id: 'S3', date: '2024-06-01', status: 'completed' }),
    ]
    const result = getSessionsThisWeek(sessions, TODAY)
    expect(result.thisWeekCount).toBe(2)
    expect(result.lastWeekCount).toBe(1)
    expect(result.trend).toBe(1)
  })

  it('computes a negative trend when this week is quieter than last', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, status: 'completed' }),
      makeSession({ id: 'S2', date: '2024-06-01', status: 'completed' }),
      makeSession({ id: 'S3', date: '2024-05-30', status: 'completed' }),
    ]
    const result = getSessionsThisWeek(sessions, TODAY)
    expect(result.thisWeekCount).toBe(1)
    expect(result.lastWeekCount).toBe(2)
    expect(result.trend).toBe(-1)
  })

  it('computes a zero trend when both weeks match', () => {
    const sessions = [
      makeSession({ id: 'S1', date: TODAY, status: 'completed' }),
      makeSession({ id: 'S2', date: '2024-06-01', status: 'completed' }),
    ]
    expect(getSessionsThisWeek(sessions, TODAY).trend).toBe(0)
  })

  it('does not conflict with Today Timeline data — same sessions can appear in both without double meaning', () => {
    // Today Timeline (getTodaySections) and Sessions This Week both read from
    // the same sessions array; this test documents that a today-dated session
    // correctly appears in both derivations independently (no shared mutable
    // state, no cross-function coupling).
    const sessions = [makeSession({ id: 'S1', date: TODAY, time: '09:00', status: 'scheduled' })]
    const todaySection = getTodaySections(sessions, TODAY)
    const week = getSessionsThisWeek(sessions, TODAY)
    expect(todaySection.upcoming).toHaveLength(1)
    expect(week.thisWeekCount).toBe(1)
  })
})
