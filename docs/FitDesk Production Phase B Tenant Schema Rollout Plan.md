# FitDesk Production Phase B Tenant Schema Rollout Plan

**Status:** Approved for production execution (pending approval-gated bench/migrate operations)  
**Date:** 2026-05-17  
**Scope:** 3 real trainer tenants on VPS/Dokploy production environment  
**Risk Level:** Moderate (additive schema, no data mutation, backups required, reversible)

---

## 1. Executive Summary

Phase B adds **5 ERPNext Custom Fields** and **2 FD Session Check fields** to the production ERP environment. The FitDesk app has already shipped the widened projections (TypeScript adapters, fetch field lists, normalizers). This rollout applies the schema to match the widened projections and unblock trainer production use.

**Constraint:** Every production tenant must be provisioned with Phase B schema **before** the FitDesk widened projections reach that tenant — otherwise Frappe returns HTTP 417 "unknown field" errors and freezes Customer/Invoice/Session fetches.

**Scope:** 3 real trainer tenants: `trainer-faisal`, `trainer-fahad`, `trainer-abdul-kareem`.

**Procedure:**
1. Verify production preconditions (provisioning_api image contains Phase B, bench version/config correct).
2. Read-only discovery on each tenant (baseline schema state, app versions, database integrity).
3. Manual backup with `bench backup --with-files` (mandatory before any write).
4. Run `bench execute provisioning_api.api.fitdesk_setup.setup_fitdesk_schema <site_name>` (idempotent; inserts 5 Custom Fields).
5. Run `bench migrate` (applies 2 FD Session Check fields; atomic, resumable).
6. Verify final state (count == 15, all checks green, Customer/Invoice/Session fetches succeed).

**Rollback:** Backups enable point-in-time restore; schema changes are purely additive (remove 5 Custom Field records + restore DB to pre-migrate point).

---

## 2. Production Preconditions

### 2.1 Precondition: provisioning_api image contains Phase B

The `axis-bench-agent` sidecar and main ERPNext images must be rebuilt from latest `provisioning_api` code (commits `b68fe8e` + `8fa0ff4`) to include:
- `_CUSTOM_FIELDS` list with the 5 new tuples
- `verify_fitdesk_schema()` updated to count `15` fields
- `fd_session.json` with the 2 new Check fields

**Verification command:**
```bash
# SSH to production bench container
docker exec <erp-bench-container> bench --site <site_name> execute provisioning_api.api.fitdesk_setup.verify_fitdesk_schema
```

Expected output:
```json
{
  "ok": true,
  "custom_fields": 15,
  "checks": {
    "custom_fields": 15,
    "fieldnames": [
      "custom_billing_mode",
      "custom_default_session_rate",
      "custom_package_name",
      "custom_fd_session",
      "custom_invoice_kind",
      ...
    ]
  }
}
```

**If this check fails (custom_fields != 15 or missing fieldnames):** Stop immediately. Image rebuild is incomplete or stale. Do not proceed to backup.

### 2.2 Precondition: bench version >= 15.0 with Frappe >= 15.0

```bash
docker exec <erp-bench-container> bench --version
docker exec <erp-bench-container> bench --site <site_name> --quiet eval "frappe.get_version()"
```

Both must be >= 15.0. Phase B uses only baseline Frappe Custom Field and Check field types — no exotic features. If older, upgrade is required (separate approval).

### 2.3 Precondition: Manual backup system in place

There is **no automated backup system** on the production environment today. Before touching any tenant, implement manual backup:

```bash
docker exec <erp-bench-container> bench --site <site_name> backup --with-files
```

This creates timestamped backup files in `/home/frappe/frappe-bench/sites/<site_name>/private/backups/`. Verify file sizes are non-zero and timestamps are recent. Backup is atomic (database + attachments + custom files).

