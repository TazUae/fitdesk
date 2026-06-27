/**
 * Unit tests for the assignPackage server action.
 *
 * All external boundaries are mocked via vi.mock:
 *  - @/lib/auth/resolve-trainer   (auth gate)
 *  - @/lib/tenant/context         (server-side tenantId)
 *  - @/lib/business-data/erp-adapter  (ERP functions)
 *  - @/lib/billing/package-assignment-service  (service class)
 *  - @/lib/db                     (LibSQL singleton — avoids file creation)
 *
 * We do NOT test service internals here — that's PackageAssignmentService's
 * test file. We only test the action's orchestration: auth gate, tenant
 * injection, input safety, and ActionResult envelope.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssignPackageInput, AssignPackageResult, ClientPackagePurchase } from '@/types/billing'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const serviceAssignPackage = vi.fn()
  // Must use `function` keyword — arrow functions are not constructors
  const PackageAssignmentServiceMock = vi.fn().mockImplementation(function () {
    return { assignPackage: serviceAssignPackage }
  })
  return {
    resolveTrainerId:            vi.fn(),
    getTenantContext:            vi.fn(),
    serviceAssignPackage,
    PackageAssignmentServiceMock,
    createInvoice:               vi.fn(),
    submitSalesInvoice:          vi.fn(),
    getInvoiceById:              vi.fn(),
    createAndSubmitPaymentEntry: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ db: {} }))

vi.mock('@/lib/auth/resolve-trainer', () => ({
  resolveTrainerId: mocks.resolveTrainerId,
}))

vi.mock('@/lib/tenant/context', () => ({
  getTenantContext: mocks.getTenantContext,
}))

vi.mock('@/lib/business-data/erp-adapter', () => ({
  createAndSubmitPaymentEntry: mocks.createAndSubmitPaymentEntry,
  createInvoice:               mocks.createInvoice,
  submitSalesInvoice:          mocks.submitSalesInvoice,
  getInvoiceById:              mocks.getInvoiceById,
}))

vi.mock('@/lib/billing/package-assignment-service', () => ({
  PackageAssignmentService: mocks.PackageAssignmentServiceMock,
}))

// Import AFTER mocks are registered
import { assignPackage } from '@/actions/packages'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TENANT_CTX = {
  userId:             'user-c3c-1',
  tenantId:           'tenant-c3c',
  slug:               'test-ws',
  provisioningStatus: 'provisioned',
  lastSyncedAt:       null,
}

function makeInput(overrides: Partial<AssignPackageInput> = {}): AssignPackageInput {
  return {
    clientIndexId:     'ci-c3c-1',
    erpCustomerId:     'CUST-C3C-001',
    packageTemplateId: 'tpl-c3c-paid',
    idempotencyKey:    'ikey-c3c-1',
    assignedByUserId:  'CLIENT_SUPPLIED_MUST_BE_OVERRIDDEN',
    ...overrides,
  }
}

function makeAssignResult(): AssignPackageResult {
  return {
    purchase: {
      id:                'purch-c3c-1',
      tenantId:          'tenant-c3c',
      clientIndexId:     'ci-c3c-1',
      erpCustomerId:     'CUST-C3C-001',
      packageTemplateId: 'tpl-c3c-paid',
      templateSnapshot: {
        schemaVersion: 1,
        templateId:    'tpl-c3c-paid',
        name:          '10-Session Block',
        description:   null,
        templateType:  'standard_block',
        sessionCount:  10,
        priceAmount:   50000,
        currency:      'USD',
        expiryDays:    null,
        erpItemCode:   'SVC-10',
        supersedesTemplateId: null,
        templateStatus: 'active',
        capturedAtUtc: '2026-06-27T00:00:00Z',
      },
      erpSalesInvoiceId: 'ACC-SINV-2026-C3C-001',
      idempotencyKey:    'ikey-c3c-1',
      paymentStatus:     'unpaid',
      packageStatus:     'active',
      purchasedAtUtc:    '2026-06-27T00:00:00Z',
      activatedAtUtc:    '2026-06-27T00:00:00Z',
      expiresAtUtc:      null,
      createdAtUtc:      '2026-06-27T00:00:00Z',
      updatedAtUtc:      '2026-06-27T00:00:00Z',
    } as ClientPackagePurchase,
    ledgerEvent: {
      id:                'led-c3c-1',
      tenantId:          'tenant-c3c',
      clientIndexId:     'ci-c3c-1',
      erpCustomerId:     'CUST-C3C-001',
      packagePurchaseId: 'purch-c3c-1',
      eventType:         'purchase_activation',
      deltaUnits:        10,
      reason:            null,
      idempotencyKey:    'ikey-c3c-1:activation',
      erpReference:      'ACC-SINV-2026-C3C-001',
      createdByUserId:   'user-c3c-1',
      createdAtUtc:      '2026-06-27T00:00:00Z',
    },
    erpInvoiceId:       'ACC-SINV-2026-C3C-001',
    invoice:            {
      id:                'ACC-SINV-2026-C3C-001',
      clientId:          'CUST-C3C-001',
      clientName:        'Test Client',
      trainerId:         '',
      amount:            500,
      outstandingAmount: 500,
      currency:          'USD',
      status:            'sent',
      dueDate:           '2026-06-27',
      issuedAt:          '2026-06-27',
    },
    isIdempotentReplay: false,
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveTrainerId.mockResolvedValue({ trainerId: 'trainer-c3c-1' })
  mocks.getTenantContext.mockResolvedValue(TENANT_CTX)
  mocks.serviceAssignPackage.mockResolvedValue(makeAssignResult())
})

// ─── 1. Success path ──────────────────────────────────────────────────────────

describe('success path', () => {
  it('returns ActionResult success:true with the service result', async () => {
    const result = await assignPackage(makeInput())

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('unexpected failure')
    expect(result.data.purchase.packageStatus).toBe('active')
    expect(result.data.erpInvoiceId).toBe('ACC-SINV-2026-C3C-001')
    expect(result.data.isIdempotentReplay).toBe(false)
  })
})

// ─── 2. Service receives exact input (with server-injected userId) ─────────────

describe('input forwarding', () => {
  it('forwards clientIndexId, erpCustomerId, packageTemplateId, idempotencyKey from client', async () => {
    const input = makeInput()
    await assignPackage(input)

    const [, receivedInput] = mocks.serviceAssignPackage.mock.calls[0]!
    expect(receivedInput.clientIndexId).toBe('ci-c3c-1')
    expect(receivedInput.erpCustomerId).toBe('CUST-C3C-001')
    expect(receivedInput.packageTemplateId).toBe('tpl-c3c-paid')
    expect(receivedInput.idempotencyKey).toBe('ikey-c3c-1')
  })
})

// ─── 3. Server-derived ctx — tenantId is never from the client ────────────────

describe('server-derived ctx', () => {
  it('calls service with tenantId from getTenantContext, not from client input', async () => {
    await assignPackage(makeInput())

    const [receivedCtx] = mocks.serviceAssignPackage.mock.calls[0]!
    expect(receivedCtx).toEqual({ tenantId: 'tenant-c3c' })
  })

  it('injects ctx.userId as assignedByUserId, overriding any client-supplied value', async () => {
    const input = makeInput({ assignedByUserId: 'CLIENT_SUPPLIED_MUST_BE_OVERRIDDEN' })
    await assignPackage(input)

    const [, receivedInput] = mocks.serviceAssignPackage.mock.calls[0]!
    expect(receivedInput.assignedByUserId).toBe('user-c3c-1')
    expect(receivedInput.assignedByUserId).not.toBe('CLIENT_SUPPLIED_MUST_BE_OVERRIDDEN')
  })
})

// ─── 4. Unauthenticated user ──────────────────────────────────────────────────

describe('auth gate', () => {
  it('returns success:false when resolveTrainerId returns an error', async () => {
    mocks.resolveTrainerId.mockResolvedValue({ error: 'Not authenticated.' })

    const result = await assignPackage(makeInput())

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated.')
    expect(mocks.getTenantContext).not.toHaveBeenCalled()
    expect(mocks.serviceAssignPackage).not.toHaveBeenCalled()
  })
})

// ─── 5. No tenant context ─────────────────────────────────────────────────────

describe('tenant context gate', () => {
  it('returns success:false when getTenantContext returns null', async () => {
    mocks.getTenantContext.mockResolvedValue(null)

    const result = await assignPackage(makeInput())

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toMatch(/workspace not provisioned/i)
    expect(mocks.serviceAssignPackage).not.toHaveBeenCalled()
  })

  it('returns success:false when tenantId is null in the context', async () => {
    mocks.getTenantContext.mockResolvedValue({ ...TENANT_CTX, tenantId: null })

    const result = await assignPackage(makeInput())

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toMatch(/workspace not provisioned/i)
    expect(mocks.serviceAssignPackage).not.toHaveBeenCalled()
  })
})

// ─── 6. Service error → success:false ────────────────────────────────────────

describe('service error handling', () => {
  it('returns success:false when service throws an Error', async () => {
    mocks.serviceAssignPackage.mockRejectedValue(
      new Error('[PackageAssignmentService] template not found'),
    )

    const result = await assignPackage(makeInput())

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('[PackageAssignmentService] template not found')
  })

  it('returns success:false with fallback message when service throws a non-Error', async () => {
    mocks.serviceAssignPackage.mockRejectedValue('something opaque')

    const result = await assignPackage(makeInput())

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Failed to assign package.')
  })

  it('does not leak raw stack traces in the error message', async () => {
    mocks.serviceAssignPackage.mockRejectedValue(
      new Error('some internal error'),
    )

    const result = await assignPackage(makeInput())

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).not.toContain('at ')   // no stack frames
    expect(result.error).not.toContain('\n')     // no multi-line stack
  })
})

// ─── 7. ERP adapter boundary — injected from business-data only ───────────────

describe('ERP adapter injection', () => {
  it('constructs PackageAssignmentService with all four adapter functions from business-data', async () => {
    await assignPackage(makeInput())

    expect(mocks.PackageAssignmentServiceMock).toHaveBeenCalledOnce()
    const [, adapter] = mocks.PackageAssignmentServiceMock.mock.calls[0]!
    expect(adapter).toEqual({
      createAndSubmitPaymentEntry: mocks.createAndSubmitPaymentEntry,
      createInvoice:               mocks.createInvoice,
      submitSalesInvoice:          mocks.submitSalesInvoice,
      getInvoiceById:              mocks.getInvoiceById,
    })
  })
})

// ─── 8–12. Static source invariants ──────────────────────────────────────────

describe('action source invariants', () => {
  const src = readFileSync(join(__dirname, 'packages.ts'), 'utf-8')

  it("starts with 'use server' directive", () => {
    expect(src).toMatch(/^\s*['"]use server['"]\s*;?\s*$/m)
  })

  it('does not import from lib/erpnext/client directly', () => {
    expect(src).not.toContain('lib/erpnext/client')
  })

  it('imports ERP functions only from @/lib/business-data/erp-adapter', () => {
    expect(src).toContain("from '@/lib/business-data/erp-adapter'")
  })

  it('imports and injects createAndSubmitPaymentEntry from the adapter without invoking it directly', () => {
    // Must be present (imported and injected as a dependency)
    expect(src).toContain('createAndSubmitPaymentEntry')
    expect(src).toContain("from '@/lib/business-data/erp-adapter'")
    // Must not be called directly in the action body — only passed as a reference
    expect(src).not.toMatch(/createAndSubmitPaymentEntry\s*\(/)
  })

  it('does not import from other action files', () => {
    expect(src).not.toMatch(/from ['"]@\/actions\/(clients|invoices|sessions|whatsapp|messages)['"]/)
  })

  it('does not contain WhatsApp or session or payment-entry primitives', () => {
    expect(src).not.toContain('sendMessage')
    expect(src).not.toContain('evolution')
    expect(src).not.toContain('markSessionComplete')
    expect(src).not.toContain('createSession')
    // Use word-boundary regex so 'createAndSubmitPaymentEntry' (our function) is not a false positive
    expect(src).not.toMatch(/\bPaymentEntry\b/)
    expect(src).not.toContain('markInvoicePaid')
  })
})

// ─── 8. Payment method validation gate ───────────────────────────────────────

describe('payment method validation gate', () => {
  it('returns success:false for a disabled payment method before constructing the service', async () => {
    // 'omt' is defined but disabled in PAYMENT_METHODS
    const result = await assignPackage(makeInput({ payment: { method: 'omt' } }))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toMatch(/unsupported or disabled payment method/i)
    expect(mocks.PackageAssignmentServiceMock).not.toHaveBeenCalled()
    expect(mocks.serviceAssignPackage).not.toHaveBeenCalled()
  })

  it('allows an enabled payment method through to the service', async () => {
    const result = await assignPackage(makeInput({ payment: { method: 'cash' } }))

    expect(result.success).toBe(true)
    expect(mocks.serviceAssignPackage).toHaveBeenCalledOnce()
  })

  it('allows whish_money through to the service', async () => {
    const result = await assignPackage(makeInput({ payment: { method: 'whish_money' } }))

    expect(result.success).toBe(true)
    expect(mocks.serviceAssignPackage).toHaveBeenCalledOnce()
  })
})

// ─── 9. Paid Now input forwarding ────────────────────────────────────────────

describe('Paid Now input forwarding', () => {
  it('forwards input.payment to the service unchanged', async () => {
    await assignPackage(makeInput({ payment: { method: 'cash' } }))

    const [, receivedInput] = mocks.serviceAssignPackage.mock.calls[0]!
    expect(receivedInput.payment).toEqual({ method: 'cash' })
  })

  it('does not introduce client-supplied amount, currency, ERP mode, or payment entry id', async () => {
    await assignPackage(makeInput({ payment: { method: 'cash' } }))

    const [, receivedInput] = mocks.serviceAssignPackage.mock.calls[0]!
    expect(receivedInput).not.toHaveProperty('amount')
    expect(receivedInput).not.toHaveProperty('modeOfPayment')
    expect(receivedInput).not.toHaveProperty('paymentEntryId')
    expect(receivedInput).not.toHaveProperty('currency')
  })

  it('still overrides assignedByUserId with ctx.userId even when payment is present', async () => {
    await assignPackage(makeInput({
      payment:          { method: 'cash' },
      assignedByUserId: 'CLIENT_SUPPLIED_MUST_BE_OVERRIDDEN',
    }))

    const [, receivedInput] = mocks.serviceAssignPackage.mock.calls[0]!
    expect(receivedInput.assignedByUserId).toBe('user-c3c-1')
    expect(receivedInput.assignedByUserId).not.toBe('CLIENT_SUPPLIED_MUST_BE_OVERRIDDEN')
  })
})

// ─── 10. paymentWarning passthrough ──────────────────────────────────────────

describe('paymentWarning passthrough', () => {
  it('includes paymentWarning from the service result in the returned data', async () => {
    const warning = 'Payment was not recorded. The package is active and payment can be collected later.'
    mocks.serviceAssignPackage.mockResolvedValueOnce({
      ...makeAssignResult(),
      paymentWarning: warning,
    })

    const result = await assignPackage(makeInput({ payment: { method: 'cash' } }))

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.data.paymentWarning).toBe(warning)
  })

  it('does not synthesise a paymentWarning when the service returns none', async () => {
    // default makeAssignResult() has no paymentWarning
    const result = await assignPackage(makeInput())

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.data.paymentWarning).toBeUndefined()
  })
})
