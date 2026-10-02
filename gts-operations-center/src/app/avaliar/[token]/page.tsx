import type { Metadata } from 'next'
import { AvaliacaoCliente } from '@/components/avaliacao/AvaliacaoCliente'

export const metadata: Metadata = {
  title: 'Avalie seu atendimento',
  robots: { index: false, follow: false },
}

export default async function AvaliarPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ origem?: string }>
}) {
  const { token } = await params
  const { origem } = await searchParams
  return <AvaliacaoCliente token={token} origem={origem === 'whatsapp' ? 'whatsapp' : 'qr'} />
}
