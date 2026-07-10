---
name: fitdesk-spec
description: Use on demand to locate canonical FitDesk product/spec/acceptance-criteria docs for a feature area or US-ID, without loading the whole docs tree.
---

# FitDesk Spec Router

This skill is a **router**, not a loader. It tells Claude which one or two files
to open for a given question — it does not bulk-read `docs/`.

## Routing order

1. **Always start at [`docs/DOCUMENTATION_AUTHORITY_MAP.md`](../../../docs/DOCUMENTATION_AUTHORITY_MAP.md).**
   It defines the authority hierarchy and how to resolve conflicts between docs.
   `CLAUDE.md` is tier 1 and always wins over anything this skill points to.

2. **For Sprint 1 stories (US-018, US-025, US-026, US-030)**, go to
   [`docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md`](../../../docs/execution/SPRINT_1_STORY_TRACEABILITY_MAP.md).
   It maps each US-ID to existing repo evidence and states whether it is ready
   for `/goal`. It does **not** define acceptance criteria.

3. **For canonical acceptance criteria**, look for `docs/product/US-<id>.md`.
   **These files do not exist yet.** If a question requires acceptance
   criteria that aren't there, **stop and report the gap** — do not fabricate
   acceptance criteria from phase docs, audits, or inference.

4. **Current-phase docs** (`docs/plans/*`, `docs/audits/*`,
   `docs/architecture/*`, `docs/adr/*`, `docs/research/*`, `docs/security/*`,
   `docs/prompts/*`) are **historical/contextual sources only**. Use them to
   understand what was found or decided at the time, never as forward-looking
   acceptance criteria. If a phase doc conflicts with an approved
   `docs/product/*` or `docs/execution/*` doc, stop and ask for architect
   review per the authority map — do not resolve the conflict by guessing
   which is more recent.

## Hard rules

- Do not load the entire `docs/` tree into context by default. Open only the
  file(s) the routing order above points to.
- Do not treat an audit or phase-closeout doc as current product intent.
- Do not write or infer acceptance criteria that don't exist — report the gap
  instead.
- Defer to `CLAUDE.md` and `docs/DOCUMENTATION_AUTHORITY_MAP.md` on any
  conflict.
