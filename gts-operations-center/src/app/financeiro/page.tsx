import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { FinanceiroView } from '@/components/financeiro/FinanceiroView'

export const metadata: Metadata = { title: 'Financeiro' }

export default async function FinanceiroPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Dashboard Financeiro">
      <FinanceiroView session={session} />
    </AppShell>
  )
}