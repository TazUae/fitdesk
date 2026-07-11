import { describe, it, expect, vi } from 'vitest'
import {
  completeSession,
  markNoShow,
  cancelSession,
  BillingNotConfiguredError,
  PayPerSessionCompletionDeferredError,
  SessionRateNotConfiguredError,
  NoPackageBalanceError,
  InvalidNoShowActionError,
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionCompletionService'
import type { FDSession } from '@/types/scheduling'
import type { Invoice } from '@/types'
import type { CompletionDeps } from '@/lib/scheduling/sessionCompletionService'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id:                'SINV-001',
    clientId:          'CUST-001',
    clientName:        'Alice',
    trainerId:         '',
    amount:            100,
    outstandingAmount: 100,
    currency:          'SAR',
    status:            'sent',
    dueDate:           '2026-07-01',
    issuedAt:          '2026-07-01',
    ...overrides,
  }
}

const BASE_SESSION: FDSession = {
  id:                     'fds-001',
  tenantId:               '',
  trainerId:              'trainer-1',
  clientId:               'CUST-001',
  clientName:             'Alice',
  seriesId:               null,
  startAt:                new Date('2026-01-05T09:00:00Z'),
  endAt:                  new Date('2026-01-05T10:00:00Z'),
  durationMinutes:        60,
  timezone:               'Asia/Riyadh',
  status:                 'scheduled',
  occurrenceKey:          null,
  occurrenceIndex:        null,
  isOverride:             false,
  rate:                   100,
  sessionType:            null,
  notes:                  null,
  invoiceId:              null,
  version:                1,
  isTrialSession:         false,
  sessionConsumedPackage: false,
}

function makeDeps(opts: {
  session?:              Partial<FDSession>
  billingMode?:          'package' | 'pay_per_session' | 'unset' | null
  consumeOutcome?:       'consumed' | 'already_done' | 'no_package' | 'no_balance'
  updateSessionResult?:  FDSession
  // PPS opts:
  existingInvoice?:      Invoice | null
  draftInvoice?:         Invoice           // returned by createInvoice
  submittedInvoice?:     Invoice           // returned by submitSalesInvoice
} = {}): CompletionDeps {
  const session = { ...BASE_SESSION, ...opts.session }
  const completed: FDSession = opts.updateSessionResult ?? {
    ...session,
    status:                 'completed',
    sessionConsumedPackage: true,
    version:                session.version + 1,
  }
  // Use explicit 'in' check so that null is preserved (not replaced by ??)
  const billingMode = 'billingMode' in opts ? opts.billingMode : 'package'

  const draftInvoice     = opts.draftInvoice     ?? makeInvoice({ id: 'SINV-001', status: 'draft' })
  const submittedInvoice = opts.submittedInvoice  ?? makeInvoice({ id: 'SINV-001', status: 'sent' })
  // existingInvoice defaults to null (no prior invoice)
  const existingInvoice  = 'existingInvoice' in opts ? opts.existingInvoice : null

  return {
    findSessionById:    vi.fn().mockResolvedValue(session),
    updateSession:      vi.fn().mockResolvedValue(completed),
    resolveBillingMode: vi.fn().mockResolvedValue(billingMode),
    consumeForSession:  vi.fn().mockResolvedValue({ outcome: opts.consumeOutcome ?? 'consumed' }),
    // PPS invoice deps
    findInvoiceBySession:       vi.fn().mockResolvedValue(existingInvoice),
    buildSessionInvoicePayload: vi.fn().mockReturnValue({ customer: 'CUST-001', items: [] }),
    createInvoice:              vi.fn().mockResolvedValue(draftInvoice),
    submitSalesInvoice:         vi.fn().mockResolvedValue(submittedInvoice),
    getPostingDate:             vi.fn().mockReturnValue('2026-07-01'),
  }
}

// ─── Version and immutable-state guards ──────────────────────────────────────

describe('completeSession — version guard', () => {
  it('throws VersionConflictError when expectedVersion does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(VersionConflictError)
  })

  it('does not call updateSession when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call consumeForSession when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })

  it('proceeds past the version guard when version matches', async () => {
    // Use billingMode=unset so the function reaches billing dispatch (proving version guard passed)
    const deps = makeDeps({ session: { version: 5 }, billingMode: 'unset' })
    await expect(completeSession(deps, 'fds-001', 5)).rejects.toBeInstanceOf(BillingNotConfiguredError)
  })
})

