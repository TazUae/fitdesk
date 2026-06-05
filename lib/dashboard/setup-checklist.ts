import type { ChecklistItem } from '@/components/dashboard/SetupChecklist'

export interface ChecklistFacts {
  /** Provisioning is the gate the trainer just passed in onboarding. */
  workspaceReady:        boolean
  /** FitDesk Trainer Settings.initialized == 1. */
  availabilityConfirmed: boolean
  /** Trainer has at least one client in ERPNext. */
  hasFirstClient:        boolean
  /** Trainer has at least one session (any status). */
  hasFirstSession:       boolean
  /** Evolution API instance exists and is `'connected'`. */
  whatsappConnected:     boolean
  /**
   * The trainer has visited / acknowledged the payments setup card.
   * Cash is enabled by default so this never blocks the trainer — it's
   * just an informational tick that flips once they read the section.
   */
  paymentsAcknowledged:  boolean
}

/**
 * Build the dashboard setup checklist from server-derived facts.
 *
 * Pure function — exported for unit testing.
 *
 * Item ordering is intentional: it walks the trainer from "your workspace
 * is ready" toward the first money-making actions (add a client, book a
 * session) before optional setup (WhatsApp, payments).
 */
export function buildSetupChecklist(facts: ChecklistFacts): ChecklistItem[] {
  return [
    {
      id:          'workspace',
      label:       'Workspace ready',
      description: facts.workspaceReady
        ? 'Your FitDesk workspace is live.'
        : 'Finishing up — this can take a minute.',
      done:        facts.workspaceReady,
    },
    {
      id:          'availability',
      label:       'Availability confirmed',
      description: facts.availabilityConfirmed
        ? 'Your working days and hours are set.'
        : 'Tell us when you usually train clients.',
      done:        facts.availabilityConfirmed,
      href:        facts.availabilityConfirmed ? undefined : '/dashboard/settings',
    },
    {
      id:          'first-client',
      label:       'Add your first client',
      description: facts.hasFirstClient
        ? 'You have at least one client on file.'
        : 'Save the people you train.',
      done:        facts.hasFirstClient,
      href:        facts.hasFirstClient ? undefined : '/dashboard/clients/new',
    },
    {
      id:          'first-session',
      label:       'Book your first session',
      description: facts.hasFirstSession
        ? 'You have at least one session on the calendar.'
        : 'Schedule a session to lock in the time.',
      done:        facts.hasFirstSession,
      href:        facts.hasFirstSession ? undefined : '/dashboard/schedule',
    },
    {
      id:          'whatsapp',
      label:       'Connect WhatsApp',
      description: facts.whatsappConnected
        ? 'You can send invoices and reminders from FitDesk.'
        : 'Optional — link your number to message clients.',
      done:        facts.whatsappConnected,
      href:        facts.whatsappConnected ? undefined : '/dashboard/whatsapp',
    },
    {
      id:          'payments',
      label:       'Payment methods',
      description: facts.paymentsAcknowledged
        ? 'Cash and bank transfer are ready. OMT / Whish digital payments are coming soon.'
        : 'Cash and bank transfer are ready. OMT / Whish digital payments are coming soon.',
      done:        facts.paymentsAcknowledged,
      // No href — Cash/Bank Transfer require no trainer action.
      // Wire href back here when OMT/Whish onboarding flow is built.
    },
  ]
}
