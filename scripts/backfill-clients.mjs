/**
 * FitDesk — per-tenant client backfill CLI.
 *
 * Reads ERP Customers from the Control Plane proxy and upserts them into
 * the local client_index table. Safe to re-run — idempotent.
 *
 * Usage:
 *   node scripts/backfill-clients.mjs --tenantId=<id>            # dry-run (default)
 *   node scripts/backfill-clients.mjs --tenantId=<id> --execute  # write rows
 *   node scripts/backfill-clients.mjs --tenantId=<id> --execute --include-disabled
 *
 * Required env vars:
 *   FITDESK_JWT_SECRET   — used to sign the tenant JWT sent to the CP proxy
 *   CONTROL_PLANE_URL    — base URL of the Control Plane (e.g. https://cp.example.com)
 *   DATABASE_URL         — local LibSQL DB URL (e.g. file:./auth.db)
 *
 * Safety rules:
 *  - Dry-run is the default — --execute is required for any DB writes.
 *  - Never deletes ERP Customers or drops DB rows.
 *  - No ERP credentials are stored — uses a short-lived JWT signed with the app secret.
 *  - ERP calls go through the Control Plane proxy only.
 *
 * See: lib/clients/backfill.ts  (TypeScript library — same logic, fully tested)
 *      docs/adr/ADR-001-client-management-erp-authoritative-hybrid.md
 */

import { createClient } from '@libsql/client'
import { SignJWT } from 'jose'
import { parsePhoneNumber } from 'libphonenumber-js'
import { randomUUID } from 'crypto'

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

const tenantIdArg = args.find((a) => a.startsWith('--tenantId='))
const execute = args.includes('--execute')
const includeDisabled = args.includes('--include-disabled')
const dryRun = !execute

console.log('\n[backfill-clients] FitDesk client backfill')
console.log('-------------------------------------------')

if (!tenantIdArg) {
  console.error('ERROR: --tenantId=<id> is required')
  console.error('Usage: node scripts/backfill-clients.mjs --tenantId=<id> [--execute] [--include-disabled]')
  process.exit(1)
}

const tenantId = tenantIdArg.replace('--tenantId=', '').trim()
if (!tenantId) {
  console.error('ERROR: tenantId must not be empty')
  process.exit(1)
}

// ─── Env validation ───────────────────────────────────────────────────────────

const JWT_SECRET = process.env.FITDESK_JWT_SECRET
const CP_URL = process.env.CONTROL_PLANE_URL
const DATABASE_URL = process.env.DATABASE_URL ?? 'file:./auth.db'
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN

if (!JWT_SECRET) {
  console.error('ERROR: FITDESK_JWT_SECRET is not set')
  process.exit(1)
}
if (!CP_URL) {
  console.error('ERROR: CONTROL_PLANE_URL is not set')
  process.exit(1)
}

console.log(`tenantId        : ${tenantId}`)
console.log(`mode            : ${dryRun ? 'DRY-RUN (no writes)' : 'EXECUTE (writes enabled)'}`)
console.log(`includeDisabled : ${includeDisabled}`)
console.log(`database        : ${DATABASE_URL}`)
console.log()

// ─── JWT helper ───────────────────────────────────────────────────────────────

async function signTenantJwt() {
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)
}

// ─── ERP fetch ────────────────────────────────────────────────────────────────
//
// CONTRACT NOTE — keep in sync with lib/erpnext/client.ts:erpFetch():
//   • This CLI uses the same Control Plane ERP proxy path (/api/erp/doctype/*)
//     and the same HS256 tenant JWT contract as erpFetch().
//   • It does NOT call ERPNext directly and does NOT use ERP credentials.
//   • The JWT signing and path construction are duplicated here because this
//     plain .mjs runner cannot import the Next.js/TypeScript ERP adapter and
//     cannot rely on session-based getTenantContext() to obtain tenantId.
//   • If the Control Plane ERP proxy contract or JWT format changes, update
//     this CLI alongside lib/erpnext/client.ts:erpFetch().
//   • This function is read-only: GET requests only, no ERP writes.