describe('completeSession — immutable-state guard', () => {
  it('throws ImmutableSessionError for completed status', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for cancelled status', async () => {
    const deps = makeDeps({ session: { status: 'cancelled' } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for no_show status', async () => {
    const deps = makeDeps({ session: { status: 'no_show' } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for skipped status', async () => {
    const deps = makeDeps({ session: { status: 'skipped' } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('does not call updateSession for terminal statuses', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call consumeForSession for terminal statuses', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })

  it('allows scheduled to proceed to package dispatch', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' }, billingMode: 'package', consumeOutcome: 'consumed' })
    const result = await completeSession(deps, 'fds-001', 1)
    expect(result.status).toBe('completed')
  })

  it('allows confirmed to proceed to package dispatch', async () => {
    const deps = makeDeps({ session: { status: 'confirmed' }, billingMode: 'package', consumeOutcome: 'consumed' })
    const result = await completeSession(deps, 'fds-001', 1)
    expect(result.status).toBe('completed')
  })
})

// ─── Trial path ───────────────────────────────────────────────────────────────

describe('completeSession — trial path', () => {
  it('flips status to completed for trial sessions', async () => {
    const deps = makeDeps({
      session:             { isTrialSession: true },
      updateSessionResult: { ...BASE_SESSION, isTrialSession: true, status: 'completed', version: 2, sessionConsumedPackage: false },
    })
    const result = await completeSession(deps, 'fds-001', 1)
    expect(result.status).toBe('completed')
  })

  it('increments version by 1 in the updateSession call', async () => {
    const deps = makeDeps({
      session:             { isTrialSession: true, version: 3 },
      updateSessionResult: { ...BASE_SESSION, isTrialSession: true, status: 'completed', version: 4, sessionConsumedPackage: false },
    })
    await completeSession(deps, 'fds-001', 3)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', {
      status:  'completed',
      version: 4,
    })
  })

  it('does not call resolveBillingMode for trial sessions', async () => {
    const deps = makeDeps({ session: { isTrialSession: true } })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.resolveBillingMode).not.toHaveBeenCalled()
  })

  it('does not call consumeForSession for trial sessions', async () => {
    const deps = makeDeps({ session: { isTrialSession: true } })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })

  it('calls findSessionById once and updateSession once — no other I/O', async () => {
    const deps = makeDeps({
      session:             { isTrialSession: true },
      updateSessionResult: { ...BASE_SESSION, isTrialSession: true, status: 'completed', version: 2, sessionConsumedPackage: false },
    })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.findSessionById).toHaveBeenCalledOnce()
    expect(deps.updateSession).toHaveBeenCalledOnce()
    expect(deps.resolveBillingMode).not.toHaveBeenCalled()
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })
})

// ─── Billing mode dispatch ─────────────────────────────────────────────────────

describe('completeSession — billing mode dispatch', () => {
  it('throws BillingNotConfiguredError for unset billing mode', async () => {
    const deps = makeDeps({ billingMode: 'unset' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(BillingNotConfiguredError)
  })

  it('throws BillingNotConfiguredError when client projection is missing (null)', async () => {
    const deps = makeDeps({ billingMode: null })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(BillingNotConfiguredError)
  })

  it('does not call updateSession for unset billing mode', async () => {
    const deps = makeDeps({ billingMode: 'unset' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('resolves billing mode using the session clientId', async () => {
    const deps = makeDeps({ session: { clientId: 'CUST-XYZ' }, billingMode: 'unset' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.resolveBillingMode).toHaveBeenCalledWith('CUST-XYZ')
  })

  it('does not call consumeForSession for pay_per_session clients', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })
})

// ─── Package path (C4C) ───────────────────────────────────────────────────────

describe('completeSession — package path', () => {
  it('calls consumeForSession exactly once with sessionId === session docname', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.consumeForSession).toHaveBeenCalledOnce()
    expect(deps.consumeForSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'fds-001' }),
    )
  })

  it('passes the session clientId as erpCustomerId to consumeForSession', async () => {
    const deps = makeDeps({ session: { clientId: 'CUST-42' }, billingMode: 'package', consumeOutcome: 'consumed' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.consumeForSession).toHaveBeenCalledWith({ sessionId: 'fds-001', erpCustomerId: 'CUST-42' })
  })

  it('completes with sessionConsumedPackage: true on consumed outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:                 'completed',
      sessionConsumedPackage: true,
    }))
  })

  it('increments version by 1 on consumed outcome', async () => {
    const deps = makeDeps({ session: { version: 7 }, billingMode: 'package', consumeOutcome: 'consumed' })
    await completeSession(deps, 'fds-001', 7)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({ version: 8 }))
  })

  it('completes with sessionConsumedPackage: true on already_done outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'already_done' })
    const result = await completeSession(deps, 'fds-001', 1)
    expect(result.status).toBe('completed')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:                 'completed',
      sessionConsumedPackage: true,
    }))
  })

  it('throws NoPackageBalanceError on no_package outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'no_package' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(NoPackageBalanceError)
  })

  it('throws NoPackageBalanceError on no_balance outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'no_balance' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(NoPackageBalanceError)
  })

  it('does not call updateSession on no_package outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'no_package' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call updateSession on no_balance outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'no_balance' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('skips consumeForSession when sessionConsumedPackage is already true', async () => {
    // Simulates retry after ledger succeeded but ERP status write failed
    const deps = makeDeps({
      session:       { sessionConsumedPackage: true },
      billingMode:   'package',
      consumeOutcome: 'consumed',
    })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.consumeForSession).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:                 'completed',
      sessionConsumedPackage: true,
    }))
  })

  it('ledger-first: consumeForSession resolves before updateSession is called', async () => {
    const callOrder: string[] = []
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    ;(deps.consumeForSession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('consume')
      return { outcome: 'consumed' }
    })
    ;(deps.updateSession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('update')
      return { ...BASE_SESSION, status: 'completed', version: 2, sessionConsumedPackage: true }
    })
    await completeSession(deps, 'fds-001', 1)
    expect(callOrder).toEqual(['consume', 'update'])
  })
})

