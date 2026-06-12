/**
 * Tenant-scoped duplicate detection helpers.
 *
 * RULES:
 *  - All lookups are scoped to ctx.tenantId — cross-tenant results are NEVER returned.
 *  - Exact phone match uses normalized E.164 (must be normalized before calling).
 *  - Name-similarity matching is deferred to a later phase.
 */

import type { DuplicateClientMatch } from '@/types/clients'
import type { TenantCtx } from './repository'
import { ClientRepository } from './repository'

/**
 * Find exact E.164 phone matches within the same tenant.
 *
 * @param repo      A ClientRepository instance (allows injection for testing).
 * @param ctx       Tenant context — tenantId required.
 * @param phoneE164 Normalized E.164 phone string (use normalizePhoneToE164 first).
 * @returns         Array of duplicate matches; empty array when none found.
 */
export async function findDuplicatesByPhone(
  repo: ClientRepository,
  ctx: TenantCtx,
  phoneE164: string,
): Promise<DuplicateClientMatch[]> {
  const matches = await repo.findClientsByPhone(ctx, phoneE164)
  return matches.map((c) => ({
    clientIndexId: c.id,
    erpCustomerId: c.erpCustomerId,
    fullName:      c.fullName,
    phoneE164:     c.phoneE164,
    status:        c.status,
    matchType:     'exact_phone' as const,
    confidence:    'high' as const,
  }))
}
