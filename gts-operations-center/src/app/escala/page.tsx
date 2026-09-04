// src/app/escala/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { EscalaAdminView } from '@/components/escala/EscalaAdminView'
import { EscalaTecnicoView } from '@/components/escala/EscalaTecnicoView'

export const metadata: Metadata = { title: 'Escala de Trabalho' }

export default async function EscalaPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as any)?.role

  if (role === 'TECNICO') {
    return <EscalaTecnicoView />
  }

  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/dashboard')

  return (
    <AppShell title="Escala de Trabalho">
      <EscalaAdminView />
    </AppShell>
  )
}