// ─── Pay-per-session path (C7C) ───────────────────────────────────────────────

describe('completeSession — pay-per-session path', () => {
  it('creates and submits a new invoice when none exists, then updates FD Session', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    const result = await completeSession(deps, 'fds-001', 1)
    expect(result.status).toBe('completed')
    expect(deps.createInvoice).toHaveBeenCalledOnce()
    expect(deps.submitSalesInvoice).toHaveBeenCalledOnce()
    expect(deps.updateSession).toHaveBeenCalledOnce()
  })

  it('invoice-first: createInvoice resolves before updateSession is called', async () => {
    const callOrder: string[] = []
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    ;(deps.createInvoice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('create')
      return makeInvoice({ status: 'draft' })
    })
    ;(deps.submitSalesInvoice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('submit')
      return makeInvoice({ status: 'sent' })
    })
    ;(deps.updateSession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('update')
      return { ...BASE_SESSION, status: 'completed', version: 2 }
    })
    await completeSession(deps, 'fds-001', 1)
    expect(callOrder).toEqual(['create', 'submit', 'update'])
  })

  it('passes session docname as sessionId to buildSessionInvoicePayload', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.buildSessionInvoicePayload).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'fds-001' }),
    )
  })

  it('passes current.clientId as erpCustomerId to buildSessionInvoicePayload', async () => {
    const deps = makeDeps({ session: { clientId: 'CUST-999' }, billingMode: 'pay_per_session' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.buildSessionInvoicePayload).toHaveBeenCalledWith(
      expect.objectContaining({ erpCustomerId: 'CUST-999' }),
    )
  })

  it('passes current.rate to buildSessionInvoicePayload', async () => {
    const deps = makeDeps({ session: { rate: 250 }, billingMode: 'pay_per_session' })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.buildSessionInvoicePayload).toHaveBeenCalledWith(
      expect.objectContaining({ rate: 250 }),
    )
  })

  it('writes invoiceId to FD Session with the submitted invoice id', async () => {
    const deps = makeDeps({
      billingMode:     'pay_per_session',
      submittedInvoice: makeInvoice({ id: 'SINV-XYZ', status: 'sent' }),
    })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      invoiceId: 'SINV-XYZ',
    }))
  })

  it('writes status completed and increments version by 1', async () => {
    const deps = makeDeps({ session: { version: 3 }, billingMode: 'pay_per_session' })
    await completeSession(deps, 'fds-001', 3)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:  'completed',
      version: 4,
    }))
  })

  it('checks for an existing invoice before creating one', async () => {
    const callOrder: string[] = []
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    ;(deps.findInvoiceBySession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('find')
      return null
    })
    ;(deps.createInvoice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('create')
      return makeInvoice({ status: 'draft' })
    })
    await completeSession(deps, 'fds-001', 1)
    expect(callOrder[0]).toBe('find')
    expect(callOrder[1]).toBe('create')
  })

  it('reuses an existing submitted invoice — does not call createInvoice', async () => {
    const existing = makeInvoice({ id: 'SINV-EXISTING', status: 'sent' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: existing })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      invoiceId: 'SINV-EXISTING',
    }))
  })

  it('submits an existing draft invoice — does not call createInvoice', async () => {
    const draft = makeInvoice({ id: 'SINV-DRAFT', status: 'draft' })
    const submitted = makeInvoice({ id: 'SINV-DRAFT', status: 'sent' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: draft, submittedInvoice: submitted })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).toHaveBeenCalledWith('SINV-DRAFT')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      invoiceId: 'SINV-DRAFT',
    }))
  })

  it('reuses an existing paid invoice without calling createInvoice or submitSalesInvoice', async () => {
    const paid = makeInvoice({ id: 'SINV-PAID', status: 'paid' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: paid })
    await completeSession(deps, 'fds-001', 1)
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      invoiceId: 'SINV-PAID',
    }))
  })

  it('throws when existing invoice is cancelled — does not create a second invoice', async () => {
    const cancelled = makeInvoice({ id: 'SINV-CANCELLED', status: 'cancelled' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: cancelled })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('throws SessionRateNotConfiguredError when rate is 0', async () => {
    const deps = makeDeps({ session: { rate: 0 }, billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(SessionRateNotConfiguredError)
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('throws SessionRateNotConfiguredError when rate is negative', async () => {
    const deps = makeDeps({ session: { rate: -50 }, billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(SessionRateNotConfiguredError)
    expect(deps.createInvoice).not.toHaveBeenCalled()
  })

  it('does not call updateSession when createInvoice throws', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    ;(deps.createInvoice as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ERP create failed'))
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow('ERP create failed')
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call updateSession when submitSalesInvoice throws', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    ;(deps.submitSalesInvoice as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ERP submit failed'))
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow('ERP submit failed')
    expect(deps.updateSession).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// markNoShow (US-017) — approved design in docs/execution/phase-1-plus-safe-run-plan.md
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Version and immutable-state guards (identical to completeSession) ───────

describe('markNoShow — version guard', () => {
  it('throws VersionConflictError when expectedVersion does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(VersionConflictError)
  })

  it('does not call updateSession when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call resolveBillingMode when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toThrow()
    expect(deps.resolveBillingMode).not.toHaveBeenCalled()
  })
})

describe('markNoShow — immutable-state guard (invalid transitions)', () => {
  it('throws ImmutableSessionError for completed status', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for cancelled status', async () => {
    const deps = makeDeps({ session: { status: 'cancelled' } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for a session already no_show', async () => {
    const deps = makeDeps({ session: { status: 'no_show' } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for skipped status', async () => {
    const deps = makeDeps({ session: { status: 'skipped' } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('does not call updateSession for terminal statuses', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('allows scheduled to proceed to billing-mode dispatch', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' }, billingMode: 'package', consumeOutcome: 'consumed' })
    const result = await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({ status: 'no_show' }))
    void result
  })

  it('allows confirmed to proceed to billing-mode dispatch', async () => {
    const deps = makeDeps({ session: { status: 'confirmed' }, billingMode: 'package', consumeOutcome: 'consumed' })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({ status: 'no_show' }))
  })
})

// ─── Trial sessions — no charge regardless of requested financialAction ──────

describe('markNoShow — trial sessions', () => {
  it('flips status to no_show when financialAction is "charge" — no invoice created', async () => {
    const deps = makeDeps({ session: { isTrialSession: true } })
    await markNoShow(deps, 'fds-001', 1, 'charge')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({ status: 'no_show', version: 2 }))
    expect(deps.createInvoice).not.toHaveBeenCalled()
  })

  it('flips status to no_show when financialAction is "deduct" — no consumption', async () => {
    const deps = makeDeps({ session: { isTrialSession: true } })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({ status: 'no_show', version: 2 }))
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })

  it('flips status to no_show when financialAction is "waive"', async () => {
    const deps = makeDeps({ session: { isTrialSession: true } })
    const result = await markNoShow(deps, 'fds-001', 1, 'waive')
    void result
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({ status: 'no_show' }))
  })

  it('does not call resolveBillingMode for trial sessions', async () => {
    const deps = makeDeps({ session: { isTrialSession: true } })
    await markNoShow(deps, 'fds-001', 1, 'waive')
    expect(deps.resolveBillingMode).not.toHaveBeenCalled()
  })
})

// ─── Billing-mode / financial-action validation ───────────────────────────────

describe('markNoShow — billing mode and financial-action validation', () => {
  it('throws BillingNotConfiguredError for unset billing mode', async () => {
    const deps = makeDeps({ billingMode: 'unset' })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(BillingNotConfiguredError)
  })

  it('throws BillingNotConfiguredError when client projection is missing (null)', async () => {
    const deps = makeDeps({ billingMode: null })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).rejects.toBeInstanceOf(BillingNotConfiguredError)
  })

  it('throws InvalidNoShowActionError for "deduct" on a pay-per-session client', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await expect(markNoShow(deps, 'fds-001', 1, 'deduct')).rejects.toBeInstanceOf(InvalidNoShowActionError)
  })

  it('does not call consumeForSession or updateSession for an invalid "deduct" on pay-per-session', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await expect(markNoShow(deps, 'fds-001', 1, 'deduct')).rejects.toThrow()
    expect(deps.consumeForSession).not.toHaveBeenCalled()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('throws InvalidNoShowActionError for "charge" on a package client', async () => {
    const deps = makeDeps({ billingMode: 'package' })
    await expect(markNoShow(deps, 'fds-001', 1, 'charge')).rejects.toBeInstanceOf(InvalidNoShowActionError)
  })

  it('does not call createInvoice or updateSession for an invalid "charge" on package', async () => {
    const deps = makeDeps({ billingMode: 'package' })
    await expect(markNoShow(deps, 'fds-001', 1, 'charge')).rejects.toThrow()
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })
})

// ─── Pay-per-session — waive ──────────────────────────────────────────────────

describe('markNoShow — pay-per-session — waive', () => {
  it('flips status to no_show with no invoice created', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await markNoShow(deps, 'fds-001', 1, 'waive')
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:  'no_show',
      version: 2,
    }))
  })

  it('does not require a configured rate — waive never invoices', async () => {
    const deps = makeDeps({ session: { rate: 0 }, billingMode: 'pay_per_session' })
    await expect(markNoShow(deps, 'fds-001', 1, 'waive')).resolves.toBeDefined()
    expect(deps.createInvoice).not.toHaveBeenCalled()
  })

  it('does not write invoiceId on the update patch', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await markNoShow(deps, 'fds-001', 1, 'waive')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('invoiceId')
  })
})

// ─── Pay-per-session — charge ─────────────────────────────────────────────────

describe('markNoShow — pay-per-session — charge', () => {
  it('creates and submits a new invoice when none exists, then updates FD Session to no_show', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await markNoShow(deps, 'fds-001', 1, 'charge')
    expect(deps.createInvoice).toHaveBeenCalledOnce()
    expect(deps.submitSalesInvoice).toHaveBeenCalledOnce()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:    'no_show',
      invoiceId: 'SINV-001',
    }))
  })

  it('invoice-first: createInvoice and submitSalesInvoice resolve before updateSession is called', async () => {
    const callOrder: string[] = []
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    ;(deps.createInvoice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('create')
      return makeInvoice({ status: 'draft' })
    })
    ;(deps.submitSalesInvoice as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('submit')
      return makeInvoice({ status: 'sent' })
    })
    ;(deps.updateSession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('update')
      return { ...BASE_SESSION, status: 'no_show', version: 2 }
    })
    await markNoShow(deps, 'fds-001', 1, 'charge')
    expect(callOrder).toEqual(['create', 'submit', 'update'])
  })

  it('reuses an existing submitted invoice — does not call createInvoice', async () => {
    const existing = makeInvoice({ id: 'SINV-EXISTING', status: 'sent' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: existing })
    await markNoShow(deps, 'fds-001', 1, 'charge')
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:    'no_show',
      invoiceId: 'SINV-EXISTING',
    }))
  })

  it('submits an existing draft invoice — does not call createInvoice', async () => {
    const draft     = makeInvoice({ id: 'SINV-DRAFT', status: 'draft' })
    const submitted = makeInvoice({ id: 'SINV-DRAFT', status: 'sent' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: draft, submittedInvoice: submitted })
    await markNoShow(deps, 'fds-001', 1, 'charge')
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).toHaveBeenCalledWith('SINV-DRAFT')
  })

  it('throws when existing invoice is cancelled — does not create a second invoice', async () => {
    const cancelled = makeInvoice({ id: 'SINV-CANCELLED', status: 'cancelled' })
    const deps = makeDeps({ billingMode: 'pay_per_session', existingInvoice: cancelled })
    await expect(markNoShow(deps, 'fds-001', 1, 'charge')).rejects.toThrow()
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('throws SessionRateNotConfiguredError when rate is 0', async () => {
    const deps = makeDeps({ session: { rate: 0 }, billingMode: 'pay_per_session' })
    await expect(markNoShow(deps, 'fds-001', 1, 'charge')).rejects.toBeInstanceOf(SessionRateNotConfiguredError)
    expect(deps.createInvoice).not.toHaveBeenCalled()
  })

  it('throws SessionRateNotConfiguredError when rate is negative', async () => {
    const deps = makeDeps({ session: { rate: -50 }, billingMode: 'pay_per_session' })
    await expect(markNoShow(deps, 'fds-001', 1, 'charge')).rejects.toBeInstanceOf(SessionRateNotConfiguredError)
  })

  it('does not call updateSession when createInvoice throws', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    ;(deps.createInvoice as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ERP create failed'))
    await expect(markNoShow(deps, 'fds-001', 1, 'charge')).rejects.toThrow('ERP create failed')
    expect(deps.updateSession).not.toHaveBeenCalled()
  })
})

