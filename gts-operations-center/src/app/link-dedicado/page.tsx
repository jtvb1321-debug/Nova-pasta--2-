import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { LinkDedicadoView } from '@/components/link-dedicado/LinkDedicadoView'

export const metadata: Metadata = { title: 'Clientes dedicados' }

export default async function LinkDedicadoPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell variante="orbia" paginaAtual="Clientes dedicados">
      <LinkDedicadoView />
    </AppShell>
  )
}
