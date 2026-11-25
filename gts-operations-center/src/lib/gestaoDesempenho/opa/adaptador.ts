// Adaptador do OPA Atendimento: converte o JSON da API para o modelo interno, SOMENTE com o mapeamento configurado
// (docs/gestao-desempenho/03-CONFIG-OPA.md). Nada de nome de campo inventado: campo nao mapeado = indicador indisponivel.
// Puro e testado.

import type { ConfigOpa } from '../config'
import type { AtendimentoNormalizado, CapacidadeOpa, SituacaoAtendimento } from '../recepcao'

/** Le "a.b.0.c" dentro de um objeto. */
export function lerCaminho(obj: unknown, caminho: string | null | undefined): unknown {
  if (!caminho) return undefined
  let atual: any = obj
  for (const parte of caminho.split('.')) {
    if (atual === null || atual === undefined) return undefined
    atual = atual[parte]
  }
  return atual
}

function paraData(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = typeof v === 'number' ? new Date(v > 1e11 ? v : v * 1000) : typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

function paraBooleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', '1', 'sim', 's', 'yes'].includes(s)) return true
    if (['false', '0', 'nao', 'não', 'n', 'no'].includes(s)) return false
  }
  return null
}

function paraNumero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

const igual = (lista: string[], v: string) => lista.some(x => x.trim().toLowerCase() === v)

function situacaoDe(v: unknown, cfg: ConfigOpa): SituacaoAtendimento {
  if (typeof v !== 'string' && typeof v !== 'number') return 'DESCONHECIDA'
  const s = String(v).trim().toLowerCase()
  if (igual(cfg.situacoes.finalizado, s)) return 'FINALIZADO'
  if (igual(cfg.situacoes.abandonado, s)) return 'ABANDONADO'
  if (igual(cfg.situacoes.emAtendimento, s)) return 'EM_ATENDIMENTO'
  if (igual(cfg.situacoes.aberto, s)) return 'ABERTO'
  return 'DESCONHECIDA'
}

/** O que a API realmente entrega, deduzido do mapeamento: so o que foi mapeado vira indicador. */
export function capacidadesDoMapeamento(cfg: ConfigOpa): Set<CapacidadeOpa> {
  const c = cfg.campos
  const s = new Set<CapacidadeOpa>()
  if (c.assumidoEm) s.add('ASSUMIDO')
  if (c.finalizadoEm && c.situacao && cfg.situacoes.finalizado.length) s.add('FINALIZADO')
  if (c.transferido) s.add('TRANSFERIDO')
  if (c.situacao && cfg.situacoes.abandonado.length) s.add('ABANDONADO')
  if (c.primeiraRespostaEm) s.add('PRIMEIRA_RESPOSTA')
  if (c.dentroSla) s.add('SLA')
  if (c.resolvidoRemoto) s.add('RESOLUCAO_REMOTA')
  if (c.nota) s.add('SATISFACAO')
  return s
}

/** null = registro sem id ou sem data de criacao (nao da para usar). */
export function normalizarAtendimento(raw: unknown, cfg: ConfigOpa): AtendimentoNormalizado | null {
  const c = cfg.campos
  const id = lerCaminho(raw, c.id)
  const criadoEm = paraData(lerCaminho(raw, c.criadoEm))
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id) === '' || !criadoEm) return null
  const atendente = lerCaminho(raw, c.atendenteId)
  const protocolo = lerCaminho(raw, c.protocolo)
  return {
    id: String(id),
    atendenteId: typeof atendente === 'string' || typeof atendente === 'number' ? String(atendente) : null,
    protocolo: typeof protocolo === 'string' || typeof protocolo === 'number' ? String(protocolo) : null,
    criadoEm,
    assumidoEm: paraData(lerCaminho(raw, c.assumidoEm)),
    primeiraRespostaEm: paraData(lerCaminho(raw, c.primeiraRespostaEm)),
    finalizadoEm: paraData(lerCaminho(raw, c.finalizadoEm)),
    situacao: c.situacao ? situacaoDe(lerCaminho(raw, c.situacao), cfg) : 'DESCONHECIDA',
    transferido: c.transferido ? paraBooleano(lerCaminho(raw, c.transferido)) : null,
    dentroSla: c.dentroSla ? paraBooleano(lerCaminho(raw, c.dentroSla)) : null,
    resolvidoRemoto: c.resolvidoRemoto ? paraBooleano(lerCaminho(raw, c.resolvidoRemoto)) : null,
    nota: c.nota ? paraNumero(lerCaminho(raw, c.nota)) : null,
  }
}

export function normalizarLista(brutos: unknown[], cfg: ConfigOpa): { atendimentos: AtendimentoNormalizado[]; descartados: number; situacaoDesconhecida: number } {
  const vistos = new Set<string>()
  const atendimentos: AtendimentoNormalizado[] = []
  let descartados = 0
  for (const b of brutos) {
    const a = normalizarAtendimento(b, cfg)
    if (!a) { descartados++; continue }
    if (vistos.has(a.id)) continue // pagina repetida ou atendimento duplicado
    vistos.add(a.id)
    atendimentos.push(a)
  }
  return { atendimentos, descartados, situacaoDesconhecida: atendimentos.filter(a => a.situacao === 'DESCONHECIDA').length }
}

/** Minimo para sincronizar: URL, token (ambiente), lista, parametros de periodo e os campos id e data de criacao. */
export function opaConfigurada(cfg: ConfigOpa, ambiente: { url?: string; token?: string } = { url: process.env.OPA_API_URL, token: process.env.OPA_API_TOKEN }): { ok: boolean; faltando: string[] } {
  const faltando: string[] = []
  if (!ambiente.url) faltando.push('OPA_API_URL (variável de ambiente)')
  if (!ambiente.token) faltando.push('OPA_API_TOKEN (variável de ambiente)')
  if (!cfg.caminhoLista) faltando.push('caminho da lista de atendimentos')
  if (!cfg.cabecalhoAuth) faltando.push('cabeçalho de autenticação')
  if (!cfg.paramInicio || !cfg.paramFim) faltando.push('parâmetros de período (início e fim)')
  if (!cfg.campos.id) faltando.push('campo "id do atendimento"')
  if (!cfg.campos.criadoEm) faltando.push('campo "data de criação"')
  if (!cfg.campos.atendenteId) faltando.push('campo "atendente"')
  return { ok: faltando.length === 0, faltando }
}
