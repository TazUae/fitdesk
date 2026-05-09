# Restore

**Risk level:** HIGH (destroys current state).
**Approval gate:** Named operator must say yes in writing before any step that overwrites a live volume or DB.
**Pre-conditions:** Recent verified backup exists (see BACKUPS.md).

## Decision tree

| Symptom | Likely scope | Restore type |
|---|---|---|
| Trainer can't sign in; auth.db missing/corrupt | FitDesk-only | "FitDesk DB only" below |
| Provisioning UI broken; CP shows no tenants | CP-only | "Control Plane Postgres" below |
| Specific trainer's clients/sessions/invoices missing | Tenant ERP | "Per-tenant ERPNext" below |
| Multiple symptoms across stack | Coordinated | Bring stack down, restore in order: CP → ERP → FitDesk |

## FitDesk DB only (restore from local snapshot)

```bash
# Stop the container — restoring to a live volume will corrupt
docker compose -f docker-compose.local.yml stop fitdesk

# Replace the volume contents
docker run --rm \
  -v fitdesk-data:/data \
  -v "$(pwd):/backup" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/fitdesk-db-YYYY-MM-DD.tar.gz -C /data'

docker compose -f docker-compose.local.yml start fitdesk
```

Verify after restore:
```bash
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute('SELECT COUNT(*) AS n FROM user').then(r => console.log(r.rows[0].n))"
```

## Control Plane Postgres

Postgres credentials in the data volume must match the running container env. If the backup was taken with different credentials, you have two options:

1. Restore the data and ALTER USER to match the current env (see SUPPORT.md "rotating local-stack secrets")
2. Restore both the data AND the env that produced it

```bash
docker compose -f docker-compose.local.yml stop cp-api cp-worker

# Pipe the dump back in (uses current container's POSTGRES_PASSWORD)
docker exec -i axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < cp-postgres-YYYY-MM-DD.sql

docker compose -f docker-compose.local.yml start cp-api cp-worker
```

Verify:
```bash
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM \"Tenant\""'
```

## Per-tenant ERPNext

**Owned by `bench-agent` / `provisioning-agent`. FitDesk cannot restore an ERP tenant DB.** Coordinate with the bench-agent owner. The official path:

1. Identify the site name from CP Postgres `Tenant.erpSiteName` for the affected tenantId
2. Use bench's `bench restore` against that site's backup
3. Verify the FitDesk WorkspaceProvisioning row still points to the same `tenantId`
4. Smoke-test from FitDesk: log in as the trainer, list clients

If FitDesk's `WorkspaceProvisioning` row was lost, manually re-link (see SUPPORT.md "manually link a trainer to an existing tenant").

## Verification after any restore

Run the backend audit smoke (mirrors what we ran 2026-05-09):
```bash
# 1. All containers healthy
docker ps --format "{{.Names}} {{.Status}}"

# 2. FitDesk auth.db reachable, expected tables present
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute(\"SELECT name FROM sqlite_master WHERE type='table'\").then(r => console.log(r.rows.map(x=>x.name).join(', ')))"

# 3. CP postgres tenant count matches expectation
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT status, COUNT(*) FROM \"Tenant\" GROUP BY status"'

# 4. End-to-end ERP read via FitDesk → CP → ERP for the active tenant
# (script lives in scripts/smoke/erp-roundtrip.mjs after Phase 5.0.8)
```

## Approval gate (always)

Any restore that overwrites production data requires:
- Named operator's written approval (Slack message, ticket comment, signed email)
- Documented backup ID being restored
- Documented expected row counts AFTER restore
- Documented rollback plan if the restore goes wrong

Do not restore to production "just to see if it works".
