/**
 * Unit tests for mapToClientHubOverview — pure mapper, no I/O required.
 */

import { describe, expect, it } from 'vitest'
import { derivePackageBalance, mapToClientHubOverview } from '@/lib/clients/hub-map'
import type { ClientActionIntent, ClientEvent, ClientGoal, ClientIndex } from '@/types/clients'
import type { PackagePurchaseWithBalance } from '@/types/billing'
import type { PackageTemplateSnapshot } from '@/types/billing'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = '2026-01-01T10:00:00.000Z'

const baseIndex: ClientIndex = {
  id:                        'ci-local-1',
  tenantId:                  'tenant-a',
  erpCustomerId:             'CUST-100',
  fullName:                  'Sara Ahmad',
  phoneE164:                 '+96170000001',
  whatsappEnabled:           true,
  whatsappConsentState:      'unknown',
  status:                    'active',
  primaryGoalLabel:          'Fat loss',
  primaryGoalId:             'fat_loss',
  safetyState:               'clear',
  onboardingState:           'not_started',
  billingMode:               'unset',
  paymentSummary:            'unset',
  nextSessionAtUtc:          null,
  lastActivityAtUtc:         NOW,
  possibleDuplicateClientId: null,
  duplicateOverrideReason:   null,
  createdAtUtc:              NOW,
  updatedAtUtc:              NOW,
}

const baseGoal: ClientGoal = {
  id:                'goal-1',
  tenantId:          'tenant-a',
  clientIndexId:     'ci-local-1',
  erpCustomerId:     'CUST-100',
  goalId:            'fat_loss',
  isPrimary:         true,
  subGoalIds:        [],
  trainerSubGoalIds: [],
  urgency:           'active_focus',
  confidence:        'high',
  source:            'trainer_manual',
  safetyFlags:       [],
  notes:             null,
  status:            'active',
  createdAtUtc:      NOW,
  updatedAtUtc:      NOW,
}

const baseIntent: ClientActionIntent = {
  id:              'intent-1',
  tenantId:        'tenant-a',
  clientIndexId:   'ci-local-1',
  erpCustomerId:   'CUST-100',
  type:            'send_whatsapp_welcome',
  status:          'pending',
  priority:        'normal',
  source:          'system',
  reason:          null,
  dueAtUtc:        null,
  completedAtUtc:  null,
  dismissedAtUtc:  null,
  expiresAtUtc:    null,
  createdAtUtc:    NOW,
  updatedAtUtc:    NOW,
}

