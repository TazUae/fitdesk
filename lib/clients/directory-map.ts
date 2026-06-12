/**
 * Pure mapping: local client_index read-model row → app-level Client shape.
 *
 * Used by the Phase 3 Client Directory local-read path. ERPNext Customer remains
 * the canonical business identity (ADR-001), so the resulting Client.id MUST be
 * the ERP Customer docname (erpCustomerId), NOT the local client_index UUID —
 * otherwise the directory's detail link (/dashboard/clients/[id]) and every
 * ERP-backed flow (invoices, payments, messages) would break.
 *
 * Fidelity note: email, notes, sessionCount, and trainerId are intentionally
 * empty/zero here — they are also empty/zero on the current ERP directory read
 * (see normalizeClient in lib/erpnext/client.ts), so this mapping introduces no
 * visible regression. status is mapped more accurately than the ERP path, which
 * currently hardcodes 'active'.
 */

import type { Client, ClientStatus } from '@/types'
import type { ClientIndex, ClientIndexStatus } from '@/types/clients'

/** Map local client_index status → app-level ClientStatus. archived has no UI equivalent → inactive. */
function mapStatus(status: ClientIndexStatus): ClientStatus {
  if (status === 'active') return 'active'
  return 'inactive' // 'inactive' and 'archived' both render as inactive
}

/** Split a full name into first/last on the last space — mirrors lib/erpnext/client.ts normalizeClient. */
function splitName(fullName: string): { firstName: string; lastName?: string } {
  const full = fullName ?? ''
  const lastSpace = full.lastIndexOf(' ')
  if (lastSpace > 0) {
    return { firstName: full.slice(0, lastSpace), lastName: full.slice(lastSpace + 1) }
  }
  return { firstName: full }
}

/**
 * Convert a ClientIndex row into the Client shape consumed by ClientsView.
 * Pure and synchronous — no I/O, no tenant resolution.
 */
export function mapClientIndexToClient(row: ClientIndex): Client {
  const { firstName, lastName } = splitName(row.fullName)
  return {
    id:           row.erpCustomerId, // canonical ERP Customer docname — NOT row.id
    firstName,
    lastName,
    name:         row.fullName,
    email:        undefined,
    phone:        row.phoneE164,
    status:       mapStatus(row.status),
    trainerId:    '',
    sessionCount: 0,
    goal:         row.primaryGoalLabel ?? undefined,
    notes:        undefined,
    createdAt:    row.createdAtUtc,
  }
}
