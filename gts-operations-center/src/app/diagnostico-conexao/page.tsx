import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { temPermissao } from '@/lib/permissions'
import { DiagnosticoConexaoView } from '@/components/diagnosticoConexao/DiagnosticoConexaoView'

export const metadata: Metadata = { title: 'Diagnóstico de Conexão' }

export default async function DiagnosticoConexaoPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verDiagnosticoConexao')) redirect('/403')
  return (
    <AppShell variante="orbia" paginaAtual="Diagnóstico de Conexão">
      <DiagnosticoConexaoView />
    </AppShell>
  )
}
