/**
 * Pure unit tests for mapClientIndexToClient.
 *
 * The most important guarantee: Client.id MUST equal erpCustomerId (the ERP
 * Customer docname), never the local client_index UUID — the directory detail
 * link and all ERP-backed flows depend on it.
 */

import { describe, expect, it } from 'vitest'
import { mapClientIndexToClient } from '@/lib/clients/directory-map'
import type { ClientIndex } from '@/types/clients'

function makeRow(overrides: Partial<ClientIndex> = {}): ClientIndex {
  return {
    id:                        'local-uuid-1',
    tenantId:                  'tenant-a',
    erpCustomerId:             'CUST-001',
    fullName:                  'Ali Hassan',
    phoneE164:                 '+96170555999',
    whatsappEnabled:           false,
    whatsappConsentState:      'unknown',
    status:                    'active',
    primaryGoalLabel:          'Weight loss',
    primaryGoalId:             null,
    safetyState:               'clear',
    onboardingState:           'not_started',
    billingMode:               'unset',
    paymentSummary:            'unset',
    nextSessionAtUtc:          null,
    lastActivityAtUtc:         null,
    possibleDuplicateClientId: null,
    duplicateOverrideReason:   null,
    createdAtUtc:              '2026-01-01T00:00:00.000Z',
    updatedAtUtc:              '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('mapClientIndexToClient', () => {
  it('uses erpCustomerId as Client.id (not the local row id)', () => {
    const client = mapClientIndexToClient(makeRow())
    expect(client.id).toBe('CUST-001')
    expect(client.id).not.toBe('local-uuid-1')
  })

  describe('status mapping', () => {
    it('maps active → active', () => {
      expect(mapClientIndexToClient(makeRow({ status: 'active' })).status).toBe('active')
    })
    it('maps inactive → inactive', () => {
      expect(mapClientIndexToClient(makeRow({ status: 'inactive' })).status).toBe('inactive')
    })
    it('maps archived → inactive', () => {
      expect(mapClientIndexToClient(makeRow({ status: 'archived' })).status).toBe('inactive')
    })
  })

  describe('full name splitting', () => {
    it('splits a two-part name into first and last', () => {
      const client = mapClientIndexToClient(makeRow({ fullName: 'Ali Hassan' }))
      expect(client.firstName).toBe('Ali')
      expect(client.lastName).toBe('Hassan')
      expect(client.name).toBe('Ali Hassan')
    })
    it('keeps a single-word name as firstName with no lastName', () => {
      const client = mapClientIndexToClient(makeRow({ fullName: 'Cher' }))
      expect(client.firstName).toBe('Cher')
      expect(client.lastName).toBeUndefined()
    })
    it('splits a three-part name on the last space', () => {
      const client = mapClientIndexToClient(makeRow({ fullName: 'Maria De Luca' }))
      expect(client.firstName).toBe('Maria De')
      expect(client.lastName).toBe('Luca')
    })
  })

  describe('goal mapping', () => {
    it('maps a non-null primaryGoalLabel to goal', () => {
      expect(mapClientIndexToClient(makeRow({ primaryGoalLabel: 'Build muscle' })).goal).toBe('Build muscle')
    })
    it('maps a null primaryGoalLabel to undefined', () => {
      expect(mapClientIndexToClient(makeRow({ primaryGoalLabel: null })).goal).toBeUndefined()
    })
  })

  it('maps the remaining fields and keeps directory placeholders empty/zero', () => {
    const client = mapClientIndexToClient(makeRow())
    expect(client.phone).toBe('+96170555999')
    expect(client.email).toBeUndefined()
    expect(client.notes).toBeUndefined()
    expect(client.sessionCount).toBe(0)
    expect(client.trainerId).toBe('')
    expect(client.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
