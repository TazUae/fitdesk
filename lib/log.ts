/**
 * Structured logger — server-only.
 *
 * One JSON line per call. All string values pass through scrubSensitive
 * before serialization to prevent leaking secrets via logs. Optional
 * correlationId field lets a chain of operations be grouped.
 */

import 'server-only'
import { scrubSensitive } from './scrub'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogContext {
  correlationId?: string
  [key: string]: unknown
}

function scrubValue(v: unknown): unknown {
  if (typeof v === 'string') return scrubSensitive(v)
  if (v instanceof Error)    return scrubSensitive(v.message)
  if (Array.isArray(v))      return v.map(scrubValue)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = scrubValue(val)
    return out
  }
  return v
}

function emit(level: LogLevel, event: string, ctx: LogContext = {}): void {
  const line = {
    level,
    ts: new Date().toISOString(),
    event,
    ...(ctx as Record<string, unknown>),
  }
  // Re-walk to scrub strings inside ctx
  for (const [k, v] of Object.entries(line)) {
    if (k === 'level' || k === 'ts') continue
    ;(line as Record<string, unknown>)[k] = scrubValue(v)
  }
  const json = JSON.stringify(line)
  // stderr for warn/error, stdout for info — matches container log conventions
  if (level === 'info') process.stdout.write(json + '\n')
  else                  process.stderr.write(json + '\n')
}

export const log = {
  info:  (event: string, ctx?: LogContext) => emit('info',  event, ctx),
  warn:  (event: string, ctx?: LogContext) => emit('warn',  event, ctx),
  error: (event: string, ctx?: LogContext) => emit('error', event, ctx),
}
