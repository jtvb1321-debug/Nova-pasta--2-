import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { RelatorioVendasView } from '@/components/sales/RelatorioVendasView'

export const metadata: Metadata = { title: 'Relatorio de Vendas' }

export default async function RelatorioVendasPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/sales')
  return (
    <AppShell title="Relatorio de Vendas por Vendedor">
      <RelatorioVendasView />
    </AppShell>
  )
}