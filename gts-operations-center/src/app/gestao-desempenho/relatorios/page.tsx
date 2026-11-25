import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { temPermissao } from '@/lib/permissions'
import { RelatoriosView } from '@/components/gestaoDesempenho/RelatoriosView'

export default async function RelatoriosGdPage() {
  const session = await auth()
  const role = (session?.user as any)?.role
  if (!temPermissao(role, 'gdVerRelatoriosIndividuais')) redirect('/403')
  return (
    <RelatoriosView
      usuarioNome={(session?.user as any)?.name || 'Usuário'}
      pode={{ gerar: temPermissao(role, 'gdGerarRelatorios'), fechar: temPermissao(role, 'gdFecharRelatorios'), revisar: temPermissao(role, 'gdRevisarRelatorios'), exportar: temPermissao(role, 'gdExportar'), observar: temPermissao(role, 'gdAdicionarObservacoes') }}
    />
  )
}