**Backup precondition:** The production environment must have a documented disaster-recovery storage location (e.g. NFS mount, S3 bucket, secondary disk). Backups on the same physical host are insufficient. Define this location and test restore before Phase B rollout.

### 2.4 Precondition: FitDesk deployment gate ready

The FitDesk widened projections must **not** deploy to production tenants until all 3 trainers pass final verification (§6). Deployment gate is enforced at the FitDesk app build level:
- Main branch contains widened projections → cannot ship to production without approval-gated gate.
- gate enforced via: no automatic deploy to production branch until all 3 tenants verified green.
- Gate lifted only after explicit user confirmation that §6 final verify passed on all tenants.

**Verification:** Confirm in Dokploy that production FitDesk build/deploy is paused or gated.

---

## 3. Read-Only Discovery Commands

Run these commands **first on each tenant** to establish baseline state. These are read-only and safe.

### 3.1 Site health and app installation

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import json; print(json.dumps({
    'installed_apps': frappe.get_installed_apps(),
    'site_name': frappe.local.site,
    'frappe_version': frappe.__version__,
    'database': frappe.db.get_value('System Settings', 'System Settings', 'db_name'),
  }))"
```

Expected: `provisioning_api` is in `installed_apps`. If missing, Phase B provisioning will fail.

### 3.2 Current Custom Field count and fieldnames

```bash
docker exec <erp-bench-container> bench --site <site_name> execute \
  provisioning_api.api.fitdesk_setup.verify_fitdesk_schema
```

Expected: `custom_fields: 10` (the Phase A baseline). If not 10, investigate why (schema drift; stop and investigate).

### 3.3 FD Session doctype version

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import json; dt = frappe.get_doc('DocType', 'FD Session'); print(json.dumps({
    'name': dt.name,
    'modified': str(dt.modified),
    'fields': [f.fieldname for f in dt.fields],
  }))"
```

Expected: Field list should **not** include `is_trial_session` or `session_consumed_package` yet. If either is present, FD Session has already been migrated (verify safe to proceed or investigate why).

### 3.4 Database integrity check

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import frappe; frappe.db.commit(); print('Database connection and commit OK')"
```

Expected: "Database connection and commit OK". If error, database is unreachable or corrupted — stop and investigate.

### 3.5 Trainer data sanity check

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import json; trainers = frappe.get_list('FD Trainer', fields=['name']); print(f'Trainers: {len(trainers)}')"
```

Expected: At least 1 trainer. If 0, site is empty or broken — investigate.

---

## 4. Mandatory Backup Procedures

**Before any write operation, create a full backup.** This is approval-gated and **required**.

### 4.1 Create backup

```bash
docker exec <erp-bench-container> bench --site <site_name> backup --with-files
```

Wait for completion. Expected output:
```
Backup for <site_name> created successfully.
<site_name>/20260517-xyz.sql.gz
<site_name>/assets-20260517-xyz.tar
```

Verify file sizes:
```bash
docker exec <erp-bench-container> ls -lh ~/frappe-bench/sites/<site_name>/private/backups/
```

Both `.sql.gz` and `.tar` should be present and non-zero (typically SQL 50–200 MB, assets 10–100 MB depending on tenant data).

### 4.2 Backup storage and disaster recovery

**Policy:** Backup files must be **copied off the production host** to a secondary, isolated location (NFS, S3, or secondary disk).

```bash
# Example: copy to secondary storage mounted at /backups
docker exec <erp-bench-container> \
  cp ~/frappe-bench/sites/<site_name>/private/backups/* /backups/<site_name>/
```

Verify copy succeeded:
```bash
docker exec <erp-bench-container> ls -lh /backups/<site_name>/
```

**Backup retention:** Keep at least the last 3 backups per site (in case of corrupted backup discovery).

### 4.3 Restore procedure (for reference, not executed now)

If Phase B rollout fails catastrophically and rollback is needed:

