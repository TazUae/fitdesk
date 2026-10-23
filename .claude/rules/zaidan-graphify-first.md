# Graphify-first Code Investigation

For factory work involving source relationships, changes to auth/tenant boundaries, scheduling, ERP, invoices, Docker execution or Forge integration:

1. Identify the repository and confirm clean base/commit. Run `graphify --version` and check for ignored `graphify-out/graph.json`.
2. Use the *local, code-only* Graphify CLI (`graphify update .` when building/updating a graph) and then `graphify query "..."`, `graphify path "A" "B"` or `graphify explain "..."` before wide source searches. If the query is simply an exact literal, direct grep is fine.
3. Note graph version, repository commit, query, nodes/edges and file:line references. Distinguish EXTRACTED, INFERRED and AMBIGUOUS. Never treat an inferred edge as verified ownership or financial authority.
4. Open the exact referenced source and tests. Rebuild/update graph after changes, compare blast radius, and rerun deterministic checks.
5. If Graphify CLI is missing, graph generation fails, or its output is stale: mark `GRAPHIFY=BLOCKED/NOT_RUN`, continue only safe documentation/research, and request a **reviewed** environment setup. Do not silently claim use.
6. Keep output local and ignored; do not index credentials, `.env`, private customer data, audit logs or real tenant ERP dumps. No Graphify Cloud/MCP upload, doc semantic extraction, new API model key, or installer-generated hook/`.claude/settings.json` rewrite without review.
7. Existing `.claude/hooks/guard-bash.mjs` and `guard-writes.mjs` must remain operative. Graphify is **navigation**, never authorization, acceptance evidence, or a substitute for security testing.

See `.claude/skills/graphify/SKILL.md` for the Claude-triggered action, `docs/factory/GRAPHIFY_RUNBOOK.md` for setup.
