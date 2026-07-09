// src/app/vehicles/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { VehiclesView } from '@/components/vehicles/VehiclesView'

export const metadata: Metadata = { title: 'Veículos' }

export default async function VehiclesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Monitoramento de Veículos">
      <VehiclesView />
    </AppShell>
  )
}
