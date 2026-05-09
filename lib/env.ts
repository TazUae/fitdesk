/**
 * Centralized env / secrets validation.
 *
 * Phase 5.0.2 contract:
 *   - This is the SINGLE SOURCE OF TRUTH for env validation.
 *   - No other module performs string-equality on secret values.
 *   - Called from scripts/start-with-migrations.mjs at startup.
 *   - Strict mode (production): missing required → throw; placeholder
 *     or dev-only-* in required → throw.
 *   - Non-strict (dev): same checks but warn instead of throw, so a
 *     contributor's incomplete .env doesn't block local dev.
 *
 * No 'server-only' import — this file is read at startup before the
 * RSC boundary exists. It must NOT import any module that depends on
 * runtime config or React.
 */

export interface EnvVarSpec {
  name: string
  required: boolean
  /** Minimum string length; 0 = no min check. */
  minLength?: number
  /** Description used in ENV_REFERENCE.md and error messages. */
  description: string
}

export const ENV_SPECS: ReadonlyArray<EnvVarSpec> = [
  // ─── Required ─────────────────────────────────────────────────────
  { name: 'BETTER_AUTH_SECRET',     required: true, minLength: 32, description: 'Better Auth signing secret. openssl rand -base64 32.' },
  { name: 'DATABASE_URL',           required: true,                description: 'libsql / SQLite URL for the auth + app DB.' },
  { name: 'CONTROL_PLANE_URL',      required: true,                description: 'Internal URL of the Control Plane API.' },
  { name: 'CONTROL_PLANE_API_KEY',  required: true, minLength: 16, description: 'API key for CP management endpoints (must match CP).' },
  { name: 'FITDESK_JWT_SECRET',     required: true, minLength: 32, description: 'HMAC-HS256 secret for tenant JWTs (must match CP).' },

  // ─── Optional (warn if missing in strict mode) ───────────────────
  { name: 'EVOLUTION_API_URL',      required: false, description: 'Evolution API base URL (WhatsApp). Without this, WhatsApp send is disabled.' },
  { name: 'EVOLUTION_API_KEY',      required: false, description: 'Evolution API key.' },
  { name: 'WHISH_API_URL',          required: false, description: 'Whish payments base URL. Without this, Whish links are disabled (cash/bank still work).' },
  { name: 'WHISH_API_KEY',          required: false, description: 'Whish API key.' },
  { name: 'WHISH_MERCHANT_ID',      required: false, description: 'Whish merchant identifier.' },
  { name: 'ANTHROPIC_API_KEY',      required: false, description: 'Claude API key for AI message drafts. Without this, templates are used.' },
  { name: 'TRAINER_DEFAULT_TIMEZONE', required: false, description: 'IANA timezone fallback when Trainer Settings has none.' },

  // ─── Pilot mode (5.0.6) ───────────────────────────────────────────
  { name: 'PILOT_MODE',                          required: false, description: 'Boolean. When "true": dashboard banner, all-WhatsApp confirm, allowlist enforcement.' },
  { name: 'FITDESK_ALLOWED_TEST_PHONE',          required: false, description: 'Pilot mode: exact-match allowlisted destination (E.164 digits, no +).' },
  { name: 'FITDESK_ALLOWED_TEST_PHONE_PREFIXES', required: false, description: 'Pilot mode: comma-separated prefix allowlist (E.164 digits, no +).' },
  { name: 'PILOT_ALLOW_EXTERNAL_PAYMENTS',       required: false, description: 'Pilot mode safety flag for future external payment writes. Default false.' },
] as const

/**
 * Detect dev-only / placeholder values that must NEVER reach production.
 */
const PLACEHOLDER_PATTERNS: ReadonlyArray<RegExp> = [
  /^dev-only-/i,
  /^build-only-placeholder-/i,
  /^REPLACE-?ME/i,
  /^changeme/i,
  /^your-/i,
]

export function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some(p => p.test(value))
}

export interface EnvValidationIssue {
  name: string
  level: 'error' | 'warn'
  reason: string
}

/**
 * Inspect process.env (or a substituted bag) against ENV_SPECS.
 *
 * Returns a list of issues. In strict mode, "error" issues are
 * blocking. In non-strict mode, all issues are reported as warnings.
 */
export function inspectEnv(
  env: Record<string, string | undefined> = process.env,
): EnvValidationIssue[] {
  const issues: EnvValidationIssue[] = []
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

export interface ValidateOptions {
  strict: boolean
  env?: Record<string, string | undefined>
  /** Defaults to console; tests can substitute. */
  log?: (line: string) => void
}

/**
 * Run validation. Throws if strict and there are error-level issues.
 * Warns otherwise. Safe to call before the app starts.
 */
export function validateEnvAtStartup(opts: ValidateOptions): void {
  const env = opts.env ?? process.env
  const log = opts.log ?? ((s: string) => console.warn(s))
  const issues = inspectEnv(env)

  const errors = issues.filter(i => i.level === 'error')
  const warns  = issues.filter(i => i.level === 'warn')

  for (const w of warns)  log(`[env] WARN  ${w.name}: ${w.reason}`)
  for (const e of errors) log(`[env] ERROR ${e.name}: ${e.reason}`)

  if (opts.strict && errors.length > 0) {
    throw new Error(
      `Environment validation failed in strict mode (${errors.length} error${errors.length === 1 ? '' : 's'}). ` +
      `See docs/ENV_REFERENCE.md for required variables.`,
    )
  }
}
