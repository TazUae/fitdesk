# Sprint 1 — Per-Story Completion Gate

> Governed by `docs/DOCUMENTATION_AUTHORITY_MAP.md` (tier 4, execution artifact).
> Applies to the four Sprint 1 stories: US-025, US-026, US-030, US-018 ("Trust and
> Visible Financial Clarity", per `FITDESK_SOVEREIGN_PRODUCT_STRATEGY_PRE_PILOT_EXECUTIVE_MANIFEST_V2_2.md`
> §7 Sprint 1 and `FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` §7 Sprint 1).

## What "done" means for a Sprint 1 story

A story may only be marked done, and only committed, once **all** of the following
hold:

1. **Typecheck/build passes** — `node scripts/build-verify.mjs` exits 0.
2. **The real test suite passes** — `npx vitest run` (full suite, not a filtered
   subset) exits 0.
3. **Lint passes** — `npx next lint` exits 0.
4. **Tenant-isolation coverage exists for anything touching queries, mutations, or
   background jobs.** If the story's changes touch a repository (`*repository.ts`),
   a server action, or backfill/reconcile/job code, at least one new or changed test
   in that same change must assert tenant-scoping behavior (same-tenant access works,
   cross-tenant access is denied, missing tenant context fails closed) — following the
   existing pattern in `lib/clients/__tests__/repository.test.ts`.

## How this gate is enforced

`node scripts/story-gate.mjs` runs checks 1–3 automatically and exits nonzero if any
fail, then runs a heuristic check for #4 (looks at changed/new files against tenant-
sensitive path patterns and checks whether an accompanying test file mentions
"tenant"). The heuristic **warns**, it does not hard-block — judgment calls about
whether isolation coverage is genuinely in scope for a given change are recorded in
that story's plan doc (`docs/execution/sprint-1-<story-id>-plan.md`), not decided
by a regex.

Run it from the repo root before every story commit:

```bash
node scripts/story-gate.mjs
```

## Why a script instead of a Claude Code Stop hook

The original ask allowed either "a Stop hook or a /goal per story." A Stop hook was
deliberately **not** installed tonight: a global hook that blocks Claude Code from
ending a turn is harness-wide, persists across all future sessions in this repo (not
just Sprint 1), and a subtly wrong pattern-match in an unattended, un-reviewed
overnight change could leave the next session — on an unrelated task — unable to stop
normally, with no one awake to notice or fix it. That's a materially different risk
profile than a script that a human or agent chooses to run.

`scripts/story-gate.mjs` gives the same practical guarantee (nothing gets marked done
without tests/build/lint passing and an isolation-coverage check) without that blast
radius. If a persistent Stop-hook version of this is still wanted, review
`scripts/story-gate.mjs` first — wiring the same checks into a `Stop` hook in
`.claude/settings.json` is a small follow-up once its heuristics have been observed
against a few real stories.

## Known pre-existing gap surfaced while building this gate

Bare `npx tsc --noEmit` (using this repo's tsconfig, which includes all `.ts`/`.tsx`
files) currently fails with ~15 errors that predate this session and are unrelated to
Sprint 1 — stale test-file type mismatches (e.g. `ProcessEnv` missing `NODE_ENV` in a
couple of `lib/__tests__/pilot.test.ts` cases), one ES2018-only regex flag in a
component test, and a narrowed `AppDb` type in a client-directory test helper.
`next build`'s own type-checker (the thing that actually gates real builds/deploys)
does not surface these and passes cleanly — that's why the gate uses `build:verify`
rather than raw `tsc`. These ~15 errors are flagged in the overnight report as a
separate, small, low-risk cleanup opportunity for a future session; not fixed here to
avoid touching files unrelated to Sprint 1's four stories.
