'use server'

import { addClient, fetchClients } from '@/actions/clients'
import { addInvoice, fetchInvoices, recordPayment as recordInvoicePayment } from '@/actions/invoices'
import { bookSession as createSessionBooking, fetchSessions } from '@/actions/sessions'
import type { ActionResult, Client, Invoice, RecordPaymentResult, Session } from '@/types'
import type { CreateClientPayload, CreateInvoicePayload } from '@/lib/erpnext/types'
import type { PaymentMethod } from '@/lib/payments/methods'
import type { PaymentActionResult } from '@/lib/payments/errors'
import type { BookSessionInput } from '@/actions/sessions'
import { editClient, fetchClientById } from '@/actions/clients'
import { fetchInvoiceById } from '@/actions/invoices'
import type { UpdateClientPayload } from '@/lib/erpnext/types'
import type { SessionFilter } from '@/actions/sessions'

export async function getClients(): Promise<ActionResult<Client[]>> {
  return fetchClients()
}

export async function getSessions(opts: {
  clientId?: string
  filter?: SessionFilter
} = {}): Promise<ActionResult<Session[]>> {
  return fetchSessions(opts)
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

export async function bookSession(input: BookSessionInput): Promise<ActionResult<Session>> {
  return createSessionBooking(input)
}

export async function createInvoice(input: CreateInvoicePayload): Promise<ActionResult<Invoice>> {
  return addInvoice(input)
}

export async function recordPayment(input: {
  invoiceId:  string
  clientId:   string
  amount:     number
  /** Internal payment method — never a raw ERPNext mode string. */
  method:     PaymentMethod
  date:       string
  reference?: string
  note?:      string
}): Promise<PaymentActionResult<RecordPaymentResult>> {
  return recordInvoicePayment(input)
}
