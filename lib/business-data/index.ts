'use server'

import { addClient, fetchClients } from '@/actions/clients'
import { addInvoice, fetchInvoices, recordPayment as recordInvoicePayment } from '@/actions/invoices'
import { bookSession as createSessionBooking, fetchSessions } from '@/actions/sessions'
import type { ActionResult, Client, Invoice, Payment, Session } from '@/types'
import type { CreateClientPayload, CreateInvoicePayload } from '@/lib/erpnext/types'
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

export async function getDashboardMetrics() {
  const [clientsResult, sessionsResult, invoicesResult] = await Promise.all([
    getClients(),
    getSessions(),
    getInvoices(),
  ])

  const clients = clientsResult.success ? clientsResult.data : []
  const sessions = sessionsResult.success ? sessionsResult.data : []
  const invoices = invoicesResult.success ? invoicesResult.data : []

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'

  return {
    activeClients: clients.filter((c) => c.status === 'active').length,
    totalClients: clients.length,
    sessionsThisMonth: sessions.filter((s) => s.status === 'completed' && s.date >= monthStart).length,
    overdueInvoices: invoices.filter((i) => i.status === 'overdue').length,
    outstandingBalance: invoices
      .filter((i) => i.status === 'overdue' || i.status === 'sent')
      .reduce((sum, i) => sum + i.outstandingAmount, 0),
    monthlyRevenue: invoices
      .filter((i) => i.status === 'paid' && i.issuedAt >= monthStart)
      .reduce((sum, i) => sum + i.amount, 0),
    currency: invoices.find((i) => i.currency)?.currency ?? 'USD',
  }
}
