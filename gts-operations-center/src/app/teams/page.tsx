// src/app/teams/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TeamsView } from '@/components/teams/TeamsView'

export const metadata: Metadata = { title: 'Equipes' }

export default async function TeamsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Equipes">
      <TeamsView session={session} />
    </AppShell>
  )
}
