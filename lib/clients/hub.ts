/**
 * Server-only Client Hub read service (Phase 7).
 *
 * Returns a ClientHubOverview assembled exclusively from local tenant-scoped tables
 * (client_index, client_goal, client_action_intent, client_event). No ERP I/O.
 *
 * Feature flags (server-side only — never reaches the client bundle):
 *   FITDESK_CLIENT_HUB_ENABLED unset / '1'     → enabled (default)
 *   FITDESK_CLIENT_HUB_ENABLED = '0' | 'false' → disabled
 *   FITDESK_CLIENT_HUB_TENANTS = 'a,b'          → optional allowlist; if set,
 *                                                 only listed tenants see the hub
 *
 * getClientHubOverview() returns null on any failure path so the existing ERP-backed
 * detail page never regresses — the hub is purely additive.
 */

import 'server-only'

import { getTenantContext } from '@/lib/tenant/context'
import { ClientRepository } from '@/lib/clients/repository'
import { ClientPackagePurchaseRepository } from '@/lib/billing/client-package-purchase-repository'
import { PackageLedgerRepository } from '@/lib/billing/package-ledger-repository'
import { mapToClientHubOverview } from '@/lib/clients/hub-map'
import { db } from '@/lib/db'
import type { ClientHubOverview } from '@/types/clients'
import type { PackagePurchaseWithBalance } from '@/types/billing'

const HUB_ENABLED_FLAG  = 'FITDESK_CLIENT_HUB_ENABLED'
const HUB_TENANTS_FLAG  = 'FITDESK_CLIENT_HUB_TENANTS'

/**
 * Whether the Client Hub local read is enabled for this tenant.
 *
 * Enabled by default. Opt-out by setting FITDESK_CLIENT_HUB_ENABLED=0 or
 * FITDESK_CLIENT_HUB_ENABLED=false in the environment.
 */
export function isClientHubEnabled(tenantId: string): boolean {
  const flag = process.env[HUB_ENABLED_FLAG]
  if (flag === '0' || flag?.toLowerCase() === 'false') return false
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

    const repo          = new ClientRepository(db)
    const purchaseRepo  = new ClientPackagePurchaseRepository(db)
    const ledgerRepo    = new PackageLedgerRepository(db)

    const clientIndex = await repo.findClientByErpId({ tenantId }, erpCustomerId)
    if (!clientIndex) return null

    const tenantCtx = { tenantId }
    const [goals, hasGoalHistory, pendingActions, events, rawPurchases, balances] = await Promise.all([
      repo.listGoals(tenantCtx, clientIndex.id),
      repo.hasGoalHistory(tenantCtx, clientIndex.id),
      repo.listPendingActions(tenantCtx, clientIndex.id),
      repo.listEvents(tenantCtx, clientIndex.id),
      purchaseRepo.listPurchasesByClient(tenantCtx, clientIndex.id),
      ledgerRepo.deriveBalancesByClient(tenantCtx, clientIndex.id),
    ])

    const purchases: PackagePurchaseWithBalance[] = rawPurchases.map(p => ({
      ...p,
      remainingBalance: balances[p.id] ?? 0,
    }))

    return mapToClientHubOverview(clientIndex, goals, pendingActions, events, purchases, hasGoalHistory)
  } catch (err) {
    console.error(
      '[getClientHubOverview] local read failed; hub will not render:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
