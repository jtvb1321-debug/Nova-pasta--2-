// src/app/reports/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { ReportsView } from '@/components/reports/ReportsView'

export const metadata: Metadata = { title: 'Relatórios' }

export default async function ReportsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Relatórios">
      <ReportsView />
    </AppShell>
  )
}
