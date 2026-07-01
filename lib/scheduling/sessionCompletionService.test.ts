import { describe, it, expect, vi } from 'vitest'
import {
  completeSession,
  BillingNotConfiguredError,
  PayPerSessionCompletionDeferredError,
  SessionRateNotConfiguredError,
  NoPackageBalanceError,
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

// ─── No direct ERP/billing/db runtime imports ─────────────────────────────────

describe('completeSession — no direct ERP, billing, or db runtime imports', () => {
  it('exports all error classes and completeSession (module loads without mocking ERP or billing)', () => {
    // Structural assertion: the service only has side-effect-free type imports from
    // @/lib/erpnext/types (pure interfaces, no runtime code). This test verifies the
    // module loads cleanly in an unmocked environment.
    expect(typeof completeSession).toBe('function')
    expect(typeof BillingNotConfiguredError).toBe('function')
    expect(typeof NoPackageBalanceError).toBe('function')
    expect(typeof PayPerSessionCompletionDeferredError).toBe('function')
    expect(typeof SessionRateNotConfiguredError).toBe('function')
    expect(typeof VersionConflictError).toBe('function')
    expect(typeof ImmutableSessionError).toBe('function')
  })
})
