import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { temPermissao } from '@/lib/permissions'
import { VistoriaShell } from '@/components/frota/VistoriaShell'
import { RelatorioVistoria } from '@/components/frota/RelatorioVistoria'

export const metadata: Metadata = { title: 'Relatório de vistoria' }

// Relatorio de uma vistoria ja feita (so administrador): /frota/relatorio/{id}. Exige login.
export default async function RelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound()
  const session = await auth()
  if (!session) redirect('/login')
  if (!temPermissao((session.user as any)?.role, 'verFrota')) redirect('/403')
  return (
    <VistoriaShell voltarPara="/frota" rotuloVoltar="Frota" titulo="Relatório de vistoria">
      <RelatorioVistoria id={id} />
    </VistoriaShell>
  )
}
