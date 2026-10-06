import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { CentralEstoque } from '@/components/inventory/CentralEstoque'

export const metadata: Metadata = { title: 'Estoque e movimentações' }

export default async function InventoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell variante="orbia" paginaAtual="Estoque e movimentações">
      <CentralEstoque session={session} />
    </AppShell>
  )
}