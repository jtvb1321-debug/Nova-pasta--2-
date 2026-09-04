import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SmartOLTView } from '@/components/smartolt/SmartOLTView'

export const metadata: Metadata = { title: 'SmartOLT' }

export default async function SmartOLTPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as any)?.role
  const podeAprovar = ['ADMIN', 'OPERADOR'].includes(role)

  return (
    <AppShell title="SmartOLT - Monitoramento de Rede">
      <SmartOLTView podeAprovar={podeAprovar} />
    </AppShell>
  )
}