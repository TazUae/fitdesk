import { notFound }       from 'next/navigation'
import { getClientById } from '@/lib/business-data'
import { getMessages }     from '@/actions/messages'
import { MessagesView }    from '@/components/modules/MessagesView'

interface Props {
  params:      { clientId: string }
  searchParams: { type?: string; invoiceId?: string }
}

export default async function MessagesPage({ params, searchParams }: Props) {
  const [clientResult, messagesResult] = await Promise.all([
    getClientById(params.clientId),
    getMessages(params.clientId),
  ])

  if (!clientResult.success) notFound()

  return (
    <MessagesView
      client={clientResult.data}
      messages={messagesResult.success ? messagesResult.data : []}
      initialType={searchParams.type}
      invoiceId={searchParams.invoiceId}
    />
  )
}
