import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { AuditView } from '@/components/audit/AuditView'

export const metadata: Metadata = { title: 'Auditoria do Sistema' }

export default async function AuditPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/dashboard')
  return (
    <AppShell title="Auditoria do Sistema">
      <AuditView />
    </AppShell>
  )
}