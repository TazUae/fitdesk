/**
 * Plain-ESM mirror of lib/env.ts for the standalone runtime.
 *
 * The Docker standalone build does NOT copy lib/ as separate files —
 * the lib/ TS sources are inlined into server.js. The startup script
 * runs BEFORE server.js, so it can't reach lib/env.ts directly.
 *
 * This file is the version that runs at container startup. Keep the
 * spec list in sync with lib/env.ts (small, changes rarely).
 *
 * Tests for the same logic live in lib/env.test.ts against the TS twin.
 */

export const ENV_SPECS = [
  { name: 'BETTER_AUTH_SECRET',     required: true,  minLength: 32 },
  { name: 'DATABASE_URL',           required: true                 },
  { name: 'CONTROL_PLANE_URL',      required: true                 },
  { name: 'CONTROL_PLANE_API_KEY',  required: true,  minLength: 16 },
  { name: 'FITDESK_JWT_SECRET',     required: true,  minLength: 32 },
  { name: 'EVOLUTION_API_URL',      required: false                },
  { name: 'EVOLUTION_API_KEY',      required: false                },
  { name: 'WHISH_API_URL',          required: false                },
  { name: 'WHISH_API_KEY',          required: false                },
  { name: 'WHISH_MERCHANT_ID',      required: false                },
  { name: 'ANTHROPIC_API_KEY',      required: false                },
  { name: 'TRAINER_DEFAULT_TIMEZONE',            required: false   },
  { name: 'PILOT_MODE',                          required: false   },
  { name: 'FITDESK_ALLOWED_TEST_PHONE',          required: false   },
  { name: 'FITDESK_ALLOWED_TEST_PHONE_PREFIXES', required: false   },
  { name: 'PILOT_ALLOW_EXTERNAL_PAYMENTS',       required: false   },
]

const PLACEHOLDER_PATTERNS = [
  /^dev-only-/i,
  /^build-only-placeholder-/i,
  /^REPLACE-?ME/i,
  /^changeme/i,
  /^your-/i,
]

export function isPlaceholderValue(value) {
  return PLACEHOLDER_PATTERNS.some(p => p.test(value))
}

export function inspectEnv(env = process.env) {
  const issues = []
  for (const spec of ENV_SPECS) {
    const value = env[spec.name]
    if (!value || value.trim() === '') {
      if (spec.required) {
        issues.push({ name: spec.name, level: 'error', reason: 'required env var is missing' })
      } else {
        issues.push({ name: spec.name, level: 'warn', reason: 'optional env var not set — feature disabled' })
      }
      continue
    }
    if (spec.required && spec.minLength && value.length < spec.minLength) {
      issues.push({
        name: spec.name,
        level: 'error',
        reason: `value is shorter than required minimum (${value.length} < ${spec.minLength})`,
      })
    }
    if (spec.required && isPlaceholderValue(value)) {
      issues.push({
        name: spec.name,
        level: 'error',
        reason: 'value matches a known dev-only / placeholder pattern',
      })
    }
  }
  return issues
}

export function validateEnvAtStartup({ strict, env, log }) {
  const issues = inspectEnv(env)
  const errors = issues.filter(i => i.level === 'error')
  const warns  = issues.filter(i => i.level === 'warn')
  const out = log ?? (s => console.warn(s))

  for (const w of warns)  out(`[env] WARN  ${w.name}: ${w.reason}`)
  for (const e of errors) out(`[env] ERROR ${e.name}: ${e.reason}`)

  if (strict && errors.length > 0) {
    throw new Error(
      `Environment validation failed in strict mode (${errors.length} error${errors.length === 1 ? '' : 's'}). ` +
      `See docs/ENV_REFERENCE.md for required variables.`,
    )
  }
}
