import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { temPermissao } from '@/lib/permissions'
import { InteligenciaOperacional } from '@/components/ia/InteligenciaOperacional'

export const metadata: Metadata = { title: 'Inteligência Operacional' }

export default async function InteligenciaOperacionalPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'usarAssistenteIA')) redirect('/403')
  return (
    <AppShell variante="orbia" paginaAtual="Inteligência Operacional">
      <InteligenciaOperacional />
    </AppShell>
  )
}
