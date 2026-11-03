import type { Metadata, Viewport } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HistoricoOSView } from '@/components/tecnico/HistoricoOSView'

export const metadata: Metadata = { title: 'Histórico de O.S.' }
// viewport-fit=cover: a barra inferior respeita a area segura do celular.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function HistoricoOSPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <HistoricoOSView session={session} />
}
