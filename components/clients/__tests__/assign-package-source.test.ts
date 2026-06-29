/**
 * Source invariant tests for C5-B: Assign Package UI.
 *
 * No DOM rendering (RTL not installed — see GoalAccordion test comment).
 * Verifies that new UI components respect all critical import and content constraints.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const FORM_SRC    = readFileSync(join(__dirname, '../AssignPackageForm.tsx'),    'utf-8')
const SHEET_SRC   = readFileSync(join(__dirname, '../AssignPackageSheet.tsx'),   'utf-8')
const DETAILS_SRC = readFileSync(join(__dirname, '../PackageDetailsSheet.tsx'),  'utf-8')
const HUB_SRC     = readFileSync(join(__dirname, '../../modules/ClientHubPanel.tsx'), 'utf-8')

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

  it('calls assignPackage, listAssignablePackageTemplates, and getClientPackageSummary', () => {
    expect(FORM_SRC).toContain('assignPackage')
    expect(FORM_SRC).toContain('listAssignablePackageTemplates')
    expect(FORM_SRC).toContain('getClientPackageSummary')
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

  it('shows duplicate warning copy', () => {
    expect(FORM_SRC).toContain('This client already has this package active.')
  })

  it('includes explicit override checkbox label', () => {
    expect(FORM_SRC).toContain('I understand — assign another package')
  })

  it('passes allowDuplicateActivePackage to assignPackage', () => {
    expect(FORM_SRC).toContain('allowDuplicateActivePackage')
  })

  it('shows alternate confirm button label when override is confirmed', () => {
    expect(FORM_SRC).toContain('Assign another anyway')
  })

  it('does not contain delete, void, or cancel package wording', () => {
    expect(FORM_SRC).not.toMatch(/delete package|void package|cancel package|hard delete/i)
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

// ─── PackageDetailsSheet ─────────────────────────────────────────────────────

describe('PackageDetailsSheet — source invariants', () => {
  it("starts with 'use client' directive", () => {
    expect(DETAILS_SRC).toMatch(/^\s*['"]use client['"]\s*;?\s*$/m)
  })

  it('does not import from lib/erpnext/client', () => {
    expect(DETAILS_SRC).not.toContain('lib/erpnext/client')
  })

  it('does not import from business-data/erp-adapter', () => {
    expect(DETAILS_SRC).not.toContain('business-data/erp-adapter')
  })

  it('does not import invoice, session, whatsapp, or message actions', () => {
    expect(DETAILS_SRC).not.toMatch(
      /from ['"]@\/actions\/(invoices|sessions|whatsapp|messages)['"]/,
    )
  })

  it('calls voidClientPackagePurchase from @/actions/packages', () => {
    expect(DETAILS_SRC).toContain('voidClientPackagePurchase')
    expect(DETAILS_SRC).toContain("from '@/actions/packages'")
  })

  it('uses VOID_REASONS constant for structured reason choices', () => {
    expect(DETAILS_SRC).toContain('VOID_REASONS')
    expect(DETAILS_SRC).toContain('Duplicate package assigned by mistake')
    expect(DETAILS_SRC).toContain('Wrong package selected')
    expect(DETAILS_SRC).toContain('Client will not use this package')
    expect(DETAILS_SRC).toContain('Administrative correction')
    expect(DETAILS_SRC).toContain("'Other'")
  })

  it('requires a selected reason before void can be submitted — canSubmit gate', () => {
    expect(DETAILS_SRC).toContain('selectedReason')
    expect(DETAILS_SRC).toContain('canSubmit')
    expect(DETAILS_SRC).toContain('!canSubmit')
  })

  it('requires details text when Other is selected', () => {
    expect(DETAILS_SRC).toContain("selectedReason === 'Other'")
    expect(DETAILS_SRC).toContain('otherDetails.trim()')
  })

  it('derives final reason: predefined label or Other: <details>', () => {
    expect(DETAILS_SRC).toContain('derivedReason')
    expect(DETAILS_SRC).toContain('Other:')
  })

  it('shows void confirmation copy', () => {
    expect(DETAILS_SRC).toContain('Void package?')
    expect(DETAILS_SRC).toContain('without deleting the audit history')
  })

  it('shows reason field label and audit-log helper text', () => {
    expect(DETAILS_SRC).toContain('Reason for audit log')
    expect(DETAILS_SRC).toContain('reversal ledger entry')
  })

  it('renders shortId helper and Package ID label for identity safety', () => {
    expect(DETAILS_SRC).toContain('shortId')
    expect(DETAILS_SRC).toContain('Package ID:')
  })

  it('renders expiry date on the package card when available', () => {
    expect(DETAILS_SRC).toContain('expiresAtUtc')
    expect(DETAILS_SRC).toContain('Expires:')
  })

  it('renders order label (Newest / Older) for multiple packages', () => {
    expect(DETAILS_SRC).toContain('orderLabel')
    expect(DETAILS_SRC).toContain('Newest active package')
    expect(DETAILS_SRC).toContain('Older active package')
  })

  it('repeats package identity in the void confirmation panel', () => {
    // Name, sessions-reversed copy, activated, and Package ID appear inside the confirmation block
    expect(DETAILS_SRC).toContain('will be reversed')
    expect(DETAILS_SRC).toContain('this specific package assignment')
  })

  it('uses crypto.randomUUID for idempotency key — no server-supplied key', () => {
    expect(DETAILS_SRC).toContain('crypto.randomUUID()')
  })

  it('does not contain hard delete, ERP invoice creation, or payment wording', () => {
    expect(DETAILS_SRC).not.toMatch(/hard delete|createInvoice|submitSalesInvoice|Payment Entry|manual invoice/i)
  })

  it('does not reference session_consumed or C6 session deduction', () => {
    expect(DETAILS_SRC).not.toContain('session_consumed')
    expect(DETAILS_SRC).not.toMatch(/deduct session|session deduct/i)
  })

  it('does not call fetch directly', () => {
    expect(DETAILS_SRC).not.toMatch(/\bfetch\s*\(/)
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

  it('shows sessions available text for the active balance state', () => {
    // Component uses a JSX ternary for plural: session{...? 's' : ''} available
    // The literal 'session' and 'available' are present; contiguous 'sessions available'
    // is not a source literal due to the inline expression.
    expect(HUB_SRC).toContain('available')
    expect(HUB_SRC).toMatch(/session.*available/s)
  })

  it('shows Assign another package button label when package balance is present', () => {
    expect(HUB_SRC).toContain('Assign another package')
  })

  it('shows active packages count label', () => {
    expect(HUB_SRC).toContain('active package')
  })

  it('reads packageBalance from the overview prop — no direct ERP or payment data', () => {
    expect(HUB_SRC).toContain('overview.packageBalance')
    expect(HUB_SRC).not.toContain('erpInvoiceId')
    expect(HUB_SRC).not.toMatch(/payment total|priceAmount/i)
  })

  it('renders PackageDetailsSheet and imports it', () => {
    expect(HUB_SRC).toContain('PackageDetailsSheet')
    expect(HUB_SRC).toContain('detailsSheetOpen')
  })

  it('shows View details button when package balance is present', () => {
    expect(HUB_SRC).toContain('View details')
  })
})
