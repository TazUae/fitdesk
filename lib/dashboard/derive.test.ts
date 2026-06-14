import { describe, expect, it } from 'vitest'
import {
  getNextUp,
  getTodaySections,
  getMoneySnapshot,
  getUpcoming,
  getAttentionItems,
} from './derive'
import type { Session, Invoice } from '@/types'

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
  it('returns empty array when no overdue invoices', () => {
    const invoices = [makeInvoice({ id: 'I1', status: 'sent' })]
    expect(getAttentionItems(invoices, REF_DATE)).toHaveLength(0)
  })

  it('returns empty array when invoice list is empty', () => {
    expect(getAttentionItems([], REF_DATE)).toHaveLength(0)
  })

  it('returns one item per overdue invoice', () => {
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

  it('orders by oldest dueDate first', () => {
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

  it('appends overflow item when more than 4 overdue', () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makeInvoice({ id: `I${i}`, status: 'overdue', dueDate: `2024-06-0${i + 1}` }),
    )
    const items = getAttentionItems(invoices, REF_DATE)
    expect(items).toHaveLength(5)
    const overflow = items[4]
    expect(overflow.type).toBe('overdue_invoice_overflow')
    expect(overflow.href).toBe('/dashboard/invoices')
    expect(overflow.label).toContain('+2')
  })

  it('overflow label is singular when exactly 1 extra', () => {
    const invoices = Array.from({ length: 5 }, (_, i) =>
      makeInvoice({ id: `I${i}`, status: 'overdue', dueDate: `2024-06-0${i + 1}` }),
    )
    const items = getAttentionItems(invoices, REF_DATE)
    const overflow = items[4]
    expect(overflow.label).toMatch(/\+1 more overdue invoice\b(?!s)/)
  })

  it('excludes sent, partially_paid, paid, and draft invoices', () => {
    const invoices = [
      makeInvoice({ id: 'I1', status: 'sent' }),
      makeInvoice({ id: 'I2', status: 'partially_paid' }),
      makeInvoice({ id: 'I3', status: 'paid' }),
      makeInvoice({ id: 'I4', status: 'draft' }),
    ]
    expect(getAttentionItems(invoices, REF_DATE)).toHaveLength(0)
  })
})
