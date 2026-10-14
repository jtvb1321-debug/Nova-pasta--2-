import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TecnicoShell } from '@/components/tecnico/TecnicoShell'
import { getPermissions } from '@/lib/permissions'
import { DiagnosticoConexaoView } from '@/components/diagnosticoConexao/DiagnosticoConexaoView'

export const metadata: Metadata = { title: 'Diagnóstico de Conexão' }

export default async function DiagnosticoConexaoPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role
  const p = getPermissions(role)
  if (!p.verDiagnosticoConexao && !p.diagnosticoPeloChamado) redirect('/403')
  // Tecnico abre pelo chamado (so o cliente do chamado da propria equipe), na moldura da area do tecnico.
  if (!p.verDiagnosticoConexao) {
    return (
      <TecnicoShell session={session} ativo="chamados">
        <DiagnosticoConexaoView podeBuscar={false} />
      </TecnicoShell>
    )
  }
  return (
    <AppShell variante="orbia" paginaAtual="Diagnóstico de Conexão">
      <DiagnosticoConexaoView podeBuscar />
    </AppShell>
  )
}
