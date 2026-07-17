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

process.env.FITDESK_VERIFY_BUILD = '1'

const result = spawnSync(
  'npx',
  ['next', 'build'],
  { stdio: 'inherit', env: process.env, shell: true },
)

process.exit(result.status ?? 1)
