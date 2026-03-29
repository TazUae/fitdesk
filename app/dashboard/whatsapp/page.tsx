import { getWhatsAppStatus } from '@/actions/whatsapp'
import { WhatsAppView } from '@/components/modules/WhatsAppView'

export default async function WhatsAppPage() {
  const result = await getWhatsAppStatus()
  const initial = result.success ? result.data : null

  return <WhatsAppView initial={initial} />
}
