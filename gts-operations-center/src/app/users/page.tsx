import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { UsersView } from '@/components/users/UsersView'

export const metadata: Metadata = { title: 'Gestao de Usuarios' }

export default async function UsersPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (role !== 'ADMIN') redirect('/dashboard')
  return (
    <AppShell title="Gestao de Usuarios">
      <UsersView />
    </AppShell>
  )
}