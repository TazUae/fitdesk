/**
 * Sprint 1 per-story completion gate.
 *
 * Blocks a story from being considered "done" until:
 *   1. Typecheck/build passes (`next build` via `build:verify`).
 *      NOTE: bare `npx tsc --noEmit` against this repo's tsconfig (which
 *      includes all .ts / .tsx files, i.e. test files too) currently fails with
 *      ~15 pre-existing errors unrelated to Sprint 1 (stale test-file type
 *      mismatches, an ES2018 regex flag, a narrowed AppDb test-helper type).
 *      These predate this session and are out of scope to fix here — fixing
 *      them would touch many unrelated files. `next build`'s own type-checker
 *      (what actually gates real builds/deploys) does not surface them and
 *      passes cleanly, so that is the authoritative typecheck signal this
 *      gate uses. Flagged for the morning report, not fixed.
 *   2. The real test suite passes (`vitest run`, not a filtered subset).
 *   3. Lint passes (`next lint`).
 *   4. If this run touched any query/mutation/background-job file (repository,
 *      actions, jobs/backfill/reconcile code) and no *test* file changed
 *      alongside it, or none of the changed/added test files mention
 *      "tenant" anywhere, the gate WARNS (does not hard-block, since not
 *      every change needs new tenant-isolation coverage — e.g. a pure
 *      formatting change to an existing tenant-scoped repo method). Treat
 *      the warning as something a human/story-plan must explicitly justify,
 *      not silently ignore.
 *
 * Does not touch package.json — invoked directly via `node scripts/story-gate.mjs`
 * (or `npx tsc` under the hood), not through an npm script alias.
 *
 * Usage: node scripts/story-gate.mjs
 * Exit code: 0 = gate passed (tests/typecheck/lint all green); 1 = gate failed.
 */
import { spawnSync, execSync } from 'child_process'

function run(label, cmd, args) {
  console.log(`\n─── ${label} ───────────────────────────────────────────`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  const ok = (result.status ?? 1) === 0
  console.log(ok ? `✓ ${label} passed` : `✗ ${label} FAILED (exit ${result.status})`)
  return ok
}

const TENANT_SENSITIVE_PATTERNS = [
  /\/repository\.ts$/,
  // Matches actions/foo.ts (top-level, the common case in this repo — every
  // server action lives directly under actions/) AND nested foo/actions/bar.ts.
  // The original /\/actions\/.*\.ts$/ required a leading "/" before "actions"
  // and so never matched a top-level actions/*.ts path — found while running
  // this gate for real during Sprint 2 US-057, when it silently skipped
  // actions/schedulingActions.ts changes touching tenant-scoped queries.
  /^actions\/.*\.ts$|\/actions\/.*\.ts$/,
  /backfill/i,
  /reconcile/i,
  /Repository\.ts$/,
]

function checkTenantIsolationCoverage() {
  console.log('\n─── Tenant-isolation coverage heuristic ───────────────────────')
  // Bug found during Sprint 2 (US-057): this originally checked only staged
  // changes + untracked files, which silently misses the normal workflow of
  // "modify tracked files, run the gate, stage+commit afterward" — i.e. every
  // story tonight up to this point ran with this heuristic effectively blind.
  // Now also includes plain unstaged modifications to already-tracked files.
  const staged = (spawnSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).stdout || '')
    .split('\n').filter(Boolean)
  const unstaged = (spawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).stdout || '')
    .split('\n').filter(Boolean)
  const untrackedFiles = (spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout || '')
    .split('\n').filter(Boolean)
  const changed = [...new Set([...staged, ...unstaged, ...untrackedFiles])]

  const sensitiveChanged = changed.filter(
    f => !f.includes('.test.') && TENANT_SENSITIVE_PATTERNS.some(p => p.test(f)),
  )
  const testFilesChanged = changed.filter(f => f.includes('.test.'))

  if (sensitiveChanged.length === 0) {
    console.log('No query/mutation/background-job file changed in this story — skipping.')
    return true
  }

  console.log('Tenant-sensitive files changed:', sensitiveChanged)
  if (testFilesChanged.length === 0) {
    console.log('⚠ WARNING: no test file changed alongside these files. Confirm this is justified in the story plan.')
    return true // warn, do not hard-block — see file header
  }

  let anyMentionsTenant = false
  for (const f of testFilesChanged) {
    try {
      const content = execSync(`cat "${f}"`, { encoding: 'utf8' })
      if (/tenant/i.test(content)) { anyMentionsTenant = true; break }
    } catch { /* best-effort check only — a read failure here does not fail the gate */ }
  }

  if (!anyMentionsTenant) {
    console.log('⚠ WARNING: changed test files do not mention "tenant" — confirm isolation coverage is genuinely out of scope for this story.')
  } else {
    console.log('✓ At least one changed test file references tenant isolation.')
  }
  return true
}

const results = []
results.push(run('Typecheck/build (build:verify)', 'node', ['scripts/build-verify.mjs']))
results.push(run('Test suite', 'npx', ['vitest', 'run']))
results.push(run('Lint', 'npx', ['next', 'lint']))
checkTenantIsolationCoverage()

const allPassed = results.every(Boolean)
console.log(`\n${'═'.repeat(60)}`)
console.log(allPassed ? 'GATE PASSED — story may be marked done.' : 'GATE FAILED — do not mark this story done.')
console.log('═'.repeat(60))
process.exit(allPassed ? 0 : 1)
