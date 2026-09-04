import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { LinkDedicadoView } from '@/components/link-dedicado/LinkDedicadoView'

export const metadata: Metadata = { title: 'Clientes Dedicados' }

export default async function LinkDedicadoPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell title="Monitoramento de Clientes Dedicados">
      <LinkDedicadoView />
    </AppShell>
  )
}
