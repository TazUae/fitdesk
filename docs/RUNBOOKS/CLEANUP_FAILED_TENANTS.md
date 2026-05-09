# Cleanup: Failed Smoke / Test Tenants

**Risk level:** Level 1 = Low (CP-only metadata). Level 2 = HIGH (deletes ERP site folders + DBs).
**Approval gate:** Level 1 needs the operator's word. Level 2 needs explicit named approval per tenant ID.
**Pre-conditions:** Recent backup verified (BACKUPS.md). Inventory of which tenants are pure-residue vs accepted-evidence.

## Background

Phase 2.6.5 left 14 failed smoke tenants with mixed states (CP records, ERP site folders, MariaDB databases). The accepted evidence tenant (`smoke-15`) and the live pilot tenant (`repeat-2`) MUST be preserved. Everything else is candidate for cleanup.

Reference: `C:\Users\Lenovo\Dev\axis-erp\PHASE_2_6_5_REPORT.md` Section 4 has the full residue matrix.

## Inventory query

Always confirm what you're about to delete BEFORE deleting it:

```bash
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
   "SELECT id, slug, status FROM \"Tenant\" WHERE status='\''failed'\'' ORDER BY \"createdAt\" DESC"'
```

As of 2026-05-09 audit: 12 failed tenants present (smoke-1..10, smoke-12, plus one transient). Confirm count before any cleanup batch.

## Level 1 — CP metadata cleanup (recommendation B)

Removes failed tenant rows from `Tenant`, `ProvisioningJob`, `ProvisioningStepRun`. ERP site folders and MariaDB DBs are NOT touched. Safe and reversible only via backup restore.

**Approval gate:** operator says yes in writing.

```bash
# Always dry-run first — see what would be deleted
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
   "SELECT id, slug FROM \"Tenant\" WHERE status='\''failed'\'' AND slug LIKE '\''phase-264-fitdesk-smoke-%'\''"'

# After explicit approval per ID list:
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
   "BEGIN; \
    DELETE FROM \"ProvisioningStepRun\" WHERE \"jobId\" IN (SELECT id FROM \"ProvisioningJob\" WHERE \"tenantId\" IN (...explicit ids...)); \
    DELETE FROM \"ProvisioningJob\" WHERE \"tenantId\" IN (...explicit ids...); \
    DELETE FROM \"AuditEvent\" WHERE \"tenantId\" IN (...explicit ids...); \
    DELETE FROM \"TenantDomain\" WHERE \"tenantId\" IN (...explicit ids...); \
    DELETE FROM \"Tenant\" WHERE id IN (...explicit ids...); \
    COMMIT;"'
```

**Always wrap in BEGIN/COMMIT.** Verify counts before COMMIT.

## Level 2 — ERP site + DB cleanup (recommendation C)

**HIGH RISK. Deletes the trainer's actual data.**

This is owned by `bench-agent` / `provisioning-agent`, not FitDesk. Path:

1. Get the `erpSiteName` and `erpDbName` from CP for each candidate tenant ID
2. Coordinate with the bench-agent owner
3. Use bench's `bench drop-site --force <site>` per site
4. Manually drop the MariaDB DB if `bench drop-site` doesn't (older bench versions don't always)

**Approval gate per tenant ID. NEVER batch-loop without per-ID approval.**

Forbidden without separate approval:
- `bench drop-site --force` against any active tenant
- `DROP DATABASE` against any DB whose name doesn't start with `_` (the smoke-DB prefix per Phase 2.6.5 evidence)

## Things that MUST NOT be cleaned automatically

- The accepted evidence tenant (`smoke-15`)
- Any tenant with `status = 'active'` regardless of slug
- Any tenant whose `id` appears in any FitDesk `WorkspaceProvisioning.tenantId` row (a real trainer is using it)
- Anything during a pilot trainer's working hours

## Verification after cleanup

```bash
# Tenant counts should match expectation
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
   "SELECT status, COUNT(*) FROM \"Tenant\" GROUP BY status"'

# Active tenants list — confirm no surprises
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
   "SELECT id, slug FROM \"Tenant\" WHERE status='\''active'\''"'

# Disk freed (Level 2 only) — compare before/after
docker exec axis-local-erp-backend-1 du -sh /home/frappe/frappe-bench/sites/
```

## Logging

Append a one-line entry to `docs/QA/CLEANUP_LOG.md` (create if needed) per cleanup batch:
```
2026-05-09  L1  smoke-1..10,smoke-12  approved-by=<operator>  rows-deleted=N
```

Operator scrutiny months later depends on this log existing.
