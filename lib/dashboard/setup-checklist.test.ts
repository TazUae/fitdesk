import { describe, expect, it } from 'vitest'
import { buildSetupChecklist, type ChecklistFacts } from './setup-checklist'

const ZERO_FACTS: ChecklistFacts = {
  workspaceReady:        false,
  availabilityConfirmed: false,
  hasFirstClient:        false,
  hasFirstSession:       false,
  whatsappConnected:     false,
  paymentsAcknowledged:  false,
}

describe('buildSetupChecklist', () => {
  it('emits exactly the six required items in fixed order', () => {
    const ids = buildSetupChecklist(ZERO_FACTS).map(i => i.id)
    expect(ids).toEqual([
      'workspace',
      'availability',
      'first-client',
      'first-session',
      'whatsapp',
      'payments',
    ])
  })

  it('marks workspace + availability done when facts say so', () => {
    const items = buildSetupChecklist({
      ...ZERO_FACTS,
      workspaceReady:        true,
      availabilityConfirmed: true,
    })
    expect(items.find(i => i.id === 'workspace')?.done).toBe(true)
    expect(items.find(i => i.id === 'availability')?.done).toBe(true)
    // Other items should still be open.
    expect(items.find(i => i.id === 'first-client')?.done).toBe(false)
  })

  it('hides the action link once an item is done', () => {
    const items = buildSetupChecklist({ ...ZERO_FACTS, hasFirstClient: true })
    expect(items.find(i => i.id === 'first-client')?.href).toBeUndefined()
    // A still-pending item retains its href.
    expect(items.find(i => i.id === 'first-session')?.href).toBeDefined()
  })

  it('uses the Cash-default copy on the payments item', () => {
    const payments = buildSetupChecklist(ZERO_FACTS).find(i => i.id === 'payments')!
    expect(payments.description).toMatch(/Cash is enabled by default/i)
  })

  it('whatsapp item is optional but linkable when disconnected', () => {
    const whatsapp = buildSetupChecklist(ZERO_FACTS).find(i => i.id === 'whatsapp')!
    expect(whatsapp.done).toBe(false)
    expect(whatsapp.href).toBe('/dashboard/whatsapp')
  })
})
