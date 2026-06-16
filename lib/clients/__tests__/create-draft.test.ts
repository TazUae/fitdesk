/**
 * Pure unit tests for buildClientCreateDraft.
 *
 * Invariant under test: draft.erpCustomerId is the ERP Customer docname
 * (createdClient.id), and structured goals are created ONLY from clean
 * trainer-selected goal arrays.
 */

import { describe, expect, it } from 'vitest'
import { buildClientCreateDraft } from '@/lib/clients/create-draft'
import type { Client } from '@/types'

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id:           'CUST-100',
    firstName:    'Sara',
    lastName:     'Ahmad',
    name:         'Sara Ahmad',
    phone:        '+96170000001',
    status:       'active',
    trainerId:    '',
    sessionCount: 0,
    goal:         undefined,
    createdAt:    '2026-01-01',
    ...overrides,
  }
}

const CLEAN_GOAL = '[{"label":"fat_loss","value":"fat_loss"}]'

describe('buildClientCreateDraft', () => {
  it('uses the ERP docname as erpCustomerId and maps core fields', () => {
    const { draft } = buildClientCreateDraft({
      tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
    })
    expect(draft.erpCustomerId).toBe('CUST-100')
    expect(draft.fullName).toBe('Sara Ahmad')
    expect(draft.tenantId).toBe('tenant-a')
    expect(draft.createdByUserId).toBe('user-1')
    expect(draft.whatsappEnabled).toBe(false)
    expect(draft.safetyFlags).toEqual([])
    expect(draft.goalNotes).toBeNull()
  })

  describe('phone normalization', () => {
    it('normalizes a valid phone to E.164 and flags phoneNormalized true', () => {
      const { draft, phoneNormalized } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1',
        createdClient: makeClient({ phone: '+96170000001' }), customFitnessGoals: null,
      })
      expect(phoneNormalized).toBe(true)
      expect(draft.phoneE164).toBe('+96170000001')
    })

    it('falls back to the raw phone and flags phoneNormalized false when unparseable', () => {
      const { draft, phoneNormalized } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1',
        createdClient: makeClient({ phone: 'not-a-phone' }), customFitnessGoals: null,
      })
      expect(phoneNormalized).toBe(false)
      expect(draft.phoneE164).toBe('not-a-phone')
    })
  })

  describe('goal handling', () => {
    it('maps a clean trainer-selected goal to high / trainer_manual with goalId', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1',
        createdClient: makeClient(), customFitnessGoals: CLEAN_GOAL,
      })
      expect(draft.goalId).toBe('fat_loss')
      expect(draft.primaryGoalId).toBe('fat_loss')
      expect(draft.goalConfidence).toBe('high')
      expect(draft.goalSource).toBe('trainer_manual')
      expect(draft.subGoalIds).toEqual([])
      expect(draft.primaryGoalLabel).toBe('Fat loss')
    })

    it('takes the first value for a multi-goal selection and keeps the full label', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(),
        customFitnessGoals: '[{"label":"fat_loss","value":"fat_loss"},{"label":"muscle_gain","value":"muscle_gain"}]',
      })
      expect(draft.goalId).toBe('fat_loss')
      expect(draft.primaryGoalLabel).toBe('Fat loss, Muscle gain')
    })

    it('creates no structured goal for a plain-string (messy) goal but keeps the display label', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(),
        customFitnessGoals: 'just lose weight',
      })
      expect(draft.goalId).toBeNull()
      expect(draft.primaryGoalId).toBeNull()
      expect(draft.goalConfidence).toBe('unknown')
      expect(draft.goalSource).toBe('system_inferred')
      expect(draft.primaryGoalLabel).toBe('just lose weight')
    })

    it('does not fabricate a structured goal from a legacy object without a value field', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(),
        customFitnessGoals: '[{"goal_type":"fat_loss"}]',
      })
      expect(draft.goalId).toBeNull()             // no fabrication
      expect(draft.primaryGoalLabel).toBe('Fat loss') // formatGoal still gives a label
    })

    it('maps empty / absent goal to null label and no goalId', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
      })
      expect(draft.goalId).toBeNull()
      expect(draft.primaryGoalLabel).toBeNull()
    })
  })

  it('accepts a null userId', () => {
    const { draft } = buildClientCreateDraft({
      tenantId: 'tenant-a', userId: null, createdClient: makeClient(), customFitnessGoals: null,
    })
    expect(draft.createdByUserId).toBeNull()
  })

  describe('billingMode passthrough', () => {
    it('defaults to unset when billingMode is omitted', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
      })
      expect(draft.billingMode).toBe('unset')
    })

    it('defaults to unset when billingMode is null', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
        billingMode: null,
      })
      expect(draft.billingMode).toBe('unset')
    })

    it('passes through package billing mode', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
        billingMode: 'package',
      })
      expect(draft.billingMode).toBe('package')
    })

    it('passes through pay_per_session billing mode', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
        billingMode: 'pay_per_session',
      })
      expect(draft.billingMode).toBe('pay_per_session')
    })
  })

  describe('duplicate-override passthrough (Phase 6)', () => {
    it('passes possibleDuplicateClientId and duplicateOverrideReason when provided', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
        possibleDuplicateClientId: 'dup-local-id', duplicateOverrideReason: 'Different person',
      })
      expect(draft.possibleDuplicateClientId).toBe('dup-local-id')
      expect(draft.duplicateOverrideReason).toBe('Different person')
    })

    it('defaults both override fields to null when absent', () => {
      const { draft } = buildClientCreateDraft({
        tenantId: 'tenant-a', userId: 'user-1', createdClient: makeClient(), customFitnessGoals: null,
      })
      expect(draft.possibleDuplicateClientId).toBeNull()
      expect(draft.duplicateOverrideReason).toBeNull()
    })
  })
})
