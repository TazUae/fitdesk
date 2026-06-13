/**
 * Server-only Client Hub read service (Phase 7).
 *
 * Returns a ClientHubOverview assembled exclusively from local tenant-scoped tables
 * (client_index, client_goal, client_action_intent, client_event). No ERP I/O.
 *
 * Feature flags (server-side only — never reaches the client bundle):
 *   FITDESK_CLIENT_HUB_ENABLED = '1'           → enable hub for all tenants
 *   FITDESK_CLIENT_HUB_TENANTS = 'a,b'          → optional allowlist; if set,
 *                                                 only listed tenants see the hub
 *
 * getClientHubOverview() returns null on any failure path so the existing ERP-backed
 * detail page never regresses — the hub is purely additive.
 */

import 'server-only'

import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository } from '@/lib/clients/repository'
import { mapToClientHubOverview } from '@/lib/clients/hub-map'
import { db } from '@/lib/db'
import type { ClientHubOverview } from '@/types/clients'

const HUB_ENABLED_FLAG  = 'FITDESK_CLIENT_HUB_ENABLED'
const HUB_TENANTS_FLAG  = 'FITDESK_CLIENT_HUB_TENANTS'

/**
 * Whether the Client Hub local read is enabled for this tenant.
 * Mirrors isLocalDirectoryEnabled() in lib/clients/directory.ts.
 */
export function isClientHubEnabled(tenantId: string): boolean {
  if (process.env[HUB_ENABLED_FLAG] !== '1') return false
  if (!tenantId || tenantId.trim() === '') return false

  const allow = process.env[HUB_TENANTS_FLAG]
  if (allow && allow.trim() !== '') {
    const list = allow.split(',').map(s => s.trim()).filter(Boolean)
    if (list.length > 0 && !list.includes(tenantId)) return false
  }
  return true
}

/**
 * Load the Client Hub overview for the given ERP Customer docname.
 *
 * Returns null when:
 *  - No tenant context (unauthenticated or workspace not provisioned)
 *  - Feature flag is off for this tenant
 *  - No local client_index row exists (backfill not yet run for this client)
 *  - Any recoverable read error (logged; never thrown to the caller)
 *
 * Callers render the hub conditionally: `hub && <ClientHubPanel overview={hub} />`
 */
export async function getClientHubOverview(
  erpCustomerId: string,
): Promise<ClientHubOverview | null> {
  try {
    const ctx = await getTenantContext()
    const tenantId = ctx?.tenantId
    if (!tenantId) return null
    if (!isClientHubEnabled(tenantId)) return null

    const repo = new ClientRepository(db)
    const clientIndex = await repo.findClientByErpId({ tenantId }, erpCustomerId)
    if (!clientIndex) return null

    const [goals, pendingActions, events] = await Promise.all([
      repo.listGoals({ tenantId }, clientIndex.id),
      repo.listPendingActions({ tenantId }, clientIndex.id),
      repo.listEvents({ tenantId }, clientIndex.id),
    ])

    return mapToClientHubOverview(clientIndex, goals, pendingActions, events)
  } catch (err) {
    console.error(
      '[getClientHubOverview] local read failed; hub will not render:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
