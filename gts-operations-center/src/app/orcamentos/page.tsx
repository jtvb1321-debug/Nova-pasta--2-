import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { temPermissao } from '@/lib/permissions'
import { OrcamentosView } from '@/components/orcamentos/OrcamentosView'

export const metadata: Metadata = { title: 'Orçamentos' }

export default async function OrcamentosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verOrcamentos')) redirect('/403')
  return (
    <AppShell variante="orbia" paginaAtual="Orçamentos">
      <OrcamentosView nomeUsuario={session.user?.name ?? 'Usuário'} />
    </AppShell>
  )
}
