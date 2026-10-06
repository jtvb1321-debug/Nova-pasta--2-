// src/app/solicitacoes/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SolicitacoesEquipeView } from '@/components/solicitacoes/SolicitacoesEquipeView'

export const metadata: Metadata = { title: 'Solicitações de equipe' }

export default async function SolicitacoesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/dashboard')

  return (
    <AppShell variante="orbia" paginaAtual="Solicitações de equipe">
      <SolicitacoesEquipeView />
    </AppShell>
  )
}