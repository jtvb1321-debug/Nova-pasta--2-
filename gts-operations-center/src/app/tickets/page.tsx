// src/app/tickets/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TicketsView } from '@/components/tickets/TicketsView'

export const metadata: Metadata = { title: 'Chamados' }

export default async function TicketsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Chamados">
      <TicketsView />
    </AppShell>
  )
}
