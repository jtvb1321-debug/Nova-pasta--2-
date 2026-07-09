import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SettingsView } from '@/components/settings/SettingsView'

export const metadata: Metadata = { title: 'Configuracoes' }

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Configuracoes">
      <SettingsView session={session} />
    </AppShell>
  )
}