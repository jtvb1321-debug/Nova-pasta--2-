import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { ConfiguracoesView } from '@/components/gestaoDesempenho/ConfiguracoesView'

export default async function ConfiguracoesGdPage() {
  const role = ((await auth())?.user as any)?.role
  return <ConfiguracoesView pode={{ metas: temPermissao(role, 'gdConfigurarMetas'), integracoes: temPermissao(role, 'gdConfigurarIntegracoes') }} />
}