const baseEvent: ClientEvent = {
  id:              'evt-1',
  tenantId:        'tenant-a',
  clientIndexId:   'ci-local-1',
  erpCustomerId:   'CUST-100',
  type:            'client.created',
  payloadJson:     {},
  createdByUserId: null,
  createdAtUtc:    NOW,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('mapToClientHubOverview', () => {
  it('maps client fields correctly', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [])

    expect(result.client.clientIndexId).toBe('ci-local-1')
    expect(result.client.erpCustomerId).toBe('CUST-100')
    expect(result.client.fullName).toBe('Sara Ahmad')
    expect(result.client.phoneE164).toBe('+96170000001')
    expect(result.client.whatsappEnabled).toBe(true)
    expect(result.client.status).toBe('active')
    expect(result.client.safetyState).toBe('clear')
    expect(result.client.onboardingState).toBe('not_started')
    expect(result.client.billingMode).toBe('unset')
    expect(result.client.paymentSummary).toBe('unset')
    expect(result.client.primaryGoalLabel).toBe('Fat loss')
    expect(result.client.nextSessionAtUtc).toBeNull()
    expect(result.client.lastActivityAtUtc).toBe(NOW)
  })

  it('returns empty goals, pendingActions, and recentNotes for empty inputs', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [])

    expect(result.goals).toEqual([])
    expect(result.pendingActions).toEqual([])
    expect(result.recentNotes).toEqual([])
  })

  it('maps a goal summary with primaryGoalLabel when goalId matches index.primaryGoalId', () => {
    const result = mapToClientHubOverview(baseIndex, [baseGoal], [], [])

    expect(result.goals).toHaveLength(1)
    expect(result.goals[0].id).toBe('goal-1')
    expect(result.goals[0].goalId).toBe('fat_loss')
    expect(result.goals[0].confidence).toBe('high')
    expect(result.goals[0].urgency).toBe('active_focus')
    expect(result.goals[0].primaryGoalLabel).toBe('Fat loss')
    expect(result.goals[0].status).toBe('active')
  })

  it('sets primaryGoalLabel to null for a goal whose id differs from index.primaryGoalId', () => {
    const secondaryGoal: ClientGoal = { ...baseGoal, id: 'goal-2', goalId: 'mobility' }
    const result = mapToClientHubOverview(baseIndex, [secondaryGoal], [], [])

    expect(result.goals[0].primaryGoalLabel).toBeNull()
    expect(result.goals[0].goalId).toBe('mobility')
  })

  it('maps pending actions to ActionIntentSummary shape', () => {
    const result = mapToClientHubOverview(baseIndex, [], [baseIntent], [])

    expect(result.pendingActions).toHaveLength(1)
    expect(result.pendingActions[0].id).toBe('intent-1')
    expect(result.pendingActions[0].type).toBe('send_whatsapp_welcome')
    expect(result.pendingActions[0].status).toBe('pending')
    expect(result.pendingActions[0].priority).toBe('normal')
    expect(result.pendingActions[0].reason).toBeNull()
    expect(result.pendingActions[0].dueAtUtc).toBeNull()
  })

  it('maps events to note summaries (id, type, createdAtUtc)', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [baseEvent])

    expect(result.recentNotes).toHaveLength(1)
    expect(result.recentNotes[0].id).toBe('evt-1')
    expect(result.recentNotes[0].type).toBe('client.created')
    expect(result.recentNotes[0].createdAtUtc).toBe(NOW)
  })

  it('note summary text is null for non-note event types (US-053)', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [baseEvent])
    expect(result.recentNotes[0].text).toBeNull()
  })

  it('note summary text is populated for client.note events (US-053)', () => {
    const noteEvent: ClientEvent = { ...baseEvent, id: 'evt-note-1', type: 'client.note', payloadJson: { text: 'Great progress this week' } }
    const result = mapToClientHubOverview(baseIndex, [], [], [noteEvent])
    expect(result.recentNotes[0].text).toBe('Great progress this week')
  })

  it('note summary text is null for a client.note event with a non-string payload text (defensive)', () => {
    const malformedNoteEvent: ClientEvent = { ...baseEvent, id: 'evt-note-2', type: 'client.note', payloadJson: { text: 123 } }
    const result = mapToClientHubOverview(baseIndex, [], [], [malformedNoteEvent])
    expect(result.recentNotes[0].text).toBeNull()
  })

  it('caps recentNotes at 10 even when more events are provided', () => {
    const manyEvents: ClientEvent[] = Array.from({ length: 15 }, (_, i) => ({
      ...baseEvent,
      id:          `evt-${i}`,
      createdAtUtc: new Date(Date.now() - i * 1000).toISOString(),
    }))

    const result = mapToClientHubOverview(baseIndex, [], [], manyEvents)
    expect(result.recentNotes).toHaveLength(10)
  })

  it('includes trainingProgram and progress placeholders with status not_started', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [])

    expect(result.placeholders.trainingProgram.status).toBe('not_started')
    expect(typeof result.placeholders.trainingProgram.label).toBe('string')
    expect(result.placeholders.progress.status).toBe('not_started')
    expect(typeof result.placeholders.progress.label).toBe('string')
  })

  it('all required ClientHubOverview keys are present', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [])
    const clientKeys = Object.keys(result.client)

    expect(clientKeys).toContain('clientIndexId')
    expect(clientKeys).toContain('erpCustomerId')
    expect(clientKeys).toContain('fullName')
    expect(clientKeys).toContain('phoneE164')
    expect(clientKeys).toContain('whatsappEnabled')
    expect(clientKeys).toContain('status')
    expect(clientKeys).toContain('safetyState')
    expect(clientKeys).toContain('onboardingState')
    expect(clientKeys).toContain('billingMode')
    expect(clientKeys).toContain('paymentSummary')
    expect(clientKeys).toContain('primaryGoalLabel')
    expect(clientKeys).toContain('nextSessionAtUtc')
    expect(clientKeys).toContain('lastActivityAtUtc')
  })

  it('packageBalance is null when no purchases provided (default)', () => {
    const result = mapToClientHubOverview(baseIndex, [], [], [])
    expect(result.packageBalance).toBeNull()
  })

  it('packageBalance is populated when active purchase with balance is provided', () => {
    const purchase = makePurchase('p1', 5)
    const result   = mapToClientHubOverview(baseIndex, [], [], [], [purchase])
    expect(result.packageBalance).not.toBeNull()
    expect(result.packageBalance!.totalAvailableSessions).toBe(5)
  })
})

