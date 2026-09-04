import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardCombustivelView } from '@/components/vehicles/DashboardCombustivelView'

export const metadata: Metadata = { title: 'Dashboard de Combustivel' }

export default async function CombustivelPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/dashboard')
  return (
    <AppShell title="Dashboard de Combustivel">
      <DashboardCombustivelView />
    </AppShell>
  )
}