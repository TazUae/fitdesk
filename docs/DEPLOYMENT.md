# Deployment

How FitDesk is deployed and what assumptions the production environment makes.

## Target environment

- Single VPS, Dokploy as the orchestrator
- Reverse proxy upstream of Dokploy handles TLS termination
- Docker network `dokploy-network` (declared external in `docker-compose.yml`)
- Production DB: Turso (libsql) — see ENV_REFERENCE.md `DATABASE_URL` row

## Build args (baked at `docker build`)

`NEXT_PUBLIC_*` env vars are inlined by the Next.js compiler at build time. Changes require a rebuild.

| Build arg | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public URL of the deployment |
| `NEXT_PUBLIC_API_URL` | `/api` | Keep relative |
| `NODE_BASE_IMAGE` | `node:20-slim` | Override at build time if needed |

## Runtime env

Required + optional vars: see [docs/ENV_REFERENCE.md](./ENV_REFERENCE.md).

`scripts/start-with-migrations.mjs` runs at container start and:
1. Validates env (strict in production, warn in dev) via `scripts/env-validate.mjs`
2. Runs auth migration (`scripts/migrate.mjs`)
3. Runs app migration (`scripts/migrate-app.mjs`) — idempotent, safe to re-run
4. Starts the standalone Next.js server

A misconfigured deployment fails LOUD at step 1 — the container exits with a clear error before serving any request.

## Cross-container consistency (the secret-rotation footgun)

These env values MUST match across services. Mismatch produces 401/403 errors visible in the UI:

| Value | Containers |
|---|---|
| `CONTROL_PLANE_API_KEY` | `axis-local-fitdesk` ↔ `axis-local-cp-api` ↔ `axis-local-cp-worker` |
| `FITDESK_JWT_SECRET` | `axis-local-fitdesk` ↔ `axis-local-cp-api` |
| Postgres password (in CP DATABASE_URL + `axis-local-cp-postgres` POSTGRES_PASSWORD) | data volume holds the OLD value; recreate container does NOT update it |

When rotating, recreate ALL dependent containers in one shot. **Do not** use `--no-deps` against just one of them. If the postgres password rotates, ALTER USER inside the running postgres BEFORE recreating cp-api/cp-worker (see SUPPORT.md).

## Healthcheck

Default: `GET /api/health` returns 200 when the Node process is up. Cheap, unauthenticated.

Operator deep view: `GET /api/health?deep=1` (auth required) reports tenant context presence + Control Plane reachability + provisioning failure reasons.

## Rollback

The Phase 5.0 baseline lives on `wip/main-2026-04-25`. Each sub-phase is a single commit with descriptive message — `git revert <sha>` works on any individual sub-phase without dragging the others.

For container rollback in Dokploy:
1. Identify the previous good image tag from Dokploy's deployment history
2. Pin the image tag in `docker-compose.yml` (or via Dokploy UI)
3. Redeploy
4. Run the backend audit smoke (see RUNBOOKS/RESTORE.md "Verification after any restore")

For DB rollback: see RUNBOOKS/RESTORE.md.

## Branch / commit strategy

- `wip/main-2026-04-25` is the active branch for Phase 4 + Phase 5 work
- Pilot launch tag: created from this branch when 5.0.10 sign-off is complete
- Hotfixes during pilot: branch from the launch tag → `hotfix/<phase>-<short-name>` → cherry-pick or merge back to `wip/main-2026-04-25`
- DO NOT push directly to `main` until the pilot accepts the build and a separate merge phase is agreed

## Sibling-repo state catalogue (audit, 2026-05-09)

These repos live next to FitDesk in `C:\Users\Lenovo\Dev\axis-erp\` and ARE part of the deployed stack. Their dirty/behind state is a **reproducibility risk**.

| Repo | Branch state | Dirty files (count) | Reproducibility risk |
|---|---|---|---|
| `control-plane` | behind 6 | 13 (modified + 8 deletions of provisioning-agent subtree) | **MEDIUM** — local diffs include `prisma/schema.prisma` + `package.json` |
| `provisioning-agent` | behind 12 | 7 modified + 5 untracked (site-steps forwarder + tests) | **HIGH** — untracked `src/clients/site-steps-forwarder.ts` is loadbearing for site provisioning |
| `provisioning_api` | in sync | 1 deletion + 11 untracked (.py files + doctype/ + templates/ + tests/) | **HIGH** — untracked `api/fitdesk_setup.py` is the source of the customer custom fields the FitDesk app reads. `api/scheduling.py`, `api/user.py`, `api/bootstrap.py` are similarly load-bearing |
| `erp-execution-service` | behind 5 | 12 modified + 2 deletions (services/create-site\*) | **MEDIUM** |
| `bench-agent` | in sync | 0 source-level (only `__pycache__` cruft) | LOW |
| `fitdesk-app` | in sync | 0 | NONE |

## Pilot dependency on new-tenant provisioning

**Question:** does the pilot require the ability to provision NEW tenants, or is it only against an already-provisioned tenant?

**Answer for the immediate pilot:** the live tenant is `phase-264-fitdesk-repeat-2` (`8168e424-ea93-4cf7-9903-a1b5241354d5`), already provisioned and verified end-to-end (see backend audit 2026-05-09).

**Implication:**
- If pilot stays on `repeat-2` only → sibling-repo dirtiness is an OPS HYGIENE risk, not a pilot blocker. Document and defer.
- If pilot needs to onboard a NEW trainer with a NEW tenant → the entire 15-step provisioning path runs across `control-plane`, `provisioning-agent`, `provisioning_api`, `erp-execution-service`, `bench-agent`. Any of those running uncommitted code is a **pilot blocker**. Resolution = commit + push the relevant repos before pilot.

This needs an explicit yes/no answer from the pilot owner before launch.

## Workspace snapshot directories

`C:\Users\Lenovo\Dev\axis-erp\` also contains ~15 snapshot directories from earlier phases (`control-plane-fetch-timeout`, `provisioning-agent-phase2-split`, `erp-execution-service-main-clean`, etc.). These are NOT load-bearing — local working copies preserved during phase transitions. After pilot launch they should be moved to `archive/` or deleted; until then they only cost disk.

## Reproducibility — FitDesk repo (verified)

A clean clone of `FitDesk` at `wip/main-2026-04-25` reproduces the running deployment via:

```bash
git clone <fork-url> FitDesk
cd FitDesk
cp .env.example .env
# edit .env to fill required vars (see ENV_REFERENCE.md)
docker compose up --build -d
curl -s http://localhost:3000/api/health   # expect 200 with structured JSON
```

This is the contract for the FitDesk repo. **Full workspace** reproducibility (all 6 repos pulled cleanly + brought up + a tenant provisioned end-to-end) requires the sibling-repo cleanup above.
