# Backups

**Risk level:** Low (read-only operations).
**Pre-conditions:** SSH access to the production VPS or admin access to the Turso console.

## What to back up

| Data | Source of truth | Backup mechanism |
|---|---|---|
| FitDesk auth + app DB (`auth.db`) | Local SQLite or Turso | Volume snapshot (local) or Turso point-in-time (production) |
| Control Plane Postgres (tenant + job records) | `cp-postgres` container volume | `pg_dump` to S3 / equivalent |
| ERPNext per-tenant DB (the trainer's actual business data) | `erp-db` MariaDB container | `mariadb-dump` per site DB; OR ERPNext's bench backup |
| ERPNext per-tenant site files | `erp-backend` container `/sites/<site>` directory | tar of the site directory |
| `message_log` audit | inside `auth.db` (auth+app) | covered by FitDesk DB backup above |

## FitDesk DB — Local SQLite (Docker volume)

Compose maps `auth.db` to the named volume `fitdesk-data`. Snapshot the volume:

```bash
# Stop the container first to ensure a consistent file
docker compose -f docker-compose.local.yml stop fitdesk

# Copy the volume contents to a tar.gz on the host
docker run --rm \
  -v fitdesk-data:/data \
  -v "$(pwd):/backup" \
  alpine tar czf /backup/fitdesk-db-$(date +%F).tar.gz -C /data .

docker compose -f docker-compose.local.yml start fitdesk
```

Cadence: daily for active deployments, before any planned change otherwise. Retention: 14 days minimum.

## FitDesk DB — Turso (production-recommended)

When `DATABASE_URL=libsql://...turso.io`, backups are managed by Turso. Their console exposes:
- Point-in-time recovery (PITR) — last 7 days on Pro plan
- Manual snapshots
- Export to file

**No FitDesk-side action required**, but the operator MUST verify in the Turso console that PITR is enabled before pilot launch.

## Control Plane Postgres

Use `pg_dump` against the running container. Credentials are in the container env (don't print to chat — use `$POSTGRES_PASSWORD` indirection):

```bash
docker exec -i axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > cp-postgres-$(date +%F).sql
```

Restore (destructive — see RESTORE.md).

## ERPNext per-tenant DB and site files

**Owned by `bench-agent` / `provisioning-agent`, not by FitDesk.** The official path is ERPNext's `bench backup` per site. Cross-link:

- `bench-agent/README.md` — defines the bench-side helpers
- `provisioning-agent/docker-compose.dokploy.yml` — defines volumes that hold site backups

For ad-hoc emergency backup of a single tenant DB:

```bash
# Inside the erp-db container, dump one site's DB by name (from CP postgres "Tenant" table .erpDbName)
docker exec axis-local-erp-db-1 sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "<erpDbName>"' \
  > erp-<slug>-$(date +%F).sql
```

DO NOT do this in a production loop — coordinate with the bench-agent owner.

## Verification

A backup that hasn't been restored once is not a backup. Once per quarter:

1. Spin up a throwaway `fitdesk` container against a copy of the backup
2. Confirm the latest `WorkspaceProvisioning` row is present
3. Confirm `message_log` has expected row counts
4. Tear down the throwaway container

Document the verification date and outcome in `docs/QA/BACKUP_VERIFICATION_LOG.md` (create if needed).

## Approval gate

No approval needed for **taking** a backup. Storing the file outside the VPS (e.g. S3 sync) is also fine. Restoring TO production requires the named operator's approval — see RESTORE.md.
