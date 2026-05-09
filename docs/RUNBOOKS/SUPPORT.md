# Trainer Support Runbook

Day-to-day operator playbook for trainer-facing issues. Each scenario lists symptom → diagnosis → fix.

## "I can't sign in"

**Symptom:** trainer hits `/auth/login`, submits credentials, lands back on login.

**Diagnose:**
```bash
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute(\"SELECT id, email FROM user WHERE email = '<their-email>'\").then(r => console.log(r.rows))"
```

- 0 rows → user record doesn't exist → ask them to register
- 1 row but login fails → check `account` table for matching providerId="credential" + verify password reset path

**Fix (password reset for forgotten credential):** as of writing, FitDesk doesn't expose a reset-password UI. Manual workaround:
```bash
# Better Auth stores the password as a hashed credential row in `account`.
# Forgotten passwords require deleting the row and asking the user to re-register
# (Better Auth will recreate the account on next sign-up with the same email).
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute(\"DELETE FROM account WHERE userId = '<their-userId>' AND providerId = 'credential'\").then(r => console.log('deleted', r.rowsAffected))"
```

This is destructive — confirm the userId before running. **Approval gate:** the trainer's written request.

## "My WhatsApp QR / pairing code says 'incorrect code'"

**Likely causes (in order):**

1. **Phone format wrong.** Phase 5 hotfix dropped the LB-hardcoded normalizer; trainer must enter full international format **without leading 0**. Tell them: "Type your number including country code, no plus, no spaces. UAE example: `971501234567`."

2. **Evolution upstream pairing-code bug.** Multiple GitHub issues confirm Baileys integration occasionally rejects valid pairing codes. **Workaround:** use the QR scan path instead (refresh `/dashboard/whatsapp` to get the QR; scan from WhatsApp → Linked Devices → Link a Device).

3. **Evolution instance went stale.** Reset the trainer's instance:
```bash
# Look up the trainer's instance name from FitDesk
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute(\"SELECT trainerId, instanceName, status FROM trainer_whatsapp_connection WHERE trainerId = '<id>'\").then(r => console.log(r.rows))"

# In FitDesk UI: /dashboard/whatsapp → Disconnect → Connect (creates fresh instance)
```

## "I get 'Pilot mode: target phone is not on the test allowlist'"

**Expected behavior** when `PILOT_MODE=true`. The trainer is trying to message a number that's not on the allowlist.

- For pilot, only the operator's own test number(s) should be in `FITDESK_ALLOWED_TEST_PHONE` / `FITDESK_ALLOWED_TEST_PHONE_PREFIXES`
- If a real client number needs to be temporarily allowed, add their E.164 digits to the env and recreate the fitdesk container (see ROTATING SECRETS below)
- **DO NOT** disable PILOT_MODE during pilot — that defeats the safety net

## "I see 'Control Plane request failed (403): Invalid API key'"

The cross-container key mismatch problem (we hit this 2026-05-09).

```bash
# Verify keys match across containers (no values printed)
docker exec axis-local-fitdesk-1 sh -c \
  'val=$CONTROL_PLANE_API_KEY; printf "fitdesk %s\n" "$(printf %s "$val" | sha256sum | cut -c1-12)"'
docker exec axis-local-cp-api-1 sh -c \
  'val=$CONTROL_PLANE_API_KEY; printf "cp-api  %s\n" "$(printf %s "$val" | sha256sum | cut -c1-12)"'
```

Different fingerprints → ROTATING SECRETS below.

## ROTATING LOCAL-STACK SECRETS

When `.env` changes, **all** containers that interpolate the changed value must be recreated together. Container env is fixed at create time, not restart time.

### CONTROL_PLANE_API_KEY or FITDESK_JWT_SECRET rotation

```bash
# Both containers MUST recreate together
docker compose -f docker-compose.local.yml up -d --force-recreate --no-deps fitdesk cp-api cp-worker
```

### Postgres password rotation (HIGH RISK)

The postgres data volume holds the OLD password as a hash. Recreating the container won't update the hash. Use ALTER USER while postgres is still running with the OLD password:

```bash
# 1. Authenticate with OLD password (still in container env), set NEW password
docker exec axis-local-cp-postgres-1 sh -c \
  "PGPASSWORD=\$POSTGRES_PASSWORD psql -U cp_user -d controlplane -c \"ALTER USER cp_user PASSWORD '<new-password>';\""

# 2. Now recreate the consumers (cp-api, cp-worker) so they use NEW password from env
docker compose -f docker-compose.local.yml up -d --force-recreate --no-deps cp-api cp-worker
```

If you skip step 1, cp-api will crash-loop because the env password and stored hash diverge.

### Adding a new env var (new feature)

```bash
# Edit .env, add the var, then recreate the consuming container
docker compose -f docker-compose.local.yml up -d --force-recreate --no-deps <service>
```

Common: `FITDESK_ALLOWED_TEST_PHONE` (only fitdesk consumes), Whish creds (only fitdesk).

## "Provisioning is stuck on a step"

Used by trainers during initial workspace setup.

```bash
# Find their job
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U cp_user -d controlplane -At -c \
   "SELECT id, \"tenantId\", status, \"failureReason\" FROM \"ProvisioningJob\" WHERE \"createdAt\" > NOW() - INTERVAL '\''1 hour'\'' ORDER BY \"createdAt\" DESC LIMIT 5"'

# See what step
docker exec axis-local-cp-postgres-1 sh -c \
  'PGPASSWORD=$POSTGRES_PASSWORD psql -U cp_user -d controlplane -At -c \
   "SELECT step, status, error FROM \"ProvisioningStepRun\" WHERE \"jobId\" = '\''<job-id>'\'' ORDER BY \"startedAt\" DESC"'
```

Retry path: the trainer can hit `/onboarding` retry button OR you trigger via:
```bash
curl -X POST -H "Cookie: <their-session-cookie>" http://localhost:3000/api/workspace/retry
```

## Manually link an existing tenant to a trainer

Useful when a trainer's `WorkspaceProvisioning` row was lost (volume reset) but their ERP tenant is intact.

```bash
docker exec axis-local-fitdesk-1 node -e "
const c = require('@libsql/client').createClient({url:'file:/app/data/auth.db'});
c.execute({
  sql: 'INSERT INTO WorkspaceProvisioning (id, userId, slug, tenantId, jobId, status, createdAt, updatedAt, lastSyncedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  args: [
    require('crypto').randomUUID(),
    '<userId>',
    '<existing-slug>',
    '<existing-tenantId>',
    'manual-relink',
    'completed',
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
  ],
}).then(r => console.log('inserted', r.rowsAffected))
"
```

**Approval gate:** confirm the userId, slug, tenantId in writing before running. A bad insert would map a trainer to the wrong tenant's data.

## Log access

```bash
# FitDesk app logs (structured JSON since 5.0.3a)
docker logs --tail 200 -f axis-local-fitdesk-1

# Control Plane logs
docker logs --tail 200 -f axis-local-cp-api-1

# Tail multiple at once
docker logs --tail 50 -f axis-local-fitdesk-1 &
docker logs --tail 50 -f axis-local-cp-api-1 &
wait
```

Logs rotate per the `json-file` driver config in `docker-compose.yml` — max-size 10m, max-file 3.
