import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { temPermissao } from '@/lib/permissions'
import { GdShell } from '@/components/gestaoDesempenho/GdShell'

export const metadata: Metadata = { title: 'Gestão de Desempenho' }

// Modulo restrito: so quem tem a permissao gdVerIndicadores (inicialmente ADMIN e GESTOR). As APIs repetem a checagem.
export default async function GestaoDesempenhoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (!temPermissao((session.user as any)?.role, 'gdVerIndicadores')) redirect('/403')
  return (
    <AppShell variante="orbia" paginaAtual="Gestão de Desempenho">
      <GdShell>{children}</GdShell>
    </AppShell>
  )
}
