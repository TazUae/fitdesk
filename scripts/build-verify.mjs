/**
 * Local pre-commit verification build.
 *
 * Outputs to .next-verify instead of .next so the active `next dev` server's
 * compiled assets are never overwritten. Safe to run while `npm run dev` is
 * active in the same checkout.
 *
 * Usage: npm run build:verify
 */
import { spawnSync } from 'child_process'
import { randomBytes } from 'node:crypto'

// Build-only random value exists solely in the child process environment.
// It is not a deploy/runtime credential and must never be written to disk.
const buildEnv = {
  ...process.env,
  FITDESK_VERIFY_BUILD: '1',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || randomBytes(32).toString('hex'),
}

const result = spawnSync(
  'npx',
  ['next', 'build'],
  { stdio: 'inherit', env: buildEnv, shell: true },
)

process.exit(result.status ?? 1)
