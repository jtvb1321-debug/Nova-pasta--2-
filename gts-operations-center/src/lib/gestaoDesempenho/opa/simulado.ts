// SIMULADO - SOMENTE PARA TESTES. Formato de resposta INVENTADO para exercitar o cliente/adaptador/sincronizacao.
// NAO representa a API real do OPA e nunca roda em producao (as funcoes recusam NODE_ENV=production).

import type { ConfigOpa } from '../config'
import { SCHEMAS_CONFIG } from '../config'

function recusarEmProducao() {
  if (process.env.NODE_ENV === 'production') throw new Error('Provedor SIMULADO do OPA nao pode ser usado em producao.')
}

/** Mapeamento do formato simulado (so existe nos testes). */
export function mapeamentoSimulado(): ConfigOpa {
  recusarEmProducao()
  return SCHEMAS_CONFIG.opa.parse({
    caminhoLista: '/simulado/atendimentos', cabecalhoAuth: 'X-Token-Simulado', prefixoAuth: '',
    paramInicio: 'de', paramFim: 'ate', paramPagina: 'pagina', paramLimite: 'limite', tamanhoPagina: 10, formatoParamData: 'DATA',
    caminhoItens: 'dados.itens',
    campos: {
      id: 'id', atendenteId: 'agente.id', protocolo: 'protocolo', criadoEm: 'criado', assumidoEm: 'assumido', primeiraRespostaEm: 'primeira_resposta',
      finalizadoEm: 'fim', situacao: 'estado', transferido: 'transferido', dentroSla: 'sla_ok', resolvidoRemoto: 'remoto', nota: 'nota',
    },
    situacoes: { finalizado: ['fechado'], abandonado: ['abandonado'], emAtendimento: ['em_atendimento'], aberto: ['aguardando'] },
  })
}

export interface AtendimentoSimulado { id: string; protocolo: string; agente: { id: string }; criado: string; assumido: string | null; primeira_resposta: string | null; fim: string | null; estado: string; transferido: boolean; sla_ok: boolean | null; remoto: boolean | null; nota: number | null }

export function gerarAtendimentosSimulados(dia: string, agenteId: string, quantidade: number, inicioNumero = 1): AtendimentoSimulado[] {
  recusarEmProducao()
  return Array.from({ length: quantidade }, (_, i) => {
    const n = inicioNumero + i
    const hora = String(8 + (i % 9)).padStart(2, '0')
    const criado = `${dia}T${hora}:00:00-03:00`
    const assumido = `${dia}T${hora}:02:00-03:00`
    const finalizado = i % 5 !== 4
    return {
      id: `sim-${agenteId}-${dia}-${n}`, protocolo: `SIM${n}`, agente: { id: agenteId }, criado,
      assumido, primeira_resposta: `${dia}T${hora}:01:00-03:00`,
      fim: finalizado ? `${dia}T${hora}:20:00-03:00` : null,
      estado: finalizado ? 'fechado' : 'em_atendimento',
      transferido: i % 7 === 0, sla_ok: finalizado ? i % 4 !== 0 : null, remoto: finalizado ? i % 3 !== 0 : null, nota: finalizado && i % 2 === 0 ? 5 : null,
    }
  })
}

export interface OpcoesServidorSimulado {
  /** Quantas respostas iniciais devem falhar (para testar retentativa). */
  falhasIniciais?: number
  statusFalha?: number
  /** Sempre responde 401 (credencial invalida). */
  negado?: boolean
}

/** fetch falso que serve os itens paginados e conta chamadas. Nenhuma rede e' usada. */
export function criarFetchSimulado(itens: unknown[], opcoes: OpcoesServidorSimulado = {}) {
  recusarEmProducao()
  const chamadas: { url: string; cabecalhos: Record<string, string> }[] = []
  let falhasRestantes = opcoes.falhasIniciais ?? 0
  const fetchFalso = (async (url: any, init: any) => {
    const u = new URL(String(url))
    chamadas.push({ url: u.pathname + u.search, cabecalhos: { ...(init?.headers ?? {}) } })
    if (opcoes.negado) return new Response('{}', { status: 401 })
    if (falhasRestantes > 0) { falhasRestantes--; return new Response('{}', { status: opcoes.statusFalha ?? 503 }) }
    const pagina = Number(u.searchParams.get('pagina') ?? 1)
    const limite = Number(u.searchParams.get('limite') ?? itens.length)
    const fatia = itens.slice((pagina - 1) * limite, pagina * limite)
    return new Response(JSON.stringify({ dados: { itens: fatia } }), { status: 200 })
  }) as typeof fetch
  return { fetch: fetchFalso, chamadas }
}
