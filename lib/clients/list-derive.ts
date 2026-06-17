import type { Client, Invoice } from '@/types'
import { isOutstandingInvoiceStatus } from '@/lib/invoices/status'
import { formatGoal } from '@/lib/format/goal'

// ─── VM shape ─────────────────────────────────────────────────────────────────

export type NeedsActionType = 'overdue' | 'outstanding' | 'missing_contact'

export interface ClientRosterCard {
  id:           string
  name:         string
  phone:        string
  goalLabel:    string | null
  status:       'active' | 'inactive' | 'paused'
  outstanding:  number
  overdueCount: number
  currency:     string
  needsAction:  NeedsActionType | null
  actionLabel:  string | null
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface DeriveRosterOpts {
  /** False when invoice fetch failed — suppresses all money signals. Default true. */
  invoicesAvailable?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tierRank(n: NeedsActionType | null): number {
  if (n === 'overdue')         return 3
  if (n === 'outstanding')     return 2
  if (n === 'missing_contact') return 1
  return 0
}

// ─── Main derive ──────────────────────────────────────────────────────────────

/**
 * Pure function — no I/O. Converts Client[] + Invoice[] into sorted roster cards.
 *
 * Ordering: needsAction tier desc; within money tiers (overdue/outstanding) by
 * outstanding amount desc then name asc; non-money tiers preserve input order.
 */
export function deriveClientRoster(
  clients: Client[],
  invoices: Invoice[],
  opts: DeriveRosterOpts = {},
): ClientRosterCard[] {
  const invoicesAvailable = opts.invoicesAvailable ?? true

  // Index invoices by clientId; skip invoices with unknown clientId.
  const clientIds = new Set(clients.map(c => c.id))
  const byClient  = new Map<string, Invoice[]>()
  for (const inv of invoices) {
    if (!clientIds.has(inv.clientId)) continue
    const list = byClient.get(inv.clientId) ?? []
    list.push(inv)
    byClient.set(inv.clientId, list)
  }

  const cards: ClientRosterCard[] = clients.map(client => {
    let outstanding  = 0
    let overdueCount = 0
    let currency     = 'USD'

    if (invoicesAvailable) {
      for (const inv of byClient.get(client.id) ?? []) {
        if (isOutstandingInvoiceStatus(inv.status)) {
          outstanding += inv.outstandingAmount
          currency = inv.currency
        }
        if (inv.status === 'overdue') overdueCount++
      }
    }

    const hasContact = !!(client.phone || client.email)

    let needsAction: NeedsActionType | null = null
    let actionLabel: string | null          = null

    if (invoicesAvailable && overdueCount > 0) {
      needsAction = 'overdue'
      actionLabel = overdueCount === 1 ? '1 overdue' : `${overdueCount} overdue`
    } else if (invoicesAvailable && outstanding > 0) {
      needsAction = 'outstanding'
      actionLabel = new Intl.NumberFormat('en-US', {
        style:                'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(outstanding)
    } else if (!hasContact) {
      needsAction = 'missing_contact'
      actionLabel = 'No contact'
    }

    return {
      id:           client.id,
      name:         client.name,
      phone:        client.phone,
      goalLabel:    formatGoal(client.goal) || null,
      status:       client.status,
      outstanding,
      overdueCount,
      currency,
      needsAction,
      actionLabel,
    }
  })

  // Stable sort: tier desc; money tiers secondary sort by outstanding desc + name asc;
  // non-money tiers no-op (Array.prototype.sort is stable in V8/Node).
  cards.sort((a, b) => {
    const ta = tierRank(a.needsAction)
    const tb = tierRank(b.needsAction)
    if (ta !== tb) return tb - ta
    if (ta >= 2) {
      if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding
      return a.name.localeCompare(b.name)
    }
    return 0
  })

  return cards
}
