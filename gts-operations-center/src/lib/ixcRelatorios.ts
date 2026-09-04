import { listarIXC } from './ixc'

// Consultas de relatorio direto na API do IXC (sem gravar nada no nosso
// banco) - diferente de ixcSync.ts, que sincroniza clientes ATIVOS para a
// tabela Cliente. Cancelamentos nao entram nessa sincronizacao (o sync so
// traz `ativo = S`), entao a unica forma de ter esse dado e consultando o
// IXC na hora.

interface RegistroContratoIxc {
  id: string
  id_cliente: string
  status: string
  data_ativacao: string
  data_cancelamento: string
  motivo_cancelamento: string
  obs_cancelamento: string
  contrato?: string
  descricao_aux_plano_venda?: string
}

export interface ClienteCanceladoIxc {
  contratoId: string
  clienteId: string
  clienteNome: string
  cidade: string | null
  telefone: string | null
  plano: string | null
  dataAtivacao: string | null
  dataCancelamento: string
  motivoResumo: string | null
  obsCancelamento: string | null
}

async function buscarTodosPaginado(tabela: string, params: Record<string, any>) {
  let pagina = 1
  const todos: any[] = []
  while (true) {
    const registros = await listarIXC(tabela, { ...params, page: pagina, rp: 500 })
    if (!registros || registros.length === 0) break
    todos.push(...registros)
    if (registros.length < 500) break
    pagina++
    if (pagina > 20) break
  }
  return todos
}

function paraDataOuNull(str: string | null | undefined): string | null {
  if (!str || str === '0000-00-00') return null
  return str
}

// Tenta extrair uma linha-resumo do motivo a partir do texto livre de
// obs_cancelamento (ex: "Motivo do Cancelamento: cliente vai se mudar...")
// - o campo motivo_cancelamento e so um codigo numerico sem tabela de
// consulta disponivel na API, entao o texto livre e a fonte mais confiavel.
function extrairMotivoResumo(obs: string | null): string | null {
  if (!obs) return null
  const match = obs.match(/motivo[^:]*:\s*([^\n\r]+)/i)
  if (match) return match[1].trim()
  const primeiraLinha = obs.split(/\r?\n/).find(l => l.trim().length > 0)
  return primeiraLinha ? primeiraLinha.trim() : null
}

let cacheMapaCidades: Map<string, string> | null = null
async function buscarMapaCidades(): Promise<Map<string, string>> {
  if (cacheMapaCidades) return cacheMapaCidades
  const mapa = new Map<string, string>()
  try {
    const registros = await buscarTodosPaginado('cidade', { qtype: 'id', query: '0', oper: '>' })
    for (const c of registros) {
      if (c.id && c.nome) mapa.set(String(c.id), c.nome)
    }
  } catch (err: any) {
    console.error('[IXC Relatorios] Falha ao buscar tabela cidade:', err.message)
  }
  cacheMapaCidades = mapa
  return mapa
}

export async function buscarContratosCanceladosPorMes(ano: number, mes: number): Promise<ClienteCanceladoIxc[]> {
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  const inicioStr = inicio.toISOString().slice(0, 10)
  const fimStr = fim.toISOString().slice(0, 10)

  // A API do IXC so aceita um filtro de campo por chamada - busca tudo com
  // cancelamento a partir do inicio do mes e filtra o fim do mes aqui.
  const candidatos: RegistroContratoIxc[] = await buscarTodosPaginado('cliente_contrato', {
    qtype: 'data_cancelamento', query: inicioStr, oper: '>=', sortname: 'data_cancelamento', sortorder: 'asc',
  })

  const doMes = candidatos.filter(c => {
    const d = c.data_cancelamento
    return d && d !== '0000-00-00' && d <= fimStr
  })

  if (doMes.length === 0) return []

  const idsUnicos = [...new Set(doMes.map(c => String(c.id_cliente)))]
  const mapaClientes = new Map<string, any>()
  const LOTE = 8
  for (let i = 0; i < idsUnicos.length; i += LOTE) {
    const lote = idsUnicos.slice(i, i + LOTE)
    const resultados = await Promise.all(
      lote.map(id => listarIXC('cliente', { qtype: 'id', query: id, oper: '=', rp: 1 }).catch(() => []))
    )
    resultados.forEach((regs, idx) => {
      if (regs[0]) mapaClientes.set(lote[idx], regs[0])
    })
  }

  const mapaCidades = await buscarMapaCidades()

  return doMes
    .map(c => {
      const cliente = mapaClientes.get(String(c.id_cliente))
      return {
        contratoId: String(c.id),
        clienteId: String(c.id_cliente),
        clienteNome: cliente?.razao || cliente?.fantasia || `Cliente ${c.id_cliente}`,
        cidade: cliente?.cidade ? mapaCidades.get(String(cliente.cidade)) || null : null,
        telefone: cliente?.telefone_celular || cliente?.fone || null,
        plano: c.contrato || c.descricao_aux_plano_venda || null,
        dataAtivacao: paraDataOuNull(c.data_ativacao),
        dataCancelamento: c.data_cancelamento,
        motivoResumo: extrairMotivoResumo(c.obs_cancelamento || null),
        obsCancelamento: c.obs_cancelamento || null,
      }
    })
    .sort((a, b) => b.dataCancelamento.localeCompare(a.dataCancelamento))
}
