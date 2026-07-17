/**
 * Source-invariant tests for UserMenuSheet (pre-pilot overlay coordination fix).
 *
 * No DOM rendering — this codebase has no @testing-library/react or jsdom
 * dependency installed (see components/clients/GoalAccordion/tests/GoalAccordion.test.tsx),
 * and this fix must not add dependencies. These tests instead assert on the
 * component's source text to pin the specific properties this fix relies on:
 * delegating to the shared WorkspaceShell primitive (desktop drawer / mobile
 * sheet), no duplicated hand-rolled overlay markup, and that nav items still
 * close the menu when selected.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(join(__dirname, 'UserMenuSheet.tsx'), 'utf-8')

describe('UserMenuSheet — delegates to WorkspaceShell for desktop/mobile treatment', () => {
  it('imports the shared WorkspaceShell primitive', () => {
    expect(SRC).toContain("from '@/components/ui/WorkspaceShell'")
  })

  it('renders via WorkspaceShell rather than a bespoke <div role="dialog">', () => {
    expect(SRC).toContain('<WorkspaceShell')
    expect(SRC).not.toContain('role="dialog"')
  })

  it('does not hand-roll its own fixed backdrop — desktop no longer gets the old mobile-only markup', () => {
    expect(SRC).not.toContain('fixed inset-0 z-40')
  })

  it('does not hand-roll its own fixed bottom sheet container', () => {
    expect(SRC).not.toContain('fixed bottom-0 left-1/2 z-50')
  })

  it('does not duplicate WorkspaceShell\'s own body-scroll-lock effect', () => {
    expect(SRC).not.toContain("document.body.style.overflow")
  })

  it('does not duplicate WorkspaceShell\'s own Escape-key listener', () => {
    expect(SRC).not.toContain("e.key !== 'Escape'")
    expect(SRC).not.toContain("e.key === 'Escape'")
  })

  it('passes an accessible label to WorkspaceShell', () => {
    expect(SRC).toContain('label="Account menu"')
  })
})

describe('UserMenuSheet — closes when a nav item is selected', () => {
  it('every nav Link still calls onClick={onClose}', () => {
    const linkBlocks = SRC.split('<Link').slice(1)
    expect(linkBlocks.length).toBeGreaterThanOrEqual(4)
    for (const block of linkBlocks) {
      expect(block.slice(0, 200)).toContain('onClick={onClose}')
    }
  })

  it('the close (X) button still calls onClose', () => {
    expect(SRC).toContain('aria-label="Close menu"')
  })
})

describe('UserMenuSheet — sign-out confirmation state is preserved', () => {
  it('still resets confirmingSignOut when the sheet closes', () => {
    expect(SRC).toContain('if (!open) setConfirmingSignOut(false)')
  })

  it('still focuses the cancel button when entering the confirm step', () => {
    expect(SRC).toContain('cancelBtnRef.current?.focus()')
  })
})

describe('UserMenuSheet — unrelated overlays are not touched', () => {
  it('does not import or render any other sheet/drawer component', () => {
    for (const name of [
      'StatementSheet', 'AssignPackageSheet', 'PackageDetailsSheet',
      'BookingSheet', 'SessionCompletionSheet', 'InvoicesView', 'AddClientSheet',
    ]) {
      expect(SRC).not.toContain(`<${name}`)
      expect(SRC).not.toMatch(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`))
    }
  })
})
