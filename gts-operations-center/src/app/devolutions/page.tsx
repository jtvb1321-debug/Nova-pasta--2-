import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { DevolutionsView } from '@/components/inventory/DevolutionsView'

export const metadata: Metadata = { title: 'Aprovacao de Devolucoes' }

export default async function DevolutionsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/dashboard')
  return (
    <AppShell title="Aprovacao de Devolucoes">
      <DevolutionsView />
    </AppShell>
  )
}