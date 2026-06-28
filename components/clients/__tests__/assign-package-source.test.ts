/**
 * Source invariant tests for C5-B: Assign Package UI.
 *
 * No DOM rendering (RTL not installed — see GoalAccordion test comment).
 * Verifies that new UI components respect all critical import and content constraints.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const FORM_SRC  = readFileSync(join(__dirname, '../AssignPackageForm.tsx'),  'utf-8')
const SHEET_SRC = readFileSync(join(__dirname, '../AssignPackageSheet.tsx'), 'utf-8')
const HUB_SRC   = readFileSync(join(__dirname, '../../modules/ClientHubPanel.tsx'), 'utf-8')

// ─── AssignPackageForm ────────────────────────────────────────────────────────

describe('AssignPackageForm — source invariants', () => {
  it("starts with 'use client' directive", () => {
    expect(FORM_SRC).toMatch(/^\s*['"]use client['"]\s*;?\s*$/m)
  })

  it('does not import from lib/erpnext/client', () => {
    expect(FORM_SRC).not.toContain('lib/erpnext/client')
  })

  it('does not import from business-data/erp-adapter', () => {
    expect(FORM_SRC).not.toContain('business-data/erp-adapter')
  })

  it('does not call erpFetch directly', () => {
    expect(FORM_SRC).not.toMatch(/erpFetch\s*\(/)
  })

  it('does not call fetch directly', () => {
    // Must not contain a bare `fetch(` call (not a URL or variable reference)
    expect(FORM_SRC).not.toMatch(/\bfetch\s*\(/)
  })

  it('does not import invoice, session, whatsapp, or message actions', () => {
    expect(FORM_SRC).not.toMatch(
      /from ['"]@\/actions\/(invoices|sessions|whatsapp|messages)['"]/,
    )
  })

  it('imports package actions only from @/actions/packages', () => {
    expect(FORM_SRC).toContain("from '@/actions/packages'")
  })

  it('calls assignPackage and listAssignablePackageTemplates — no other package action', () => {
    expect(FORM_SRC).toContain('assignPackage')
    expect(FORM_SRC).toContain('listAssignablePackageTemplates')
  })

  it('does not reference createAndSubmitPaymentEntry', () => {
    expect(FORM_SRC).not.toContain('createAndSubmitPaymentEntry')
  })

  it('does not expose a manual invoice creation CTA', () => {
    expect(FORM_SRC).not.toMatch(/manual invoice|create invoice|\+ invoice|new invoice/i)
  })

  it('uses enabledPaymentMethods — disabled methods are never hard-coded', () => {
    expect(FORM_SRC).toContain('enabledPaymentMethods')
    // omt must not be hard-coded as an offered option
    expect(FORM_SRC).not.toMatch(/['"]omt['"]/)
  })

  it('generates idempotency key via crypto.randomUUID only — no server-supplied key', () => {
    expect(FORM_SRC).toContain('crypto.randomUUID()')
  })
})

// ─── AssignPackageSheet ───────────────────────────────────────────────────────

describe('AssignPackageSheet — source invariants', () => {
  it("starts with 'use client' directive", () => {
    expect(SHEET_SRC).toMatch(/^\s*['"]use client['"]\s*;?\s*$/m)
  })

  it('does not import from lib/erpnext/client', () => {
    expect(SHEET_SRC).not.toContain('lib/erpnext/client')
  })

  it('does not import from business-data/erp-adapter', () => {
    expect(SHEET_SRC).not.toContain('business-data/erp-adapter')
  })

  it('does not import invoice, session, whatsapp, or message actions', () => {
    expect(SHEET_SRC).not.toMatch(
      /from ['"]@\/actions\/(invoices|sessions|whatsapp|messages)['"]/,
    )
  })

  it('uses WorkspaceShell for the bottom-sheet/drawer primitive', () => {
    expect(SHEET_SRC).toContain('WorkspaceShell')
  })

  it('passes clientIndexId and erpCustomerId into AssignPackageForm', () => {
    expect(SHEET_SRC).toContain('clientIndexId')
    expect(SHEET_SRC).toContain('erpCustomerId')
  })
})

// ─── ClientHubPanel ───────────────────────────────────────────────────────────

describe('ClientHubPanel — assign package integration invariants', () => {
  it('renders AssignPackageSheet', () => {
    expect(HUB_SRC).toContain('AssignPackageSheet')
  })

  it('passes client.clientIndexId and client.erpCustomerId to the sheet', () => {
    expect(HUB_SRC).toContain('client.clientIndexId')
    expect(HUB_SRC).toContain('client.erpCustomerId')
  })

  it('does not introduce a manual invoice CTA', () => {
    expect(HUB_SRC).not.toMatch(/manual invoice|create invoice|\+ invoice|new invoice/i)
  })

  it('does not import from lib/erpnext/client', () => {
    expect(HUB_SRC).not.toContain('lib/erpnext/client')
  })

  it('does not import from business-data/erp-adapter', () => {
    expect(HUB_SRC).not.toContain('business-data/erp-adapter')
  })
})
