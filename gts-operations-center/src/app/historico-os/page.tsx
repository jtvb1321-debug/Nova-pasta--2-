import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HistoricoOSView } from '@/components/tecnico/HistoricoOSView'

export const metadata: Metadata = { title: 'Histórico de O.S.' }

export default async function HistoricoOSPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <HistoricoOSView session={session} />
}
