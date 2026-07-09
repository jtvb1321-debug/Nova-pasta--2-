// src/app/movements/page.tsx
import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { MovementsView } from '@/components/inventory/MovementsView'

export const metadata: Metadata = { title: 'Movimentações' }

export default async function MovementsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Movimentações de Estoque">
      <MovementsView />
    </AppShell>
  )
}
