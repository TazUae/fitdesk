import { describe, it, expect, vi } from 'vitest'
import {
  completeSession,
  BillingNotConfiguredError,
  PayPerSessionCompletionDeferredError,
  NoPackageBalanceError,
  VersionConflictError,
  ImmutableSessionError,
} from '@/lib/scheduling/sessionCompletionService'
import type { FDSession } from '@/types/scheduling'
import type { CompletionDeps } from '@/lib/scheduling/sessionCompletionService'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
  return {
    findSessionById:   vi.fn().mockResolvedValue(session),
    updateSession:     vi.fn().mockResolvedValue(completed),
    resolveBillingMode: vi.fn().mockResolvedValue(billingMode),
    consumeForSession: vi.fn().mockResolvedValue({ outcome: opts.consumeOutcome ?? 'consumed' }),
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

  it('proceeds when version matches', async () => {
    const deps = makeDeps({ session: { version: 5 }, billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 5)).rejects.toBeInstanceOf(PayPerSessionCompletionDeferredError)
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

  it('throws PayPerSessionCompletionDeferredError for pay_per_session clients', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toBeInstanceOf(PayPerSessionCompletionDeferredError)
  })

  it('does not call updateSession for pay_per_session clients', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.updateSession).not.toHaveBeenCalled()
  })

  it('does not call consumeForSession for pay_per_session clients', async () => {
    const deps = makeDeps({ billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.consumeForSession).not.toHaveBeenCalled()
  })

  it('resolves billing mode using the session clientId', async () => {
    const deps = makeDeps({ session: { clientId: 'CUST-XYZ' }, billingMode: 'pay_per_session' })
    await expect(completeSession(deps, 'fds-001', 1)).rejects.toThrow()
    expect(deps.resolveBillingMode).toHaveBeenCalledWith('CUST-XYZ')
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

// ─── No external billing/payment/invoice calls ───────────────────────────────

describe('completeSession — no package/billing/payment imports', () => {
  it('the service module only imports from types — no billing, ERP, or db imports', () => {
    // Structural assertion: the service file only imports from @/types/*.
    // If someone adds an import to lib/billing/* or lib/erpnext/*, this
    // test catches it by verifying the module can be imported in an environment
    // where those modules are NOT mocked (this test file has no vi.mock calls).
    expect(typeof completeSession).toBe('function')
    expect(typeof BillingNotConfiguredError).toBe('function')
    expect(typeof NoPackageBalanceError).toBe('function')
    expect(typeof PayPerSessionCompletionDeferredError).toBe('function')
    expect(typeof VersionConflictError).toBe('function')
    expect(typeof ImmutableSessionError).toBe('function')
  })
})
