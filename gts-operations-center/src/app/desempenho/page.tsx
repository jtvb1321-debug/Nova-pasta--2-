import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { temPermissao } from '@/lib/permissions'
import { DesempenhoView } from '@/components/desempenho/DesempenhoView'

export const metadata: Metadata = { title: 'Desempenho das Equipes' }

export default async function DesempenhoPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (!temPermissao((session.user as any)?.role, 'verDesempenho')) redirect('/403')
  return (
    <AppShell title="Desempenho das Equipes">
      <DesempenhoView podeAnalisarAvaliacoes={temPermissao((session.user as any)?.role, 'analisarAvaliacoes')} />
    </AppShell>
  )
}