// ─── Package — waive ──────────────────────────────────────────────────────────

describe('markNoShow — package — waive', () => {
  it('flips status to no_show with no consumption and no invoice', async () => {
    const deps = makeDeps({ billingMode: 'package' })
    await markNoShow(deps, 'fds-001', 1, 'waive')
    expect(deps.consumeForSession).not.toHaveBeenCalled()
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:  'no_show',
      version: 2,
    }))
  })

  it('does not set sessionConsumedPackage on the update patch', async () => {
    const deps = makeDeps({ billingMode: 'package' })
    await markNoShow(deps, 'fds-001', 1, 'waive')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('sessionConsumedPackage')
  })
})

// ─── Package — deduct ─────────────────────────────────────────────────────────

describe('markNoShow — package — deduct', () => {
  it('calls consumeForSession exactly once with sessionId === session docname', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.consumeForSession).toHaveBeenCalledOnce()
    expect(deps.consumeForSession).toHaveBeenCalledWith({ sessionId: 'fds-001', erpCustomerId: 'CUST-001' })
  })

  it('never creates a package invoice during no-show deduct', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.findInvoiceBySession).not.toHaveBeenCalled()
    expect(deps.buildSessionInvoicePayload).not.toHaveBeenCalled()
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).not.toHaveBeenCalled()
  })

  it('completes with sessionConsumedPackage: true and status no_show on consumed outcome', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:                 'no_show',
      sessionConsumedPackage: true,
    }))
  })

  it('idempotency — completes with sessionConsumedPackage: true on already_done outcome (ledger replay)', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'already_done' })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:                 'no_show',
      sessionConsumedPackage: true,
    }))
  })

  it('idempotency — skips consumeForSession entirely when sessionConsumedPackage is already true (retry after ERP write failure)', async () => {
    const deps = makeDeps({ session: { sessionConsumedPackage: true }, billingMode: 'package', consumeOutcome: 'consumed' })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(deps.consumeForSession).not.toHaveBeenCalled()
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:                 'no_show',
      sessionConsumedPackage: true,
    }))
  })

  it('throws NoPackageBalanceError on no_package outcome — does not call updateSession', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'no_package' })
    await expect(markNoShow(deps, 'fds-001', 1, 'deduct')).rejects.toBeInstanceOf(NoPackageBalanceError)
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('throws NoPackageBalanceError on no_balance outcome — does not call updateSession', async () => {
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'no_balance' })
    await expect(markNoShow(deps, 'fds-001', 1, 'deduct')).rejects.toBeInstanceOf(NoPackageBalanceError)
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('ledger-first: consumeForSession resolves before updateSession is called', async () => {
    const callOrder: string[] = []
    const deps = makeDeps({ billingMode: 'package', consumeOutcome: 'consumed' })
    ;(deps.consumeForSession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('consume')
      return { outcome: 'consumed' }
    })
    ;(deps.updateSession as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('update')
      return { ...BASE_SESSION, status: 'no_show', version: 2, sessionConsumedPackage: true }
    })
    await markNoShow(deps, 'fds-001', 1, 'deduct')
    expect(callOrder).toEqual(['consume', 'update'])
  })
})

