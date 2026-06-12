/**
 * Phase 3 — Client Directory local read model, behind a server-side feature flag.
 *
 * Default behavior is unchanged: the directory reads live ERP Customers through
 * the existing fetchClients() path. Local reads from client_index are strictly
 * opt-in (per ADR-001, client_index is an enrichment/read-model layer only).
 *
 * Flags (server-side only — never reaches the client bundle):
 *   FITDESK_CLIENT_DIRECTORY_LOCAL_READ = '1'      → enable local-read attempt
 *   FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS = 'a,b' → optional allowlist; if set,
 *                                                    only these tenants read local
 *
 * Every failure path degrades safely to the ERP read — no user-visible breakage.
 */

import 'server-only'

import { fetchClients } from '@/actions/clients'
import { ClientRepository } from '@/lib/clients/repository'
import { mapClientIndexToClient } from '@/lib/clients/directory-map'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant/context'
import type { ActionResult, Client } from '@/types'

const LOCAL_READ_FLAG = 'FITDESK_CLIENT_DIRECTORY_LOCAL_READ'
const LOCAL_TENANTS_FLAG = 'FITDESK_CLIENT_DIRECTORY_LOCAL_TENANTS'

// A high cap that preserves the current ERP behavior of returning the full
// directory (the ERP read is unbounded). Pilot tenants stay well under this.
const DIRECTORY_LIMIT = 1000

/**
 * Whether the local read model may be used for this tenant.
 * Requires the global flag to be exactly '1' and, when an allowlist is set,
 * the tenant to be on it. Returns false for an empty tenantId.
 */
export function isLocalDirectoryEnabled(tenantId: string): boolean {
  if (process.env[LOCAL_READ_FLAG] !== '1') return false
  if (!tenantId || tenantId.trim() === '') return false

  const allow = process.env[LOCAL_TENANTS_FLAG]
  if (allow && allow.trim() !== '') {
    const list = allow.split(',').map((s) => s.trim()).filter(Boolean)
    if (list.length > 0 && !list.includes(tenantId)) return false
  }
  return true
}

/**
 * Resolve the Client Directory list.
 *
 * Returns the local client_index read model when the flag (and optional
 * allowlist) is enabled for the current tenant AND at least one local row
 * exists. Falls back to the live ERP read (fetchClients) when the flag is off,
 * there is no tenant, the tenant is not allowlisted, the local table is empty,
 * or any local query error occurs.
 */
export async function getDirectoryClients(): Promise<ActionResult<Client[]>> {
  const ctx = await getTenantContext()
  const tenantId = ctx?.tenantId ?? null

  // No tenant, flag off, or not allowlisted → current ERP behavior.
  if (!tenantId) return fetchClients()
  if (!isLocalDirectoryEnabled(tenantId)) return fetchClients()

  try {
    const repo = new ClientRepository(db)
    const rows = await repo.listClients({ tenantId }, { limit: DIRECTORY_LIMIT })

    // Empty local table = tenant not backfilled yet → fall back to ERP.
    if (rows.length === 0) return fetchClients()

    return { success: true, data: rows.map(mapClientIndexToClient) }
  } catch (err) {
    // Log with tenantId only (no secrets / PII) and degrade to ERP.
    console.error(
      `[getDirectoryClients] local read failed for tenant ${tenantId}; falling back to ERP:`,
      err instanceof Error ? err.message : String(err),
    )
    return fetchClients()
  }
}
