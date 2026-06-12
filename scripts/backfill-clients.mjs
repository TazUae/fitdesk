/**
 * FitDesk — manual per-tenant client backfill CLI skeleton.
 *
 * Phase 1: exits with a clear message. Phase 2 implements the ERP read loop.
 *
 * Usage (Phase 2+):
 *   node scripts/backfill-clients.mjs --tenantId=<id>
 *   node scripts/backfill-clients.mjs --tenantId=<id> --dry-run
 *
 * Safety rules:
 *  - Must be run manually — never auto-triggered.
 *  - Run once per tenant before that tenant's Client Directory goes live.
 *  - Idempotent: safe to re-run.
 *  - Never deletes ERP Customers. Never resets the database.
 *  - Reads ERP Customers only through the approved proxy path.
 *
 * See: docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md
 *      lib/clients/backfill.ts
 */

const args = process.argv.slice(2)
const tenantIdArg = args.find((a) => a.startsWith('--tenantId='))
const dryRun = args.includes('--dry-run')

console.log('\n[backfill-clients] FitDesk client backfill — Phase 1 skeleton')
console.log('----------------------------------------------------------------')

if (!tenantIdArg) {
  console.error('ERROR: --tenantId=<id> is required')
  console.error('Usage: node scripts/backfill-clients.mjs --tenantId=<id> [--dry-run]')
  process.exit(1)
}

const tenantId = tenantIdArg.replace('--tenantId=', '').trim()
if (!tenantId) {
  console.error('ERROR: tenantId must not be empty')
  process.exit(1)
}

console.log(`tenantId : ${tenantId}`)
console.log(`dryRun   : ${dryRun}`)
console.log()
console.log('Phase 2 not yet implemented.')
console.log('When Phase 2 is ready this script will:')
console.log('  1. Read all ERPNext Customers for this tenant through the approved proxy.')
console.log('  2. Normalize phone numbers to E.164.')
console.log('  3. Upsert client_index rows (idempotent).')
console.log('  4. Create client_goal rows for cleanly parseable goals.')
console.log('  5. Write client_event:client.backfilled for each created row.')
console.log()
console.log('No data has been written. Exiting.')
process.exit(0)
