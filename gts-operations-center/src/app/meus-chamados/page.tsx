import type { Metadata, Viewport } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PainelTecnico } from '@/components/tecnico/PainelTecnico'

export const metadata: Metadata = { title: 'Meus Chamados' }
// viewport-fit=cover: a barra inferior respeita a area segura do celular.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function MeusChamadosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <PainelTecnico session={session} />
}