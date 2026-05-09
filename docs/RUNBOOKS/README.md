# FitDesk Runbooks

Operational procedures for running and recovering FitDesk in production. **Treat every destructive action as approval-gated.** No runbook here invokes destructive operations automatically — they document *what to do* and *when to ask*.

| Doc | When to read |
|---|---|
| [BACKUPS.md](./BACKUPS.md) | Setting up or verifying scheduled backups; before any planned upgrade or risky change |
| [RESTORE.md](./RESTORE.md) | After data loss; recovering a tenant from snapshot |
| [CLEANUP_FAILED_TENANTS.md](./CLEANUP_FAILED_TENANTS.md) | Periodic operator hygiene; freeing storage from failed provisioning runs |
| [SUPPORT.md](./SUPPORT.md) | Day-to-day trainer support tickets — "I can't sign in", "my WhatsApp QR won't work" |
| [INCIDENTS.md](./INCIDENTS.md) | Stack-level outages — ERP down, CP down, Evolution down, container OOM, log flood |

## Conventions

- Every runbook starts with **Pre-conditions** and **Risk level**.
- Every destructive step has an **Approval gate** — name the human who must say yes.
- Every step that touches a sibling repo (`provisioning_api`, `bench-agent`, `provisioning-agent`, `control-plane`) names the repo and the file/method touched.
- All commands are copy-pasteable. No "you know what to do here".
