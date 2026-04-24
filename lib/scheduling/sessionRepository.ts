/**
 * Session repository — server-side data access for the new scheduling model.
 *
 * Rules:
 *   - No business logic. Raw CRUD and normalization only.
 *   - All calls go through erpFetch → Control Plane JWT proxy → Frappe REST.
 *   - Normalizers map Frappe snake_case fields → FitDesk domain types.
 *   - Datetimes: Frappe stores/returns UTC as 'YYYY-MM-DD HH:MM:SS'.
 *     We send the same format outbound and append 'Z' on the way in.
 */
import 'server-only'

import { erpFetch } from '@/lib/erpnext/client'
import type { ERPFDSession, ERPFDSessionSeries, ERPListResponse, ERPDocResponse } from '@/lib/erpnext/types'
import type { FDSession, FDSessionSeries, FDSessionStatus, SeriesPattern } from '@/types/scheduling'

// ─── DocType + method name constants ─────────────────────────────────────────

const DOCTYPE_SESSION = 'FD Session'
const DOCTYPE_SERIES  = 'FD Session Series'

const SCHEDULING_METHOD = {
  BULK_CREATE: 'provisioning_api.api.scheduling.bulk_create_sessions',
  CREATE_SERIES: 'provisioning_api.api.scheduling.create_series',
} as const

// ─── Frappe whitelisted-method response envelope ──────────────────────────────
// @frappe.whitelist() wraps return values as { "message": <return value> }.

interface FrappeMethodResponse<T> {
  message: T
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** JS Date → 'YYYY-MM-DD HH:MM:SS' (UTC), the format Frappe expects. */
function toFrappeDatetime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

/** Frappe UTC string → JS Date. Appends 'Z' to produce valid ISO 8601. */
function fromFrappeDatetime(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z')
}

// ─── Field lists ──────────────────────────────────────────────────────────────

function sessionFields(): string {
  return JSON.stringify([
    'name', 'trainer_id', 'client_id', 'client_name', 'series_id',
    'start_at', 'end_at', 'duration_minutes', 'timezone',
    'status', 'occurrence_key', 'occurrence_index', 'is_override',
    'rate', 'session_type', 'invoice_id', 'notes', 'version',
  ])
}

function seriesFields(): string {
  return JSON.stringify([
    'name', 'trainer_id', 'client_id', 'pattern', 'start_date', 'end_date',
    'duration_minutes', 'timezone', 'default_rate', 'status', 'version',
  ])
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeSession(raw: ERPFDSession): FDSession {
  return {
    id:              raw.name,
    tenantId:        '',                       // implicit in ERP site context; callers may enrich
    trainerId:       raw.trainer_id,
    clientId:        raw.client_id,
    clientName:      raw.client_name ?? raw.client_id,
    seriesId:        raw.series_id ?? null,
    startAt:         fromFrappeDatetime(raw.start_at),
    endAt:           fromFrappeDatetime(raw.end_at),
    durationMinutes: raw.duration_minutes,
    timezone:        raw.timezone,
    status:          raw.status as FDSessionStatus,
    occurrenceKey:   raw.occurrence_key  ?? null,
    occurrenceIndex: raw.occurrence_index ?? null,
    isOverride:      raw.is_override === 1,
    rate:            raw.rate,
    sessionType:     raw.session_type ?? null,
    notes:           raw.notes ?? null,
    invoiceId:       raw.invoice_id ?? null,
    version:         raw.version,
  }
}

function normalizeSeries(raw: ERPFDSessionSeries): FDSessionSeries {
  let pattern: SeriesPattern
  try {
    pattern = JSON.parse(raw.pattern) as SeriesPattern
  } catch {
    throw new Error(`FD Session Series ${raw.name}: pattern is not valid JSON`)
  }
  return {
    id:              raw.name,
    tenantId:        '',
    trainerId:       raw.trainer_id,
    clientId:        raw.client_id,
    pattern,
    startDate:       raw.start_date,
    endDate:         raw.end_date ?? null,
    durationMinutes: raw.duration_minutes,
    timezone:        raw.timezone,
    defaultRate:     raw.default_rate,
    status:          raw.status as FDSessionSeries['status'],
    version:         raw.version,
  }
}

// ─── Public repository API ────────────────────────────────────────────────────

/**
 * Fetch all non-cancelled FD Sessions for a trainer whose start_at falls
 * within [startAt, endAt] (both UTC inclusive).
 *
 * Used to build the existing-session window for conflict detection.
 */
export async function findSessionsInRange(
  trainerId: string,
  startAt: Date,
  endAt: Date,
): Promise<FDSession[]> {
  const res = await erpFetch<ERPListResponse<ERPFDSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE_SESSION)}`,
    {
      params: {
        fields:  sessionFields(),
        filters: JSON.stringify([
          ['trainer_id', '=', trainerId],
          ['start_at',   '>=', toFrappeDatetime(startAt)],
          ['start_at',   '<=', toFrappeDatetime(endAt)],
          ['status', 'not in', ['cancelled', 'skipped']],
        ]),
        orderby:           'start_at asc',
        limit_page_length: '500',
      },
    },
  )
  return res.data.map(normalizeSession)
}

/**
 * Fetch a single FD Session by docname.
 * Throws ERPNextError(404) if not found.
 */
export async function findSessionById(id: string): Promise<FDSession> {
  const res = await erpFetch<ERPDocResponse<ERPFDSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE_SESSION)}/${encodeURIComponent(id)}`,
  )
  return normalizeSession(res.data)
}

