// src/app/clientes/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { ClientesView } from '@/components/clientes/ClientesView'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell title="Clientes">
      <ClientesView />
    </AppShell>
  )
}