// ─── Reason/notes capture (approved behavior #3 — audit) ─────────────────────

describe('markNoShow — reason capture on notes', () => {
  it('appends the reason to notes when the session has no prior notes', async () => {
    const deps = makeDeps({ session: { notes: null }, billingMode: 'package' })
    await markNoShow(deps, 'fds-001', 1, 'waive', 'client did not show, no call')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      notes: 'No-show: client did not show, no call',
    }))
  })

  it('appends the reason to existing notes, preserving prior content', async () => {
    const deps = makeDeps({ session: { notes: 'Prefers evening sessions' }, billingMode: 'package' })
    await markNoShow(deps, 'fds-001', 1, 'waive', 'forgot the appointment')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      notes: 'Prefers evening sessions\nNo-show: forgot the appointment',
    }))
  })

  it('does not touch notes at all when no reason is supplied', async () => {
    const deps = makeDeps({ session: { notes: 'Prefers evening sessions' }, billingMode: 'package' })
    await markNoShow(deps, 'fds-001', 1, 'waive')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('notes')
  })

  it('does not touch notes when reason is an empty/whitespace-only string', async () => {
    const deps = makeDeps({ session: { notes: null }, billingMode: 'package' })
    await markNoShow(deps, 'fds-001', 1, 'waive', '   ')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('notes')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// cancelSession (US-039) — approved design in docs/execution/phase-1-plus-safe-run-plan.md
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Version and immutable-state guards (identical to completeSession/markNoShow) ──

describe('cancelSession — version guard', () => {
  it('throws VersionConflictError when expectedVersion does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(VersionConflictError)
  })

  it('does not call updateSession when version does not match', async () => {
    const deps = makeDeps({ session: { version: 2 } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })
})

describe('cancelSession — immutable-state guard (invalid transitions)', () => {
  it('throws ImmutableSessionError for completed status', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for a session already cancelled', async () => {
    const deps = makeDeps({ session: { status: 'cancelled' } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for no_show status', async () => {
    const deps = makeDeps({ session: { status: 'no_show' } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('throws ImmutableSessionError for skipped status', async () => {
    const deps = makeDeps({ session: { status: 'skipped' } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(ImmutableSessionError)
  })

  it('does not call updateSession for terminal statuses', async () => {
    const deps = makeDeps({ session: { status: 'completed' } })
    await expect(cancelSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })
})

// ─── Happy path — scheduled / confirmed → cancelled ───────────────────────────

describe('cancelSession — cancels from scheduled or confirmed', () => {
  it('cancels a scheduled session — status cancelled, version + 1', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', version: 1 } })
    await cancelSession(deps, 'fds-001', 1)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:  'cancelled',
      version: 2,
    }))
  })

  it('cancels a confirmed session — status cancelled, version + 1', async () => {
    const deps = makeDeps({ session: { status: 'confirmed', version: 5 } })
    await cancelSession(deps, 'fds-001', 5)
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      status:  'cancelled',
      version: 6,
    }))
  })

  it('calls findSessionById once and updateSession once — no other I/O', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' } })
    await cancelSession(deps, 'fds-001', 1)
    expect(deps.findSessionById).toHaveBeenCalledOnce()
    expect(deps.updateSession).toHaveBeenCalledOnce()
  })
})

// ─── Financial inertness — the core US-039 guarantee ──────────────────────────

describe('cancelSession — never has a financial side effect, for any billing mode', () => {
  it('never calls resolveBillingMode', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' } })
    await cancelSession(deps, 'fds-001', 1)
    expect(deps.resolveBillingMode).not.toHaveBeenCalled()
  })

  it('never calls consumeForSession', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' } })
    await cancelSession(deps, 'fds-001', 1)
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })

  it('never calls findInvoiceBySession, createInvoice, or submitSalesInvoice', async () => {
    const deps = makeDeps({ session: { status: 'scheduled' } })
    await cancelSession(deps, 'fds-001', 1)
    expect(deps.findInvoiceBySession).not.toHaveBeenCalled()
    expect(deps.createInvoice).not.toHaveBeenCalled()
    expect(deps.submitSalesInvoice).not.toHaveBeenCalled()
  })

  it('does not include invoiceId in the update patch — an existing invoiceId is left untouched', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', invoiceId: 'SINV-EXISTING' } })
    await cancelSession(deps, 'fds-001', 1)
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('invoiceId')
  })

  it('does not include sessionConsumedPackage in the update patch — an existing true value is left untouched', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', sessionConsumedPackage: true } })
    await cancelSession(deps, 'fds-001', 1)
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('sessionConsumedPackage')
  })

  it('behaves identically regardless of isTrialSession — never a billing lookup either way', async () => {
    const trial    = makeDeps({ session: { status: 'scheduled', isTrialSession: true } })
    const nonTrial = makeDeps({ session: { status: 'scheduled', isTrialSession: false } })
    await cancelSession(trial, 'fds-001', 1)
    await cancelSession(nonTrial, 'fds-001', 1)
    expect(trial.resolveBillingMode).not.toHaveBeenCalled()
    expect(nonTrial.resolveBillingMode).not.toHaveBeenCalled()
  })
})

