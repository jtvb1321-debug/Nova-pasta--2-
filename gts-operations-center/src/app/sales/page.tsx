import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SalesView } from '@/components/sales/SalesView'

export const metadata: Metadata = { title: 'Vendas' }

export default async function SalesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell variante="orbia" paginaAtual="Vendas">
      <SalesView />
    </AppShell>
  )
}