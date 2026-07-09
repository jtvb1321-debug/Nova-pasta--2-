import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { ProductivityView } from '@/components/noc/ProductivityView'

export const metadata: Metadata = { title: 'Produtividade' }

export default async function ProductivityPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Produtividade das Equipes">
      <ProductivityView />
    </AppShell>
  )
}