// ─── Reason/notes capture ──────────────────────────────────────────────────────

describe('cancelSession — reason capture on notes', () => {
  it('appends the reason to notes when the session has no prior notes', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', notes: null } })
    await cancelSession(deps, 'fds-001', 1, 'client requested cancellation')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      notes: 'Cancelled: client requested cancellation',
    }))
  })

  it('appends the reason to existing notes, preserving prior content', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', notes: 'Prefers evening sessions' } })
    await cancelSession(deps, 'fds-001', 1, 'trainer unavailable')
    expect(deps.updateSession).toHaveBeenCalledWith('fds-001', expect.objectContaining({
      notes: 'Prefers evening sessions\nCancelled: trainer unavailable',
    }))
  })

  it('does not touch notes at all when no reason is supplied', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', notes: 'Prefers evening sessions' } })
    await cancelSession(deps, 'fds-001', 1)
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('notes')
  })

  it('does not touch notes when reason is an empty/whitespace-only string', async () => {
    const deps = makeDeps({ session: { status: 'scheduled', notes: null } })
    await cancelSession(deps, 'fds-001', 1, '   ')
    const [, patch] = (deps.updateSession as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(patch).not.toHaveProperty('notes')
  })
})

// ─── No direct ERP/billing/db runtime imports ─────────────────────────────────

describe('completeSession — no direct ERP, billing, or db runtime imports', () => {
  it('exports all error classes and completeSession (module loads without mocking ERP or billing)', () => {
    // Structural assertion: the service only has side-effect-free type imports from
    // @/lib/erpnext/types (pure interfaces, no runtime code). This test verifies the
    // module loads cleanly in an unmocked environment.
    expect(typeof completeSession).toBe('function')
    expect(typeof markNoShow).toBe('function')
    expect(typeof cancelSession).toBe('function')
    expect(typeof BillingNotConfiguredError).toBe('function')
    expect(typeof NoPackageBalanceError).toBe('function')
    expect(typeof PayPerSessionCompletionDeferredError).toBe('function')
    expect(typeof SessionRateNotConfiguredError).toBe('function')
    expect(typeof InvalidNoShowActionError).toBe('function')
    expect(typeof VersionConflictError).toBe('function')
    expect(typeof ImmutableSessionError).toBe('function')
  })
})
