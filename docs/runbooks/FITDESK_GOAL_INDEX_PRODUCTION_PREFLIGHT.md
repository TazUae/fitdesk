# FitDesk — Goal Index Production Migration Preflight Runbook

| | |
|---|---|
| **Product** | FitDesk |
| **Scope** | Two goal-system partial UNIQUE indexes on `client_goal` only |
| **Related code** | `scripts/migrate-app.mjs`, `lib/db/schema.ts` |
| **Ordering hardening** | commit `fa0c658` (`fix(goals): harden client goal index migration ordering`) |
| **Freeze report** | `docs/audits/FITDESK_GOAL_SYSTEM_FUNCTIONAL_CLOSURE_FREEZE_REPORT.md` §5, §5.1 |
| **Status** | Operator-driven. Nothing here has been executed against production. |

> **This runbook is read-first.** Every step below up to and including the scans is **read-only**. No step is authorized to mutate production without the explicit human gates in section B being satisfied first. Claude did **not** run any of these against production and holds no production credentials.

---

## A. Purpose and Authority

This preflight prepares the safe application of exactly **two** additive, idempotent partial UNIQUE indexes on the `client_goal` table:

1. **`client_goal_active_uniqueness`** — `UNIQUE (tenant_id, client_index_id, goal_id) WHERE status = 'active'` — at most one active row per (tenant, client, goal).
2. **`client_goal_active_primary`** — `UNIQUE (tenant_id, client_index_id) WHERE status = 'active' AND is_primary = 1` — at most one active primary per (tenant, client).

These are **defense-in-depth** only: the repository layer (`replaceClientGoals`) already enforces the same invariants in application code. The indexes make an invalid **active** state impossible at the storage layer. Archived rows (`status='archived'`) are outside both predicates, so archive history and reactivation are unaffected.

**Authority boundaries:**
- The production database is **Turso / libSQL**, addressed by `DATABASE_URL` + `DATABASE_AUTH_TOKEN` — **but this must be confirmed by an operator against the live Dokploy environment before proceeding.** Do not assume, print, or guess the production identity, URL, token, or any credential.
- `migrate-app.mjs` runs **automatically** on every deploy via `scripts/start-with-migrations.mjs`, **before** the app server starts. A non-zero migration exit **aborts container startup** (crash-loop / failed deploy). Treat the migration as a hard release gate.
- No manual production DDL, no manual index creation, no data repair is authorized by this runbook. The controlled Git/Dokploy release path (section E) is the default and only recommended mechanism.

---

## B. Required Gates (all human-owned; must be satisfied in order)

1. **Exact production database identity** — operator confirms the live Turso/libSQL database name/region actually used by the production FitDesk deployment. Record it. Do not proceed on assumption.
2. **Verified backup artifact + UTC timestamp** — a fresh backup of that exact database exists; record artifact id and UTC timestamp.
3. **Documented restore procedure** — the exact steps to restore that artifact are written down and reviewed.
4. **Restore-verification evidence** — a test restore has been performed (or explicitly scheduled and signed off) and verified to load.
5. **Read-only conflict scans = clean** — section C run against the confirmed production database via approved read-only access; section D expected results all met.
6. **Approved maintenance / deployment window** — a window is agreed with whoever owns production uptime.
7. **Explicit human authorization** — a named human approves the migration + rollback plan. Claude cannot and does not grant this.

> If **any** gate is unmet, STOP. Do not deploy, do not migrate, do not create indexes manually.

---

## C. Read-Only SQL (run only after gate B.1; via approved read-only access)

All statements are `SELECT` / `PRAGMA` only — non-mutating. They return **no PII** (no names, phones, notes) — only ids, status, the primary flag, and timestamps. `client_goal` has **no `archived_at_utc` column**; the archive marker is the `status` column, and timestamps are `created_at_utc` / `updated_at_utc`.

