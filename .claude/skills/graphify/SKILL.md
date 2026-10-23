---
name: graphify
description: Use local Graphify knowledge graph to map FitDesk/Forge call paths and change impact before code edits, especially invoice, ERP, tenant and scheduling work. No cloud indexing.
---
# Graphify — Zaidan Code Graph Navigation

## When to invoke
Use when asked `/graphify`, when investigating cross-file dependencies, or before modifying PPS invoicing, auth/tenant scoping, ERP boundary, worker/controller or shared integration code.

## Read-only preflight
- Confirm `git status --porcelain` and `git rev-parse HEAD`; identify **this** repository, not another tenant/project.
- Execute `graphify --version`. On Windows, Graphify 0.9.90 was **INSPECTED** on 2026-10-23; runner/WSL availability is **NOT_VERIFIED**, so recheck locally.
- Confirm `graphify-out/` is ignored. Inspect Graphify scope and exclude environment/secrets, patient/customer/financial exports and other repositories.
- Before a first build, review config. For the existing local code-only workflow, run `graphify update .`; **do not** invoke hosted services or semantic-doc/model extraction. If unsupported or it requests keys/network, stop and report.

## Investigate
1. `graphify query "who creates Sales Invoice after PPS session completion?"`
2. `graphify path "actions/schedulingActions.ts" "lib/erpnext/client.ts"`, adapting node labels to the indexed graph.
3. `graphify explain "lib/erpnext/client.ts"` (or the actual symbol returned by query).
4. Capture exact `file:line` paths and provenance confidence; direct-read the touched source/authorization checks and tests before design.
5. After authorized changes: `graphify update .`; inspect changed impact and verify against tests.

If Graphify lacks a graph, executable, or usable query result, mark `GRAPHIFY=NOT_RUN` or `BLOCKED`. Direct grep can assist investigation but cannot be misreported as a successful Graphify check. No API keys or graph uploads.

## Integration boundaries
The existing FitDesk `.claude/settings.json` contains safety hooks. Do not run `graphify install --project` or `graphify hook install` in this repo until their proposed changes are reviewed and shown not to replace/disable those hooks. Repo-local skill is present as an **instruction integration**, not an independently tested permission hook. Optional MCP is not configured. Generated `graphify-out/` is ignored and must remain uncommitted.