async function fetchErpCustomers() {
  const token = await signTenantJwt()

  const fields = JSON.stringify([
    'name', 'customer_name', 'mobile_no', 'disabled',
    'custom_fitness_goals', 'creation',
  ])

  const filters = includeDisabled
    ? '[]'
    : JSON.stringify([['disabled', '=', 0]])

  const params = new URLSearchParams({
    fields,
    filters,
    order_by: 'creation desc',
    limit_page_length: '500',
  })

  const url = `${CP_URL}/api/erp/doctype/Customer?${params}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`CP proxy returned ${res.status} ${res.statusText}: ${body}`)
  }

  const json = await res.json()
  return json.data ?? []
}

// ─── Goal label normalization ─────────────────────────────────────────────────
//
// CONTRACT NOTE — keep in sync with lib/format/goal.ts:formatGoal():
//   This plain .mjs runner cannot import the TypeScript helper directly, so the
//   behavior is inlined here. If formatGoal() changes, update this function too.
//   Source of truth: lib/format/goal.ts.

function formatGoalLabel(raw) {
  if (!raw) return ''
  const trimmed = String(raw).trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === 'string') return item.trim()
          if (item !== null && typeof item === 'object') {
            const label = item.label ?? item.name ?? item.description ?? item.goal_type ?? item.type ?? item.value
            if (typeof label === 'string' && label.trim()) {
              return label.trim().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
            }
            const first = Object.values(item).find(v => typeof v === 'string' && v.trim().length > 0)
            if (first) return String(first).trim().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
          }
          return ''
        })
        .filter(Boolean)
        .join(', ')
    }
    if (parsed !== null && typeof parsed === 'object') {
      const display = parsed.label ?? parsed.name ?? parsed.description ?? parsed.type ?? parsed.value
      if (typeof display === 'string' && display.trim()) {
        return display.trim().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
      }
      const parts = Object.values(parsed)
        .filter(v => typeof v === 'string' && v.trim().length > 0)
        .map(v => v.trim())
      return parts.join(', ') || trimmed
    }
    if (typeof parsed === 'string') return parsed.trim()
    return trimmed
  } catch {
    return trimmed
  }
}

// ─── Phone normalization ──────────────────────────────────────────────────────

function normalizePhone(raw) {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  try {
    const phone = parsePhoneNumber(trimmed, 'LB')
    if (!phone.isValid()) return null
    return phone.format('E.164')
  } catch {
    return null
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function findExisting(db, erpCustomerId) {
  const { rows } = await db.execute({
    sql: `SELECT id FROM client_index WHERE tenant_id = ? AND erp_customer_id = ? LIMIT 1`,
    args: [tenantId, erpCustomerId],
  })
  return rows[0] ?? null
}

async function upsertClient(db, customer, phoneE164) {
  const goalLabel = formatGoalLabel(customer.custom_fitness_goals) || null
  const now = new Date().toISOString()

  const existing = await findExisting(db, customer.name)

  if (existing) {
    await db.execute({
      sql: `UPDATE client_index
              SET full_name = ?, phone_e164 = ?, primary_goal_label = ?, updated_at_utc = ?
            WHERE tenant_id = ? AND erp_customer_id = ?`,
      args: [customer.customer_name, phoneE164, goalLabel, now, tenantId, customer.name],
    })
    return { id: existing.id, isNew: false }
  }

  const id = randomUUID()
  await db.execute({
    sql: `INSERT INTO client_index (
            id, tenant_id, erp_customer_id, full_name, phone_e164,
            whatsapp_enabled, status, primary_goal_label, primary_goal_id,
            safety_state, onboarding_state, billing_mode, payment_summary,
            next_session_at_utc, last_activity_at_utc,
            possible_duplicate_client_id, duplicate_override_reason,
            created_at_utc, updated_at_utc
          ) VALUES (
            ?, ?, ?, ?, ?,
            0, 'active', ?, NULL,
            'clear', 'not_started', 'unset', 'unset',
            NULL, ?,
            NULL, NULL,
            ?, ?
          )`,
    args: [id, tenantId, customer.name, customer.customer_name, phoneE164,
           goalLabel, now, now, now],
  })
  return { id, isNew: true }
}

async function insertBackfillEvent(db, clientIndexId, erpCustomerId, fullName) {
  const now = new Date().toISOString()
  const id = randomUUID()
  const payload = JSON.stringify({ erpCustomerId, fullName })

  await db.execute({
    sql: `INSERT INTO client_event (
            id, tenant_id, client_index_id, erp_customer_id,
            type, payload_json, created_by_user_id, created_at_utc
          ) VALUES (?, ?, ?, ?, 'client.backfilled', ?, NULL, ?)`,
    args: [id, tenantId, clientIndexId, erpCustomerId, payload, now],
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN })

  const result = {
    inspected:    0,
    created:      0,
    updated:      0,
    skipped:      0,
    invalidPhone: 0,
    errors:       [],
  }

  let customers
  try {
    console.log('Fetching ERP Customers from Control Plane...')
    customers = await fetchErpCustomers()
    console.log(`Fetched ${customers.length} customer(s).\n`)
  } catch (err) {
    console.error(`ERROR: ${err.message}`)
    db.close()
    process.exit(1)
  }

  for (const customer of customers) {
    result.inspected++

    try {
      if (customer.disabled === 1 && !includeDisabled) {
        result.skipped++
        console.log(`  SKIP   [disabled]  ${customer.name}  ${customer.customer_name}`)
        continue
      }

      const phoneE164 = normalizePhone(customer.mobile_no)
      if (!phoneE164) {
        result.invalidPhone++
        console.log(`  SKIP   [bad phone] ${customer.name}  ${customer.customer_name}  raw="${customer.mobile_no ?? ''}"`)
        continue
      }

      if (dryRun) {
        const existing = await findExisting(db, customer.name)
        if (existing) {
          result.updated++
          console.log(`  DRY    [update]    ${customer.name}  ${customer.customer_name}`)
        } else {
          result.created++
          console.log(`  DRY    [create]    ${customer.name}  ${customer.customer_name}`)
        }
        continue
      }

      const { id: clientIndexId, isNew } = await upsertClient(db, customer, phoneE164)

      if (isNew) {
        result.created++
        await insertBackfillEvent(db, clientIndexId, customer.name, customer.customer_name)
        console.log(`  CREATE             ${customer.name}  ${customer.customer_name}`)
      } else {
        result.updated++
        console.log(`  UPDATE             ${customer.name}  ${customer.customer_name}`)
      }
    } catch (err) {
      result.errors.push({ erpCustomerId: customer.name, reason: err.message })
      console.error(`  ERROR  ${customer.name}: ${err.message}`)
    }
  }

  db.close()

  console.log()
  console.log('─── Summary ───────────────────────────────')
  console.log(`  Mode            : ${dryRun ? 'dry-run' : 'execute'}`)
  console.log(`  Inspected       : ${result.inspected}`)
  console.log(`  Created         : ${result.created}`)
  console.log(`  Updated         : ${result.updated}`)
  console.log(`  Skipped         : ${result.skipped}  (disabled)`)
  console.log(`  Invalid phone   : ${result.invalidPhone}`)
  console.log(`  Errors          : ${result.errors.length}`)

  if (result.errors.length > 0) {
    console.log()
    console.log('Errors:')
    for (const e of result.errors) {
      console.error(`  ${e.erpCustomerId}: ${e.reason}`)
    }
  }

  if (dryRun) {
    console.log()
    console.log('No data was written. Re-run with --execute to apply changes.')
  }

  console.log()

  process.exit(result.errors.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
