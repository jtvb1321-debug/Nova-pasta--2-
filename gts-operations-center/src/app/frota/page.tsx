import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { temPermissao } from '@/lib/permissions'
import { FrotaView } from '@/components/frota/FrotaView'

export const metadata: Metadata = { title: 'Frota' }

export default async function FrotaPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verFrota')) redirect('/403')
  const view = <FrotaView podeAdministrar={temPermissao(role, 'administrarFrota')} />
  return <AppShell variante="orbia" paginaAtual="Frota">{view}</AppShell>
}
