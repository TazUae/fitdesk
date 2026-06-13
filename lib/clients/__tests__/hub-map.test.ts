/**
 * Unit tests for mapToClientHubOverview — pure mapper, no I/O required.
 */

import { describe, expect, it } from 'vitest'
import { mapToClientHubOverview } from '@/lib/clients/hub-map'
import type { ClientActionIntent, ClientEvent, ClientGoal, ClientIndex } from '@/types/clients'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = '2026-01-01T10:00:00.000Z'

const baseIndex: ClientIndex = {
  id:                        'ci-local-1',
  tenantId:                  'tenant-a',
  erpCustomerId:             'CUST-100',
  fullName:                  'Sara Ahmad',
  phoneE164:                 '+96170000001',
  whatsappEnabled:           true,
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
  id:            'goal-1',
  tenantId:      'tenant-a',
  clientIndexId: 'ci-local-1',
  erpCustomerId: 'CUST-100',
  goalId:        'fat_loss',
  subGoalIds:    [],
  urgency:       'active_focus',
  confidence:    'high',
  source:        'trainer_manual',
  safetyFlags:   [],
  notes:         null,
  status:        'active',
  createdAtUtc:  NOW,
  updatedAtUtc:  NOW,
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
})
