import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Module mocks (auto-hoisted by Vitest) ────────────────────────────────────

vi.mock('next/headers', () => ({
  headers: () => new Headers(),
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock('@/lib/trainer', () => ({
  ensureTrainerIdForUser: vi.fn(),
}))

vi.mock('@/lib/business-data/erp-adapter', () => ({
  getClientById: vi.fn(),
  getInvoiceByIdForTrainer: vi.fn(),
}))

vi.mock('@/lib/claude', () => ({
  generateMessage: vi.fn(),
}))

// DB mock — getMessages degrades gracefully; generateDraftMessage doesn't touch DB
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  messageLog: {},
}))

vi.mock('@/lib/evolution', () => ({
  sendWhatsAppMessage: vi.fn(),
  normalizePhone: (phone: string) => phone.replace(/\D/g, ''),
}))

vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/pilot', () => ({
  isPilotMode:    () => false,
  matchAllowlist: () => ({ allowed: true }),
}))

// ─── Imports (after mock declarations) ────────────────────────────────────────

import { generateDraftMessage } from './messages'
import { auth } from '@/lib/auth'
import { ensureTrainerIdForUser } from '@/lib/trainer'
import { getClientById, getInvoiceByIdForTrainer } from '@/lib/business-data/erp-adapter'
import { generateMessage } from '@/lib/claude'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRAINER_ID       = 'trainer-1'
const OTHER_TRAINER_ID = 'trainer-2'
const CLIENT_ID        = 'client-001'
const INVOICE_ID       = 'SINV-00001'

const SESSION = {
  user: {
    id:    'user-1',
    name:  'Test Trainer',
    email: 'trainer@example.com',
  },
}

const CLIENT = {
  id:        CLIENT_ID,
  name:      'Test Client',
  firstName: 'Test',
  trainerId: TRAINER_ID,
  phone:     '+96170000000',
  status:    'Active' as const,
  sessionCount: 5,
  createdAt: '2026-01-01',
}

const INVOICE = {
  id:        INVOICE_ID,
  clientId:  CLIENT_ID,
  amount:    100,
  currency:  'USD',
  dueDate:   '2026-02-01',
  status:    'Unpaid' as const,
  trainerId: TRAINER_ID,
}

function makeForbiddenError(): Error {
  return Object.assign(new Error('Invoice does not belong to this trainer.'), { status: 403 })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateDraftMessage — invoice ownership gate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never)
    vi.mocked(ensureTrainerIdForUser).mockResolvedValue(TRAINER_ID)
    vi.mocked(getClientById).mockResolvedValue(CLIENT as never)
    vi.mocked(generateMessage).mockResolvedValue({ success: true, body: 'Hello Test Client!' })
  })

  it('returns the draft when the invoice belongs to the requesting trainer', async () => {
    vi.mocked(getInvoiceByIdForTrainer).mockResolvedValue(INVOICE as never)

    const result = await generateDraftMessage('invoice', CLIENT_ID, INVOICE_ID)

    expect(result.success).toBe(true)
    expect(result.data).toBe('Hello Test Client!')

    // Must use the gated helper — never the ungated getInvoiceById
    expect(getInvoiceByIdForTrainer).toHaveBeenCalledWith(INVOICE_ID, TRAINER_ID)
  })

  it('rejects the draft when the invoice belongs to a different trainer', async () => {
    // getInvoiceByIdForTrainer throws 403 for cross-trainer access
    vi.mocked(getInvoiceByIdForTrainer).mockRejectedValue(
      Object.assign(makeForbiddenError(), {
        trainerId: OTHER_TRAINER_ID,
      }),
    )

    const result = await generateDraftMessage('invoice', CLIENT_ID, INVOICE_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invoice does not belong to this trainer.')

    // Draft must NOT have been generated with cross-trainer invoice data
    expect(generateMessage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ invoiceId: INVOICE_ID }),
    )
  })

  it('builds draft without invoice context when no invoiceId is supplied', async () => {
    const result = await generateDraftMessage('session_reminder', CLIENT_ID)

    expect(result.success).toBe(true)
    expect(getInvoiceByIdForTrainer).not.toHaveBeenCalled()
    expect(generateMessage).toHaveBeenCalledWith(
      'session_reminder',
      expect.not.objectContaining({ invoiceId: expect.anything() }),
    )
  })
})
