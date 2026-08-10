import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { DiagnosticoHistoricoView } from '@/components/diagnostico/DiagnosticoHistoricoView'

export const metadata: Metadata = { title: 'Diagnostico Tecnico' }

export default async function DiagnosticoPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Diagnostico Tecnico">
      <DiagnosticoHistoricoView />
    </AppShell>
  )
}
