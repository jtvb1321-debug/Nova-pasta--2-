import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PainelTecnico } from '@/components/tecnico/PainelTecnico'

export const metadata: Metadata = { title: 'Meus Chamados' }

export default async function MeusChamadosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <PainelTecnico session={session} />
}