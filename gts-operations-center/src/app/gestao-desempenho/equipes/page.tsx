import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { UnidadesView } from '@/components/gestaoDesempenho/UnidadesView'

export default async function EquipesPage() {
  const role = ((await auth())?.user as any)?.role
  return <UnidadesView tipo="EQUIPE_CAMPO" pode={{ observar: temPermissao(role, 'gdAdicionarObservacoes'), metas: temPermissao(role, 'gdConfigurarMetas') }} />
}