### C1. Duplicate active goal groups
```sql
SELECT tenant_id, client_index_id, goal_id, COUNT(*) AS active_row_count
FROM client_goal
WHERE status = 'active'
GROUP BY tenant_id, client_index_id, goal_id
HAVING COUNT(*) > 1
ORDER BY active_row_count DESC;
```

### C2. Multiple active primary groups
```sql
SELECT tenant_id, client_index_id, COUNT(*) AS active_primary_count
FROM client_goal
WHERE status = 'active' AND is_primary = 1
GROUP BY tenant_id, client_index_id
HAVING COUNT(*) > 1
ORDER BY active_primary_count DESC;
```

### C3. Backfill-induced multiple-primary hazard
The `is_primary` backfill sets `is_primary = 1` where `goal_id = client_index.primary_goal_id`. This runs before the primary index; a group that would gain a 2nd active primary makes the backfill update violate the index and abort the deploy.
```sql
SELECT cg.tenant_id, cg.client_index_id,
       COUNT(*) AS active_rows_that_would_be_primary
FROM client_goal cg
JOIN client_index ci
  ON ci.id = cg.client_index_id AND ci.tenant_id = cg.tenant_id
WHERE cg.status = 'active'
  AND (cg.is_primary = 1 OR cg.goal_id = ci.primary_goal_id)
GROUP BY cg.tenant_id, cg.client_index_id
HAVING COUNT(*) > 1
ORDER BY active_rows_that_would_be_primary DESC;
```

### C4. `is_primary` column presence
Confirms the migration's index step will not hit the historical fresh-bootstrap ordering defect on this specific database. (Since `fa0c658`, fresh bootstraps are also safe; this remains a cheap sanity check.)
```sql
PRAGMA table_info("client_goal");
-- Expect a row with name = 'is_primary'. If ABSENT, escalate — do not migrate.
```

### C5. Current target-index state
```sql
SELECT name, sql
FROM sqlite_master
WHERE type = 'index'
  AND name IN ('client_goal_active_uniqueness', 'client_goal_active_primary');
-- Also record all client_goal indexes for context:
SELECT name, sql FROM sqlite_master
WHERE type = 'index' AND tbl_name = 'client_goal';
```

### C6. Conflict-detail rows (only if C1/C2 return groups; IDs + flags + timestamps only)
```sql
-- Detail for duplicate-active-goal groups (C1)
SELECT cg.id, cg.tenant_id, cg.client_index_id, cg.goal_id, cg.is_primary,
       cg.status, cg.created_at_utc, cg.updated_at_utc
FROM client_goal cg
JOIN ( SELECT tenant_id, client_index_id, goal_id
       FROM client_goal WHERE status = 'active'
       GROUP BY tenant_id, client_index_id, goal_id HAVING COUNT(*) > 1 ) dup
  ON dup.tenant_id = cg.tenant_id
 AND dup.client_index_id = cg.client_index_id
 AND dup.goal_id = cg.goal_id
WHERE cg.status = 'active'
ORDER BY cg.tenant_id, cg.client_index_id, cg.goal_id, cg.created_at_utc;

-- Detail for multiple-active-primary groups (C2)
SELECT cg.id, cg.tenant_id, cg.client_index_id, cg.goal_id, cg.is_primary,
       cg.status, cg.created_at_utc, cg.updated_at_utc
FROM client_goal cg
JOIN ( SELECT tenant_id, client_index_id
       FROM client_goal WHERE status = 'active' AND is_primary = 1
       GROUP BY tenant_id, client_index_id HAVING COUNT(*) > 1 ) mp
  ON mp.tenant_id = cg.tenant_id
 AND mp.client_index_id = cg.client_index_id
WHERE cg.status = 'active' AND cg.is_primary = 1
ORDER BY cg.tenant_id, cg.client_index_id, cg.created_at_utc;
```

---

## D. Expected Clean Results

