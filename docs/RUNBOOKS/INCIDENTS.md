# Incident Runbook

Stack-level outage scenarios. Each scenario lists symptom → triage → recovery.

## ERP unreachable from FitDesk (Customer/Invoice/Session lists fail)

**Symptom:** Dashboard shows "Could not load …" cards everywhere; logs show ERPNextError 502/timeout.

**Triage:**
```bash
# 1. Is ERP backend up?
docker ps --filter "name=axis-local-erp-backend" --format "{{.Status}}"

# 2. Is CP reachable from FitDesk?
docker exec axis-local-fitdesk-1 node -e \
  "require('http').get('http://cp-api:4000/health', r => console.log(r.statusCode)).on('error', e => console.log('ERR', e.code))"

# 3. Run the ERP roundtrip smoke
docker cp scripts/smoke/erp-roundtrip.mjs axis-local-fitdesk-1:/tmp/
docker exec axis-local-fitdesk-1 node /tmp/erp-roundtrip.mjs
```

**Recovery:**
- ERP backend down → `docker compose -f docker-compose.local.yml restart erp-backend erp-queue-short erp-queue-long`
- CP unreachable → see "Control Plane down" below
- All 5 ERP calls fail with 401/403 → JWT secret mismatch, see SUPPORT.md "ROTATING SECRETS"
- Specific call fails (e.g. only Customer) → ERP DocType permissions or the field-list 417 issue from Phase 3.0.4

## Control Plane down

**Symptom:** `/api/health?deep=1` shows `controlPlane.reachable: false`; provisioning UI broken; ERP proxy calls all fail.

**Triage:**
```bash
docker ps --filter "name=axis-local-cp-api" --format "{{.Status}}"
docker logs --tail 50 axis-local-cp-api-1
```

Most common causes (per our 2026-05-09 outage):
- Postgres password mismatch → cp-api crash-loops with "Authentication failed against database server" → see SUPPORT.md "Postgres password rotation"
- Redis unreachable → check `axis-local-cp-redis-1` health
- Port conflict on host (4000) → restart docker daemon

**Recovery:**
```bash
docker compose -f docker-compose.local.yml restart cp-api cp-worker
# Wait for healthy
sleep 10
docker ps --filter "name=axis-local-cp" --format "{{.Names}} {{.Status}}"
```

## Evolution / WhatsApp down

**Symptom:** sends fail with "WhatsApp send failed: 5xx" or connection page can't reach Evolution.

**Triage:**
- Is Evolution running on the VPS? `curl https://wa.zaidan-group.com/manager/findInstances` (mask result)
- Is the FitDesk container's `EVOLUTION_API_URL` correct?
```bash
docker exec axis-local-fitdesk-1 sh -c \
  'val=$EVOLUTION_API_URL; printf "len=%s sha=%s\n" "${#val}" "$(printf %s "$val" | sha256sum | cut -c1-12)"'
```

**Recovery:**
- Evolution VPS issue → out of FitDesk scope; coordinate with the VPS operator
- Stale instance for one trainer → see SUPPORT.md "My WhatsApp QR..."
- Pilot mode is blocking sends → expected behavior (`PILOT_MODE=true` requires allowlist match)

## Container OOM

**Symptom:** container restarts repeatedly; `docker logs` shows process killed; host `dmesg` shows OOM.

**Triage:**
```bash
docker stats --no-stream
docker inspect <container-name> --format '{{.State.OOMKilled}}'
```

**Recovery:**
- One container OOM-killed → `docker compose restart <service>`; investigate via memory profile
- Host OOM (multiple containers affected) → free disk first (next section), then restart full stack

## Disk full

**Symptom:** any container fails to start; logs cite "No space left on device"; postgres / mariadb refuse writes.

**Triage:**
```bash
df -h /
docker system df
du -sh /var/lib/docker/volumes/* | sort -hr | head -10
```

**Recovery — order (least to most destructive):**

1. Truncate journal logs:
```bash
sudo journalctl --vacuum-size=200M
```

2. Prune docker dangling images:
```bash
docker image prune -f
```

3. Prune unused build cache:
```bash
docker builder prune -af   # aggressive, no recovery
```

4. Truncate per-container logs (preserves running container):
```bash
sudo truncate -s 0 $(docker inspect --format='{{.LogPath}}' axis-local-fitdesk-1)
```

5. **Approval-gated:** prune unused volumes (DESTRUCTIVE — kills any non-running data):
```bash
docker volume ls --filter dangling=true
# Confirm the list is purely junk before:
docker volume prune -f
```

## Log flood (logs growing fast → disk pressure)

**Symptom:** `docker logs` for one container shows MB/min growth.

**Triage:** identify the chatty source:
```bash
for c in $(docker ps --format "{{.Names}}"); do
  size=$(du -sh "$(docker inspect --format='{{.LogPath}}' $c 2>/dev/null)" 2>/dev/null | cut -f1)
  echo "$size  $c"
done | sort -hr
```

**Recovery:**
- Truncate the offender's log file (see Disk Full step 4)
- Identify the cause — usually a tight error loop. Check the offender's logs FIRST, then `docker compose restart` to clear the loop
- Phase 5.0.3a structured logger writes one line per event; a flood means the calling code has a bug → file an issue

## Auth / session storm

**Symptom:** every dashboard page hits 401 even for known-good sessions.

**Triage:**
```bash
# Verify auth.db user table is intact
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute('SELECT COUNT(*) AS n FROM user').then(r => console.log(r.rows[0].n))"

# Check session table size
docker exec axis-local-fitdesk-1 node -e \
  "require('@libsql/client').createClient({url:'file:/app/data/auth.db'}).execute('SELECT COUNT(*) AS n, MAX(expiresAt) AS latest FROM session').then(r => console.log(r.rows[0]))"
```

**Recovery:**
- BETTER_AUTH_SECRET rotated → all sessions invalidated; trainers must re-login. Avoid rotating during pilot hours
- Clock skew between containers → check `date` inside each container; correct via host NTP
- DB corruption → restore from backup (RUNBOOKS/RESTORE.md)

## Pre-pilot checklist (every morning during pilot)

```bash
# 1. All containers up
docker ps --format "{{.Names}} {{.Status}}" | grep -v healthy | grep -v "Up "

# 2. FitDesk health
curl -sf http://localhost:3000/api/health > /dev/null && echo "fitdesk OK" || echo "fitdesk FAIL"

# 3. ERP roundtrip smoke
docker exec axis-local-fitdesk-1 node /tmp/erp-roundtrip.mjs 2>&1 | tail -5

# 4. Disk
df -h / | tail -1

# 5. No crash-loops in last hour
for c in $(docker ps -a --format "{{.Names}}" | grep axis-local); do
  restarts=$(docker inspect --format='{{.RestartCount}}' $c)
  [ "$restarts" -gt 5 ] && echo "WARN: $c has $restarts restarts"
done
```

If any check fails, pause pilot until resolved.

## Escalation

- **You cannot fix it in 30 minutes** → page the named on-call (Slack DM or phone)
- **Data integrity is suspected** → STOP all writes, snapshot current volumes BEFORE attempting recovery (RUNBOOKS/BACKUPS.md)
- **External service blame (Evolution / Whish / Anthropic)** → file the issue with that provider; document our side as healthy in the incident timeline
