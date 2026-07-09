import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { CentralMonitoramento } from '@/components/map/CentralMonitoramento'

export const metadata: Metadata = { title: 'Central de Monitoramento' }

export default async function MapPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Central de Monitoramento">
      <CentralMonitoramento />
    </AppShell>
  )
}