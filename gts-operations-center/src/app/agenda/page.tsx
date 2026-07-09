import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { CentralChamados } from '@/components/agenda/CentralChamados'

export const metadata: Metadata = { title: 'Central de Chamados' }

export default async function AgendaPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Central de Chamados">
      <CentralChamados />
    </AppShell>
  )
}