| Check | Clean result | If not clean |
|---|---|---|
| C1 duplicate active goal groups | **0 rows** | Remediation required (separate approved action) before migration. |
| C2 multiple active primary groups | **0 rows** | Remediation required before migration. |
| C3 backfill hazard groups | **0 rows** | Remediation required before migration. |
| C4 `is_primary` column | **present** | Escalate — do not migrate until understood. |
| C5 target indexes | **explicitly recorded** (expected: 0 rows / not yet present in production) | If already present, the migration is a confirmed no-op (`IF NOT EXISTS`). |

Record every result (including the "0 rows" ones and the C5 index state) in the deployment ticket before proceeding.

---

## E. Controlled Release Sequence (recommended)

Prefer the Git/Dokploy-controlled path. Do **not** manually create production indexes ahead of the release unless a separate, human-approved incident/migration decision explicitly authorizes that exception.

1. **Confirm identity** (gate B.1).
2. **Verify backup + restore readiness** (gates B.2–B.4).
3. **Execute approved read-only scans** (section C) via approved read-only access.
4. **Review clean results** (section D); record them. Remediate any conflict via a separate approved action, then re-scan.
5. **Approve** a controlled merge/deployment window (gates B.6–B.7).
6. **Deploy through Git/Dokploy** — merge the closure branch (including `fa0c658`) so the checked-in `migrate-app.mjs` is what runs.
7. **Automatic checked-in migration executes** on container start (`start-with-migrations.mjs` → `migrate-app.mjs`), in the hardened order: columns → backfills → `client_goal_active_uniqueness` → `client_goal_active_primary`.
8. **Verify indexes + app health** — re-run C5 (both indexes now present with expected SQL); confirm `/api/health` returns `200`; confirm deploy logs show `✓ client_goal_active_uniqueness index present` and `✓ client_goal_active_primary index present` and no `[app-migration] ... failed` line.
9. **Execute Goal smoke tests** — Add Client (one/zero/multi goal), Edit Goals (change primary, add/remove), a progress entry with and without a goal link. Confirm tenant scoping (no cross-tenant leakage).
10. **Monitor logs** through the window for migration or constraint errors.

---

## F. Rollback

Distinguish three separate actions — they are **not** interchangeable:

- **Application image rollback** — redeploy the previous image. Note: the previous `migrate-app.mjs` contains **no `DROP INDEX`**, so rolling back the app does **not** remove the indexes; they persist. The additive indexes are forward-compatible with prior code that respected the same invariants.
- **Database restore** — restore the verified backup artifact (gate B.2). This is the recovery path for data-level problems, and requires the documented restore procedure (B.3) and its verification (B.4).
- **Index removal** — `DROP INDEX client_goal_active_uniqueness; DROP INDEX client_goal_active_primary;`. This is **NOT** an automatic rollback and must **not** be scripted into the deploy. It requires **separate explicit human authorization and a verified backup**. Data is not corrupted by dropping them (the repository enforces the same invariants in application code), but removal is a deliberate, approved decision.

---

## G. Operator-Only Next Action (one read-only command)

After confirming the production database identity (gate B.1), run this single non-mutating statement via approved read-only access. It returns, in one shot, whether production currently violates either invariant the indexes will enforce:

```sql
SELECT 'duplicate_active_goal' AS conflict_class, COUNT(*) AS conflicting_groups FROM (
  SELECT 1 FROM client_goal WHERE status='active'
  GROUP BY tenant_id, client_index_id, goal_id HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'multiple_active_primary', COUNT(*) FROM (
  SELECT 1 FROM client_goal WHERE status='active' AND is_primary=1
  GROUP BY tenant_id, client_index_id HAVING COUNT(*) > 1
);
```

**What it proves:** two zeros means the indexes can be created without a data-conflict failure (still gated on backup + the C4 `is_primary` check). Any non-zero means the migration would hard-fail the deploy today — remediation required first. **Claude has not run this**; it is for the operator to run after identity confirmation. No write action is bundled.

---

## H. Deferred Work

- **Pay-per-Session rate visibility / editing** remains **separate** from this Goal System closure and this migration preflight. It is a distinct release-blocking track and must be handled on its own branch.
- **Do not begin Pay-per-Session work as part of this migration/preflight effort.**
