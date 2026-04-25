'use server'

import { addClient, fetchClients } from '@/actions/clients'
import { addInvoice, fetchInvoices, recordPayment as recordInvoicePayment } from '@/actions/invoices'
import { listFDSessionsAction } from '@/actions/schedulingActions'
import type { ActionResult, Client, Invoice, Payment } from '@/types'
import type { FDSession } from '@/types/scheduling'
import type { CreateClientPayload, CreateInvoicePayload } from '@/lib/erpnext/types'
import { editClient, fetchClientById } from '@/actions/clients'
import { fetchInvoiceById } from '@/actions/invoices'
import type { UpdateClientPayload } from '@/lib/erpnext/types'

export async function getClients(): Promise<ActionResult<Client[]>> {
  return fetchClients()
}

/**
 * Fetch FD Sessions for the authenticated trainer.
 * Optional `customer` narrows to one client; filtering is applied server-side
 * on the returned list (the underlying list action doesn't expose a per-call
 * client filter).
 */
export async function getSessions(opts: { customer?: string } = {}): Promise<ActionResult<FDSession[]>> {
  const result = await listFDSessionsAction()
  if (!result.success) return { success: false, error: result.message }
  const data = opts.customer
    ? result.data.filter(s => s.clientId === opts.customer)
    : result.data
  return { success: true, data }
}

export async function getInvoices(opts: {
  clientId?: string
  status?: string
} = {}): Promise<ActionResult<Invoice[]>> {
  return fetchInvoices(opts)
}

export async function getClientById(id: string): Promise<ActionResult<Client>> {
  return fetchClientById(id)
}

export async function updateClient(id: string, input: UpdateClientPayload): Promise<ActionResult<Client>> {
  return editClient(id, input)
}

export async function getInvoiceById(id: string): Promise<ActionResult<Invoice>> {
  return fetchInvoiceById(id)
}

export async function createClient(
  input: Omit<CreateClientPayload, 'trainer'>,
): Promise<ActionResult<Client>> {
  return addClient(input)
}

export async function createInvoice(input: CreateInvoicePayload): Promise<ActionResult<Invoice>> {
  return addInvoice(input)
}

export async function recordPayment(input: {
  invoiceId: string
  clientId: string
  amount: number
  modeOfPayment: string
  date: string
  reference?: string
  note?: string
}): Promise<ActionResult<Payment>> {
  return recordInvoicePayment(input)
}
