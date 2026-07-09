import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NOCView } from '@/components/noc/NOCView'

export const metadata: Metadata = { title: 'Monitoramento NOC' }

export default async function NOCPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Monitoramento NOC">
      <NOCView />
    </AppShell>
  )
}