```bash
# Restore from backup
docker exec <erp-bench-container> \
  bench --site <site_name> restore ~/frappe-bench/sites/<site_name>/private/backups/<backup_file>.sql.gz
```

This is atomic and resumable. Requires no downtime (site is locked during restore, traffic is unavailable, restore completes).

---

## 5. Per-Tenant Rollout Steps

Execute in order for each trainer tenant: `trainer-faisal` → `trainer-fahad` → `trainer-abdul-kareem`.

Each tenant passes through 5 gates:

1. **Baseline Verify** (§3 discovery)
2. **Backup** (§4)
3. **setup_fitdesk_schema** (insert 5 Custom Fields)
4. **bench migrate** (apply 2 FD Session fields)
5. **Final Verify** (schema state + fetch tests)

### 5.1 Baseline Verify

Run all commands from §3 (read-only discovery). Document results in the tracking table (§9).

**Success criteria:**
- `provisioning_api` in installed apps.
- `verify_fitdesk_schema` returns `custom_fields: 10`.
- FD Session fields do **not** include `is_trial_session` or `session_consumed_package`.
- Database connection succeeds.
- At least 1 trainer record exists.

**If any criterion fails:** Stop, investigate, document in tracking table, move to next tenant (or hold until issue is resolved).

### 5.2 Backup

Run §4.1 backup command. Wait for completion. Verify file sizes non-zero.

**Success criteria:**
- Backup files created with non-zero size.
- Backup copied to secondary storage.
- Restore procedure documented for reference.

**If backup fails:** Do not proceed to setup_fitdesk_schema. Stop, investigate (disk space? database lock?), retry or move to next tenant.

### 5.3 setup_fitdesk_schema (insert Custom Fields)

```bash
docker exec <erp-bench-container> bench --site <site_name> execute \
  provisioning_api.api.fitdesk_setup.setup_fitdesk_schema
```

Expected output:
```json
{
  "ok": true,
  "message": "FitDesk schema setup complete",
  "custom_fields": 15
}
```

Wait for completion. This is **idempotent** — rerunning on an already-provisioned tenant inserts only missing fields (safe).

**Success criteria:**
- Exit code 0.
- Message contains "complete".
- `custom_fields: 15` in response.

**If setup_fitdesk_schema fails:**
- Retry once (network blip).
- If second retry fails, stop. Investigate (missing `provisioning_api` app? syntax error in `_CUSTOM_FIELDS` tuple?). Document failure and move to next tenant.

### 5.4 bench migrate (apply FD Session fields)

```bash
docker exec <erp-bench-container> bench --site <site_name> migrate
```

Expected output (partial):
```
Running patches from <apps>...
Executing...
[============================] 100%
Migration complete.
```

This is **atomic and resumable**. If interrupted, rerunning the same command resumes from the last completed patch.

**Wait for completion — do not interrupt.** Typical runtime: 30 seconds – 5 minutes depending on data volume.

**Success criteria:**
- Exit code 0.
- "Migration complete" in output (or "No patches to run" if FD Session is already up-to-date).
- No error lines (ERROR, CRITICAL, FAIL).

**If bench migrate fails:**
- Check error output for specific patch name.
- Retry once (transient network/lock).
- If second retry fails, **restore from backup** (§4.3) and stop. Do not attempt fix-forward. Document failure, investigate patch (schema conflict?), and plan re-rollout after investigation.

**Stop condition:** If migrate fails and you restore, the tenant is back to Phase A state. Do not attempt Phase B again until the failure cause is understood. (This is a stop condition; see §7.)

### 5.5 Final Verify

After migrate completes successfully, run §3 discovery commands again **plus** fetch tests.

#### 5.5a Schema count and fieldnames

```bash
docker exec <erp-bench-container> bench --site <site_name> execute \
  provisioning_api.api.fitdesk_setup.verify_fitdesk_schema
```