/**
 * Create multiple FD Sessions in a single Frappe API call.
 *
 * Frappe wraps all inserts in one DB transaction — any validation failure
 * (e.g. duplicate occurrence_key) rolls back the entire batch.
 *
 * @returns Docnames of the created sessions, in input order.
 */
export async function bulkCreateSessions(
  sessions: Array<{
    trainerId:       string
    clientId:        string
    seriesId:        string | null
    startAt:         Date
    endAt:           Date
    durationMinutes: number
    timezone:        string
    occurrenceKey:   string | null
    occurrenceIndex: number | null
    rate:            number
    sessionType?:    string | null
    notes?:          string | null
  }>,
): Promise<string[]> {
  if (sessions.length === 0) return []

  const payload = sessions.map(s => ({
    trainer_id:       s.trainerId,
    client_id:        s.clientId,
    series_id:        s.seriesId        ?? '',
    start_at:         toFrappeDatetime(s.startAt),
    end_at:           toFrappeDatetime(s.endAt),
    duration_minutes: s.durationMinutes,
    timezone:         s.timezone,
    status:           'scheduled',
    occurrence_key:   s.occurrenceKey   ?? '',
    occurrence_index: s.occurrenceIndex ?? 0,
    is_override:      0,
    rate:             s.rate,
    session_type:     s.sessionType     ?? '',
    notes:            s.notes           ?? '',
    version:          1,
  }))

  // Path passes through erpFetch unchanged (no /api/resource/ substring to replace).
  // The CP proxy wildcard route POST /api/erp/method/* forwards to Frappe
  // at /api/method/provisioning_api.api.scheduling.bulk_create_sessions.
  const res = await erpFetch<FrappeMethodResponse<{ created: string[] }>>(
    `/api/erp/method/${SCHEDULING_METHOD.BULK_CREATE}`,
    { method: 'POST', body: { sessions: payload } },
  )
  return res.message.created
}

/**
 * Update an existing FD Session.
 * Only fields present in `patch` are sent to Frappe.
 */
export async function updateSession(
  id: string,
  patch: {
    status?:       FDSessionStatus
    startAt?:      Date
    endAt?:        Date
    rate?:         number
    notes?:        string | null
    sessionType?:  string | null
    invoiceId?:    string | null
    isOverride?:   boolean
    version?:      number
  },
): Promise<FDSession> {
  const body: Record<string, unknown> = {}
  if (patch.status      !== undefined) body.status       = patch.status
  if (patch.startAt     !== undefined) body.start_at     = toFrappeDatetime(patch.startAt)
  if (patch.endAt       !== undefined) body.end_at       = toFrappeDatetime(patch.endAt)
  if (patch.rate        !== undefined) body.rate         = patch.rate
  if (patch.notes       !== undefined) body.notes        = patch.notes       ?? ''
  if (patch.sessionType !== undefined) body.session_type = patch.sessionType ?? ''
  if (patch.invoiceId   !== undefined) body.invoice_id   = patch.invoiceId   ?? ''
  if (patch.isOverride  !== undefined) body.is_override  = patch.isOverride ? 1 : 0
  if (patch.version     !== undefined) body.version      = patch.version

  const res = await erpFetch<ERPDocResponse<ERPFDSession>>(
    `/api/resource/${encodeURIComponent(DOCTYPE_SESSION)}/${encodeURIComponent(id)}`,
    { method: 'PUT', body },
  )
  return normalizeSession(res.data)
}

/**
 * Mark a session as cancelled.
 * Sets status='cancelled'; the row is preserved for audit history.
 */
export async function cancelSession(id: string): Promise<FDSession> {
  return updateSession(id, { status: 'cancelled' })
}

/**
 * Create an FD Session Series via the Frappe scheduling API (one HTTP call).
 * Fetches and returns the fully-normalized series after creation.
 */
export async function createSeries(input: {
  trainerId:       string
  clientId:        string
  pattern:         SeriesPattern
  startDate:       string
  endDate:         string | null
  durationMinutes: number
  timezone:        string
  defaultRate:     number
}): Promise<FDSessionSeries> {
  const payload = {
    trainer_id:       input.trainerId,
    client_id:        input.clientId,
    pattern:          JSON.stringify(input.pattern),
    start_date:       input.startDate,
    end_date:         input.endDate ?? '',
    duration_minutes: input.durationMinutes,
    timezone:         input.timezone,
    default_rate:     input.defaultRate,
    status:           'active',
    version:          1,
  }

  const createRes = await erpFetch<FrappeMethodResponse<{ name: string }>>(
    `/api/erp/method/${SCHEDULING_METHOD.CREATE_SERIES}`,
    { method: 'POST', body: { series: payload } },
  )

  const docRes = await erpFetch<ERPDocResponse<ERPFDSessionSeries>>(
    `/api/resource/${encodeURIComponent(DOCTYPE_SERIES)}/${encodeURIComponent(createRes.message.name)}`,
    { params: { fields: seriesFields() } },
  )
  return normalizeSeries(docRes.data)
}
