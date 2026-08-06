// src/app/horas-extras/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { HorasExtrasView } from '@/components/ponto/HorasExtrasView'

export const metadata: Metadata = { title: 'Horas Extras' }

export default async function HorasExtrasPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) redirect('/dashboard')

  return (
    <AppShell title="Horas Extras">
      <HorasExtrasView session={session} />
    </AppShell>
  )
}