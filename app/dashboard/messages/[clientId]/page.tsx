import { notFound }       from 'next/navigation'
import Link               from 'next/link'
import { ArrowLeft }      from 'lucide-react'
import { getClientById } from '@/lib/business-data'
import { getMessages }     from '@/actions/messages'
import { MessagesView }    from '@/features/messaging/components/MessagesView'
import { isErpUnavailableError } from '@/lib/errors/is-unavailable-error'

interface Props {
  params:      { clientId: string }
  searchParams: { type?: string; invoiceId?: string }
}

export default async function MessagesPage({ params, searchParams }: Props) {
  const [clientResult, messagesResult] = await Promise.all([
    getClientById(params.clientId),
    getMessages(params.clientId),
  ])

  if (!clientResult.success) {
    if (isErpUnavailableError(clientResult.error)) {
      return (
        <div className="space-y-5 p-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/clients" style={{ color: 'var(--fd-muted)' }}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
          <div
            className="rounded-2xl border p-6 text-center"
            style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--fd-muted)' }}>
              Workspace data is still connecting
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
              Client details will appear once your workspace data connection is ready.
            </p>
            <Link
              href="/dashboard/clients"
              className="mt-4 inline-block text-sm font-semibold"
              style={{ color: 'var(--fd-accent)' }}
            >
              ← Back to clients
            </Link>
          </div>
        </div>
      )
    }
    notFound()
  }

  return (
    <MessagesView
      client={clientResult.data}
      messages={messagesResult.success ? messagesResult.data : []}
      initialType={searchParams.type}
      invoiceId={searchParams.invoiceId}
    />
  )
}
