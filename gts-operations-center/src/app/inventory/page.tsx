import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { CentralEstoque } from '@/components/inventory/CentralEstoque'

export const metadata: Metadata = { title: 'Central de Estoque' }

export default async function InventoryPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Central de Estoque">
      <CentralEstoque session={session} />
    </AppShell>
  )
}