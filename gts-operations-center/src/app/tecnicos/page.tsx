import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TecnicosView } from '@/components/tecnicos/TecnicosView'

export const metadata: Metadata = { title: 'Tecnicos' }

export default async function TecnicosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Tecnicos">
      <TecnicosView />
    </AppShell>
  )
}