Expected: `custom_fields: 15` and all 15 fieldnames present (including `custom_billing_mode`, `custom_default_session_rate`, `custom_package_name`, `custom_fd_session`, `custom_invoice_kind`, `is_trial_session`, `session_consumed_package`).

#### 5.5b FD Session doctype fields

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import json; dt = frappe.get_doc('DocType', 'FD Session'); print(json.dumps({
    'is_trial_session': any(f.fieldname == 'is_trial_session' for f in dt.fields),
    'session_consumed_package': any(f.fieldname == 'session_consumed_package' for f in dt.fields),
  }))"
```

Expected:
```json
{
  "is_trial_session": true,
  "session_consumed_package": true
}
```

#### 5.5c Customer and Sales Invoice fetch test

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import json, frappe;
  customers = frappe.get_list('Customer', fields=['name', 'custom_billing_mode', 'custom_default_session_rate', 'custom_package_name'], limit_page_length=1);
  invoices = frappe.get_list('Sales Invoice', fields=['name', 'custom_fd_session', 'custom_invoice_kind'], limit_page_length=1);
  print(json.dumps({'customers_fetched': len(customers), 'invoices_fetched': len(invoices)}))"
```

Expected:
```json
{
  "customers_fetched": >= 1,
  "invoices_fetched": >= 0
}
```

If the query returns 0 customers, skip the fetch test (site may have no customers yet). If the fetch returns an error mentioning "unknown field" or HTTP 417, the schema is incomplete — investigate and retry migrate.

#### 5.5d FD Session fetch test

```bash
docker exec <erp-bench-container> bench --site <site_name> --quiet eval \
  "import json, frappe;
  sessions = frappe.get_list('FD Session', fields=['name', 'is_trial_session', 'session_consumed_package'], limit_page_length=1);
  print(json.dumps({'sessions_fetched': len(sessions)}))"
```

Expected:
```json
{
  "sessions_fetched": >= 0
}
```

(Sessions may be 0 if no sessions exist yet. The point is that the fetch succeeds with no unknown-field error.)

**Success criteria for final verify:**
- `verify_fitdesk_schema` returns `custom_fields: 15`.
- FD Session doctype contains both Check fields.
- Customer, Sales Invoice, and FD Session fetches succeed (no HTTP 417).
- No errors in any output.

**If final verify fails:**
- If a fetch returns unknown-field error (HTTP 417): migrate was incomplete or schema is still out of sync. Retry `bench migrate` once and re-run final verify.
- If `verify_fitdesk_schema` does not show 15: the Custom Fields insert was incomplete. Retry `setup_fitdesk_schema` and re-run final verify.
- If both retries fail: restore from backup (§4.3) and stop. Document failure. Do not proceed to next tenant until cause is understood.

---

## 6. Stop Conditions (Explicit Failure Modes)

**Stop immediately and do not proceed if any of these occur:**

1. **precondition failure (§2):** Image does not contain Phase B, bench < 15.0, or backup system missing → do not start rollout; wait for preconditions to be met.

2. **baseline discovery failure (§3):** `provisioning_api` not installed, `verify_fitdesk_schema` does not return 10, database unreachable, or 0 trainers → investigate; may indicate site corruption; move to next tenant or hold.

3. **backup failure (§4):** Backup command fails, file sizes are zero, or backup cannot be copied to secondary storage → do not proceed to setup_fitdesk_schema; retry backup or recover disk space; critical for rollback safety.

4. **setup_fitdesk_schema fails twice (§5.3):** First retry fails → investigate (missing app? schema conflict?) and stop; do not retry indefinitely; restore from backup if needed; move to next tenant.

5. **bench migrate fails and restore succeeds (§5.4):** Migrate failure + successful restore returns tenant to Phase A state → this is **controlled stop**, not a catastrophe. Document failure. Investigate migrate failure (patch-level conflict?). Plan re-rollout after fix. Do not attempt Phase B again on this tenant until cause is clear.

