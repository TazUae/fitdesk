import { describe, expect, it } from 'vitest'
import { deriveClientRoster } from '../list-derive'
import type { Client, Invoice } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeClient(partial: Partial<Client> & { id: string; name: string }): Client {
  return {
    firstName:    partial.name.split(' ')[0] ?? partial.name,
    lastName:     partial.name.split(' ')[1],
    email:        undefined,
    phone:        '+1 555 000 0000',
    status:       'active',
    trainerId:    'T1',
    sessionCount: 0,
    goal:         undefined,
    notes:        undefined,
    createdAt:    '2024-01-01',
    ...partial,
  }
}

function makeInvoice(partial: Partial<Invoice> & { id: string; clientId: string }): Invoice {
  return {
    clientName:        'Alice',
    trainerId:         'T1',
    amount:            100,
    outstandingAmount: 100,
    currency:          'USD',
    status:            'sent',
    dueDate:           '2024-06-01',
    issuedAt:          '2024-05-01',
    ...partial,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deriveClientRoster', () => {

  it('returns empty array when clients is empty', () => {
    expect(deriveClientRoster([], [], {})).toHaveLength(0)
  })

  it('returns one card per client', () => {
    const clients = [
      makeClient({ id: 'C1', name: 'Alice' }),
      makeClient({ id: 'C2', name: 'Bob' }),
    ]
    expect(deriveClientRoster(clients, [])).toHaveLength(2)
  })

  it('sets needsAction null and outstanding 0 when client has only paid invoices', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'paid', outstandingAmount: 0 })]
    const [card] = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBeNull()
    expect(card.outstanding).toBe(0)
    expect(card.overdueCount).toBe(0)
  })

  it('sets needsAction "outstanding" for a sent invoice', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'sent', outstandingAmount: 150 })]
    const [card] = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBe('outstanding')
    expect(card.outstanding).toBe(150)
    expect(card.overdueCount).toBe(0)
  })

  it('sets needsAction "outstanding" for a partially_paid invoice', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'partially_paid', outstandingAmount: 60 })]
    const [card] = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBe('outstanding')
    expect(card.outstanding).toBe(60)
  })

  it('sets needsAction "overdue" for an overdue invoice', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue', outstandingAmount: 200 })]
    const [card] = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBe('overdue')
    expect(card.overdueCount).toBe(1)
    expect(card.outstanding).toBe(200)
  })

  it('overdue takes priority over outstanding when client has both', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [
      makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue',  outstandingAmount: 100 }),
      makeInvoice({ id: 'I2', clientId: 'C1', status: 'sent',     outstandingAmount: 50  }),
    ]
    const [card] = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBe('overdue')
    expect(card.outstanding).toBe(150)
    expect(card.overdueCount).toBe(1)
  })

  it('sets needsAction "missing_contact" when no phone and no email', () => {
    const clients = [makeClient({ id: 'C1', name: 'Alice', phone: '', email: undefined })]
    const [card]  = deriveClientRoster(clients, [])
    expect(card.needsAction).toBe('missing_contact')
    expect(card.actionLabel).toBe('No contact')
  })

  it('sets needsAction null when email present but no phone', () => {
    const clients = [makeClient({ id: 'C1', name: 'Alice', phone: '', email: 'a@test.com' })]
    const [card]  = deriveClientRoster(clients, [])
    expect(card.needsAction).toBeNull()
  })

  it('overdue takes priority over missing_contact', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice', phone: '', email: undefined })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue', outstandingAmount: 100 })]
    const [card]   = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBe('overdue')
  })

  it('outstanding takes priority over missing_contact', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice', phone: '', email: undefined })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'sent', outstandingAmount: 50 })]
    const [card]   = deriveClientRoster(clients, invoices)
    expect(card.needsAction).toBe('outstanding')
  })

  it('invoicesAvailable: false suppresses money signals even when invoices provided', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue', outstandingAmount: 300 })]
    const [card]   = deriveClientRoster(clients, invoices, { invoicesAvailable: false })
    expect(card.needsAction).toBeNull()
    expect(card.outstanding).toBe(0)
    expect(card.overdueCount).toBe(0)
  })

  it('ignores invoices with unknown clientId', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [makeInvoice({ id: 'I1', clientId: 'UNKNOWN', status: 'overdue', outstandingAmount: 500 })]
    const [card]   = deriveClientRoster(clients, invoices)
    expect(card.outstanding).toBe(0)
    expect(card.needsAction).toBeNull()
  })

  it('orders by tier: overdue before outstanding before missing_contact before null', () => {
    const clients = [
      makeClient({ id: 'C4', name: 'Delta', phone: '+1 555 000 0001' }),
      makeClient({ id: 'C3', name: 'Charlie', phone: '', email: undefined }),
      makeClient({ id: 'C1', name: 'Alpha' }),
      makeClient({ id: 'C2', name: 'Bravo' }),
    ]
    const invoices = [
      makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue',  outstandingAmount: 100 }),
      makeInvoice({ id: 'I2', clientId: 'C2', status: 'sent',     outstandingAmount: 80  }),
    ]
    const cards = deriveClientRoster(clients, invoices)
    expect(cards[0].id).toBe('C1') // overdue
    expect(cards[1].id).toBe('C2') // outstanding
    expect(cards[2].id).toBe('C3') // missing_contact
    expect(cards[3].id).toBe('C4') // null
  })

  it('within overdue tier: higher outstanding amount comes first', () => {
    const clients = [
      makeClient({ id: 'C1', name: 'Alice' }),
      makeClient({ id: 'C2', name: 'Bob' }),
    ]
    const invoices = [
      makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue', outstandingAmount: 80  }),
      makeInvoice({ id: 'I2', clientId: 'C2', status: 'overdue', outstandingAmount: 200 }),
    ]
    const cards = deriveClientRoster(clients, invoices)
    expect(cards[0].id).toBe('C2') // $200 first
    expect(cards[1].id).toBe('C1') // $80 second
  })

  it('within same outstanding amount: name ascending', () => {
    const clients = [
      makeClient({ id: 'C1', name: 'Zara' }),
      makeClient({ id: 'C2', name: 'Anna' }),
    ]
    const invoices = [
      makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue', outstandingAmount: 100 }),
      makeInvoice({ id: 'I2', clientId: 'C2', status: 'overdue', outstandingAmount: 100 }),
    ]
    const cards = deriveClientRoster(clients, invoices)
    expect(cards[0].id).toBe('C2') // Anna before Zara
    expect(cards[1].id).toBe('C1')
  })

  it('non-money tiers preserve input order', () => {
    const clients = [
      makeClient({ id: 'C3', name: 'Charlie' }),
      makeClient({ id: 'C1', name: 'Alpha' }),
      makeClient({ id: 'C2', name: 'Bravo' }),
    ]
    const cards = deriveClientRoster(clients, [])
    expect(cards.map(c => c.id)).toEqual(['C3', 'C1', 'C2'])
  })

  it('maps goalLabel from client.goal', () => {
    const clients = [makeClient({ id: 'C1', name: 'Alice', goal: 'Weight Loss' })]
    const [card]  = deriveClientRoster(clients, [])
    expect(card.goalLabel).toBe('Weight Loss')
  })

  it('sets goalLabel null when goal is absent', () => {
    const clients = [makeClient({ id: 'C1', name: 'Alice', goal: undefined })]
    const [card]  = deriveClientRoster(clients, [])
    expect(card.goalLabel).toBeNull()
  })

  it('overdueCount reflects number of overdue invoices across multiple', () => {
    const clients  = [makeClient({ id: 'C1', name: 'Alice' })]
    const invoices = [
      makeInvoice({ id: 'I1', clientId: 'C1', status: 'overdue', outstandingAmount: 100 }),
      makeInvoice({ id: 'I2', clientId: 'C1', status: 'overdue', outstandingAmount: 50  }),
      makeInvoice({ id: 'I3', clientId: 'C1', status: 'paid',    outstandingAmount: 0   }),
    ]
    const [card] = deriveClientRoster(clients, invoices)
    expect(card.overdueCount).toBe(2)
    expect(card.outstanding).toBe(150)
    expect(card.actionLabel).toBe('2 overdue')
  })

})
