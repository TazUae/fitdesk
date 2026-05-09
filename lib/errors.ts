/**
 * User-safe error mapping. Server-only.
 *
 * Every server action should return user-facing errors via toUserError.
 * Raw ERP / DB / network internals must never reach the UI.
 *
 * Phase 5.0.3a: helper exists. Phase 5.0.3b: actions migrate to use it.
 */

import 'server-only'
import { scrubSensitive } from './scrub'
import { ERPNextError } from './erpnext/client'

export type UserErrorCode =
  | 'AUTH'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'UPSTREAM'
  | 'INTERNAL'

export interface UserError {
  code: UserErrorCode
  message: string
}

/**
 * Map any thrown value to a user-safe { code, message }.
 *
 * - ERPNextError 4xx → CONFLICT or VALIDATION or NOT_FOUND or AUTH
 * - ERPNextError 5xx → UPSTREAM
 * - Plain Error      → INTERNAL with scrubbed message
 * - Unknown          → INTERNAL with generic message
 *
 * Always passes the message through scrubSensitive.
 */
export function toUserError(err: unknown): UserError {
  if (err instanceof ERPNextError) {
    const code: UserErrorCode =
      err.status === 401 || err.status === 403 ? 'AUTH'
      : err.status === 404                     ? 'NOT_FOUND'
      : err.status === 409                     ? 'CONFLICT'
      : err.status >= 400 && err.status < 500  ? 'VALIDATION'
      : 'UPSTREAM'
    // Use the statusText (short) — never the raw detail body
    return { code, message: scrubSensitive(`${err.statusText || 'Request failed'}`) }
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL', message: scrubSensitive(err.message || 'Unexpected error') }
  }
  return { code: 'INTERNAL', message: 'Unexpected error' }
}