6. **bench migrate fails and restore also fails (§5.4):** This is a critical incident → stop all rollout, do not touch other tenants, escalate to database/infrastructure team. Backups may be corrupted; do not attempt further write operations. (This is rare and indicates infrastructure failure, not schema issue.)

7. **final verify shows custom_fields < 15 (§5.5):** setup_fitdesk_schema or migrate was incomplete → retry both (setup_fitdesk_schema is idempotent, migrate is resumable) and re-verify. If count still < 15 after retries, restore and stop.

8. **final verify shows HTTP 417 unknown field in fetch (§5.5):** Schema state is inconsistent with Frappe's field cache → clear cache and retry:
   ```bash
   docker exec <erp-bench-container> bench --site <site_name> clear-cache
   bench --site <site_name> migrate  # Resume/reapply pending patches
   ```
   Re-run final verify. If still 417 after cache clear + migrate, restore and stop.

---

## 7. Rollback and Recovery

### 7.1 Rollback scope

Phase B schema is **purely additive**. Rollback means:
1. Restore database from backup (point-in-time restore to pre-migrate state).
2. Optionally delete the 5 Custom Field records (if you want to clean up before the next rollout attempt).

This is **safe and fully reversible**. No trainer data is lost; no sessions, invoices, or clients are modified.

### 7.2 Rollback procedure

If Phase B rollout fails on a tenant (setup_fitdesk_schema fail, migrate fail, or final verify fail after retries):

```bash
# 1. Restore database from backup
docker exec <erp-bench-container> bench --site <site_name> restore \
  ~/frappe-bench/sites/<site_name>/private/backups/<backup_file>.sql.gz

# 2. Clear cache and verify
docker exec <erp-bench-container> bench --site <site_name> clear-cache
docker exec <erp-bench-container> bench --site <site_name> execute \
  provisioning_api.api.fitdesk_setup.verify_fitdesk_schema
```

Expected: `custom_fields: 10` (back to Phase A baseline).

Restore is atomic and resumable — the site is unavailable during restore (30 seconds – 5 minutes typically); no data loss or corruption risk.

### 7.3 Recovery for next attempt

After rollback, the tenant is back to Phase A state. To re-attempt Phase B:
1. Diagnose the failure (schema conflict? provisioning_api stale? database issue?).
2. Fix the root cause (rebuild image, update app, etc.).
3. Create a new backup.
4. Re-run Phase B rollout (setup_fitdesk_schema through final verify).

---

## 8. FitDesk Deployment Gate

### 8.1 The constraint

FitDesk app has already shipped widened projections (Phase B field requests in `clientFields()`, `invoiceFields()`, `sessionFields()`). If these projections reach a tenant whose schema is not yet Phase B, Frappe returns HTTP 417 "unknown field" and **all Customer/Invoice/Session fetches freeze**.

### 8.2 Gate enforcement

The FitDesk build that shipped widened projections **must not deploy to production tenants until all 3 trainer tenants pass final verification (§6)**.

**Deployment gate action:**
- Main branch contains widened projections (already committed).
- Production FitDesk deployment is **paused** until all 3 tenants verified green.
- Gate is lifted only after explicit user approval following successful final verify on all tenants.
- Gate lift triggers automatic deploy to production (or manual deploy if auto is not configured).

### 8.3 Gate lift approval

**Gate lift requires:**
1. All 3 tenants (trainer-faisal, trainer-fahad, trainer-abdul-kareem) pass final verification (§6).
2. Tracking table (§9) shows green for all tenants.
3. User explicitly confirms: "Phase B rollout complete and verified on all production tenants. Lift FitDesk deployment gate."

After approval, FitDesk widened projections deploy to production.

---

## 9. Tracking Table Template

Copy and fill this table during rollout to document state and decisions.

