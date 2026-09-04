import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { MinhaComissaoView } from '@/components/sales/MinhaComissaoView'

export const metadata: Metadata = { title: 'Minha Comissao' }

export default async function MinhaComissaoPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <AppShell title="Minha Comissao">
      <MinhaComissaoView />
    </AppShell>
  )
}