// ─── derivePackageBalance ──────────────────────────────────────────────────────

const baseSnapshot: PackageTemplateSnapshot = {
  schemaVersion:        1,
  templateId:           'tpl-qa-1',
  name:                 'Gold Block 10',
  description:          null,
  templateType:         'standard_block',
  sessionCount:         10,
  priceAmount:          50000,
  currency:             'USD',
  expiryDays:           30,
  erpItemCode:          null,
  supersedesTemplateId: null,
  templateStatus:       'active',
  capturedAtUtc:        NOW,
}

function makePurchase(
  id: string,
  remainingBalance: number,
  packageStatus: PackagePurchaseWithBalance['packageStatus'] = 'active',
): PackagePurchaseWithBalance {
  return {
    id,
    tenantId:          'tenant-a',
    clientIndexId:     'ci-local-1',
    erpCustomerId:     'CUST-100',
    packageTemplateId: 'tpl-qa-1',
    templateSnapshot:  baseSnapshot,
    erpSalesInvoiceId: null,
    idempotencyKey:    null,
    paymentStatus:     'paid',
    packageStatus,
    purchasedAtUtc:    NOW,
    activatedAtUtc:    NOW,
    expiresAtUtc:      null,
    createdAtUtc:      NOW,
    updatedAtUtc:      NOW,
    remainingBalance,
  }
}

describe('derivePackageBalance', () => {
  it('returns null for an empty purchases array', () => {
    expect(derivePackageBalance([])).toBeNull()
  })

  it('returns null when the only active purchase has zero remaining balance', () => {
    expect(derivePackageBalance([makePurchase('p1', 0)])).toBeNull()
  })

  it('returns null when purchases exist but none are active status', () => {
    expect(derivePackageBalance([makePurchase('p1', 5, 'expired')])).toBeNull()
    expect(derivePackageBalance([makePurchase('p2', 5, 'cancelled')])).toBeNull()
  })

  it('derives correct summary for one active purchase with 5 sessions', () => {
    const result = derivePackageBalance([makePurchase('p1', 5)])
    expect(result).toEqual({
      totalAvailableSessions: 5,
      activePurchaseCount:    1,
      displayTemplateName:    'Gold Block 10',
    })
  })

  it('aggregates balance across two active purchases — 10 sessions total, 2 active packages', () => {
    const result = derivePackageBalance([makePurchase('p1', 5), makePurchase('p2', 5)])
    expect(result).not.toBeNull()
    expect(result!.totalAvailableSessions).toBe(10)
    expect(result!.activePurchaseCount).toBe(2)
  })

  it('uses the first active purchase template name as displayTemplateName', () => {
    const p1 = makePurchase('p1', 5)
    const p2: PackagePurchaseWithBalance = {
      ...makePurchase('p2', 5),
      templateSnapshot: { ...baseSnapshot, name: 'Silver Block 5' },
    }
    const result = derivePackageBalance([p1, p2])
    expect(result!.displayTemplateName).toBe('Gold Block 10')
  })

  it('excludes expired purchases from the count and total', () => {
    const result = derivePackageBalance([
      makePurchase('p1', 5),
      makePurchase('p2', 3, 'expired'),
    ])
    expect(result!.totalAvailableSessions).toBe(5)
    expect(result!.activePurchaseCount).toBe(1)
  })

  it('does not include ERP invoice status, payment totals, or financial data', () => {
    const result = derivePackageBalance([makePurchase('p1', 5)])
    expect(result).not.toHaveProperty('erpInvoiceId')
    expect(result).not.toHaveProperty('paymentTotal')
    expect(result).not.toHaveProperty('priceAmount')
  })
})