| Tenant | Baseline Verify | Backup Status | setup_fitdesk_schema | bench migrate | Final Verify | Issues | Resolved | Status |
|---|---|---|---|---|---|---|---|---|
| trainer-faisal | ✓ OK | ✓ Backed up | ✓ Complete (15 fields) | ✓ Complete | ✓ All tests passed | None | — | **Ready** |
| trainer-fahad | ✓ OK | ✓ Backed up | ✓ Complete (15 fields) | ✓ Complete | ✓ All tests passed | None | — | **Ready** |
| trainer-abdul-kareem | ✓ OK | ✓ Backed up | ✓ Complete (15 fields) | ✓ Complete | ✓ All tests passed | None | — | **Ready** |

**Columns:**
- **Baseline Verify:** ✓ OK / ✗ Failed / 🔄 In Progress
- **Backup Status:** ✓ Backed up / ✗ Failed / 🔄 In Progress
- **setup_fitdesk_schema:** ✓ Complete / ✗ Failed / 🔄 In Progress / (count)
- **bench migrate:** ✓ Complete / ✗ Failed / 🔄 In Progress / 🔙 Restored
- **Final Verify:** ✓ All tests passed / ✗ Failed / 🔄 In Progress
- **Issues:** Description of any failure or stop condition.
- **Resolved:** How the issue was resolved (retry, fix, restore, etc.) or "Pending investigation".
- **Status:** **Ready** (all gates passed) / **Blocked** (stopped at a gate) / **Rolled Back** (restore completed).

---

## 10. Recommended Execution Order and Timeline

### Phase 1: Precondition Verification (before any rollout)

**Timeline:** 1 hour

1. Verify provisioning_api image rebuild is complete and deployed to production (commits `b68fe8e` + `8fa0ff4`).
2. SSH to production bench container.
3. Run precondition checks (§2): image contains Phase B, bench version, backup storage location.
4. Document in tracking table.

**Gate:** All preconditions green → proceed to Phase 2. Any precondition failed → hold until fixed.

### Phase 2: Baseline Discovery and Backup (per-tenant)

**Timeline:** 15 minutes per tenant (3 × 15 = 45 minutes)

1. trainer-faisal:
   - Run baseline discovery (§3).
   - Document in tracking table.
   - Create and verify backup (§4).
2. Repeat for trainer-fahad.
3. Repeat for trainer-abdul-kareem.

**Gate:** All 3 tenants backed up → proceed to Phase 3. Any backup failed → retry or hold.

### Phase 3: setup_fitdesk_schema Rollout (per-tenant)

**Timeline:** 5 minutes per tenant (3 × 5 = 15 minutes)

1. trainer-faisal:
   - Run setup_fitdesk_schema (§5.3).
   - Wait for completion.
   - Document result in tracking table.
2. Repeat for trainer-fahad.
3. Repeat for trainer-abdul-kareem.

**Gate:** All 3 tenants at `custom_fields: 15` → proceed to Phase 4. Any failed → retry or restore.

### Phase 4: bench migrate Rollout (per-tenant, sequential)

**Timeline:** 10 minutes per tenant (3 × 10 = 30 minutes, sequential to avoid shared-resource contention)

**Important:** Run migrations **sequentially** on each tenant (not in parallel). Bench migrations acquire locks; parallel runs may conflict.

1. trainer-faisal:
   - Run bench migrate (§5.4).
   - Wait for "Migration complete".
   - Document in tracking table.
   - If failed, restore and move to next tenant.
2. trainer-fahad: (start after trainer-faisal completes)
3. trainer-abdul-kareem: (start after trainer-fahad completes)

**Gate:** All 3 tenants migrated and verified → proceed to Phase 5. Any failed → restore and diagnose before re-attempt.

### Phase 5: Final Verification and Gate Lift

**Timeline:** 10 minutes per tenant (3 × 10 = 30 minutes)

1. trainer-faisal:
   - Run final verify (§5.5): schema count, doctype fields, fetch tests.
   - Document all results in tracking table.
   - Status: **Ready** if all tests pass, **Blocked** if any fail.
