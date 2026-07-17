/**
 * Source-invariant tests for DashboardClientShell (pre-pilot overlay coordination fix).
 *
 * No DOM rendering — see UserMenuSheet.test.ts for why (no @testing-library/react
 * or jsdom dependency in this repo, and this fix must not add dependencies).
 * These tests pin the specific property this fix relies on: the account menu's
 * open state is closed whenever the route (pathname) changes, and that this
 * fix does not reach into any other overlay component.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(join(__dirname, 'DashboardClientShell.tsx'), 'utf-8')

describe('DashboardClientShell — closes the account menu on route change', () => {
  it('imports useEffect', () => {
    expect(SRC).toContain("import { useEffect, useState } from 'react'")
  })

  it('has an effect that closes the menu, depending only on pathname', () => {
    const effectMatch = SRC.match(/useEffect\(\(\) => \{\s*setMenuOpen\(false\)\s*\}, \[pathname\]\)/)
    expect(effectMatch).not.toBeNull()
  })

  it('the close-on-route-change effect is declared before the early-return for full-width routes', () => {
    const effectIndex = SRC.indexOf('setMenuOpen(false)')
    const earlyReturnIndex = SRC.indexOf('if (isFullWidthRoute)')
    expect(effectIndex).toBeGreaterThan(-1)
    expect(earlyReturnIndex).toBeGreaterThan(-1)
    expect(effectIndex).toBeLessThan(earlyReturnIndex)
  })
})

describe('DashboardClientShell — still renders UserMenuSheet on both layout branches', () => {
  it('imports UserMenuSheet', () => {
    expect(SRC).toContain("import { UserMenuSheet } from '@/components/modules/UserMenuSheet'")
  })

  it('renders <UserMenuSheet twice — once for the full-width branch, once for the shell chrome branch', () => {
    const occurrences = SRC.split('<UserMenuSheet').length - 1
    expect(occurrences).toBe(2)
  })
})

describe('DashboardClientShell — fix is scoped to the account menu only', () => {
  it('does not import or render any other sheet/drawer/overlay component', () => {
    // Checks actual import/JSX usage, not bare-word occurrences — this file's own
    // explanatory comment on the pathname effect legitimately names
    // ClientWorkspaceOverlay's "Open full profile" CTA as a motivating example.
    for (const name of [
      'StatementSheet', 'AssignPackageSheet', 'PackageDetailsSheet',
      'BookingSheet', 'SessionCompletionSheet', 'InvoicesView', 'AddClientSheet',
      'ClientWorkspaceOverlay',
    ]) {
      expect(SRC).not.toContain(`<${name}`)
      expect(SRC).not.toMatch(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`))
    }
  })
})
