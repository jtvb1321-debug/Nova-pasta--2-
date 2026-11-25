import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { UnidadesView } from '@/components/gestaoDesempenho/UnidadesView'

export default async function RecepcaoPage() {
  const role = ((await auth())?.user as any)?.role
  return <UnidadesView tipo="RECEPCAO_INDIVIDUAL" pode={{ observar: temPermissao(role, 'gdAdicionarObservacoes'), metas: temPermissao(role, 'gdConfigurarMetas') }} />
}