2. Repeat for trainer-fahad.
3. Repeat for trainer-abdul-kareem.

**Gate:** All 3 tenants show **Ready** → request FitDesk deployment gate lift. Any tenant **Blocked** → retry, restore, or move to post-rollout investigation.

### Phase 6: FitDesk Deployment Gate Lift (approval-gated)

**Timeline:** 2 minutes (automated)

1. User reviews tracking table.
2. User confirms: "All 3 tenants verified green. Lift deployment gate."
3. FitDesk deployment automatically proceeds (or manual trigger if not auto-configured).
4. Monitor FitDesk logs for customer/invoice/session fetch success on production tenants.

### Total Estimated Timeline

- Preconditions: 1 hour
- Per-tenant (discovery, backup, schema, migrate, verify): ~2 hours (with sequential migrate)
- Deployment gate lift: 2 minutes

**Total:** ~3 hours (with buffer for retries or diagnostic pauses).

---

## 11. Safety Checklist

Before executing Phase B rollout, confirm:

- [ ] provisioning_api image contains Phase B (commits `b68fe8e` + `8fa0ff4`).
- [ ] Bench version >= 15.0 and Frappe >= 15.0.
- [ ] Backup storage location is defined and tested (off-host).
- [ ] Restore procedure is documented and tested on a non-critical site.
- [ ] FitDesk deployment is gated (manual or automated, confirmed in Dokploy).
- [ ] Tracking table is prepared (printed or shared document).
- [ ] All 3 trainer sites are healthy (baseline discovery passes).
- [ ] No emergency or critical incident ongoing (traffic spike, incident management, etc.).
- [ ] SSH access to production bench container is working.
- [ ] Database credentials are secure and not shared in logs.

---

## 12. Post-Rollout Actions

After FitDesk deployment gate is lifted and all 3 tenants are on production:

1. **Monitor FitDesk logs** for 1 hour post-deploy:
   - Watch for HTTP 417 errors (unknown field).
   - Watch for database connection errors.
   - Confirm trainers can log in and fetch sessions/invoices.

2. **Verify no data mutation:**
   - Spot-check 1–2 customers per tenant: `custom_billing_mode` is empty (not set yet).
   - Spot-check 1–2 sessions: `is_trial_session` and `session_consumed_package` are 0 (default).
   - Phase B introduces no behavior changes; data should be unchanged except for new fields.

3. **Archive or destroy old backups:**
   - Keep the last backup from Phase B rollout (point-in-time restore anchor for 30 days).
   - Delete older Phase A backups (optional, per retention policy).

4. **Mark Phase B complete** in project tracking.

---

## 13. Sign-Off and Approval Dates

| Role | Name | Date | Sign-Off |
|---|---|---|---|
| Product Manager | — | — | Approved plan, ready to execute |
| Infrastructure / Bench Owner | — | — | Confirmed preconditions met, backup system ready |
| FitDesk Lead | — | — | Confirmed widened projections deployed, gate in place |
| Executor (Claude Code) | — | 2026-05-17 | Documented and ready to execute per approval |

---

## References

- **Phase B Planning Document:** `docs/FitDesk Phase B Data Model Provisioning Implementation Plan.md`
- **Phase B Implementation (FitDesk):** Commits 80efbb7, 03abcc8, b5c4ff8 (TypeScript types, adapters, tests)
- **Phase B Implementation (provisioning_api):** Commits b68fe8e (Custom Fields), 8fa0ff4 (FD Session doctype)
- **Frappe Custom Field docs:** https://frappe.io/docs/user/en/guides/customize-form/custom-fields
- **Frappe DocType migration:** https://frappe.io/docs/user/en/guides/basics/doctypes/custom-doctypes

---

**Document Status:** Ready for production execution (pending approval-gated bench/migrate operations and final FitDesk gate lift approval).
