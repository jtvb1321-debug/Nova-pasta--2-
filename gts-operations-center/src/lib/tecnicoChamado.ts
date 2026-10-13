import { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS } from './slaMetas'

// Regras de apresentacao do chamado na area do tecnico (/meus-chamados).
// Funcoes puras (sem React/banco): as mesmas etapas do fluxo que o servidor ja
// grava - nada de status novo.
//
//   Aguardando      = ABERTO sem dataACaminho
//   Em deslocamento = ABERTO com dataACaminho
//   Em atendimento  = EM_ANDAMENTO
//   Concluido       = FINALIZADO

export type Etapa = 'AGUARDANDO' | 'DESLOCAMENTO' | 'ATENDIMENTO' | 'CONCLUIDO' | 'OUTRO'

// Evidencia minima para finalizar (antes eram 3 fotos).
export const MIN_FOTOS = 1
export const MSG_MIN_FOTOS = 'Adicione pelo menos 1 foto para finalizar o chamado.'

export const ETAPAS_ROTULOS: { etapa: Exclude<Etapa, 'OUTRO'>; rotulo: string }[] = [
  { etapa: 'AGUARDANDO', rotulo: 'Aguardando' },
  { etapa: 'DESLOCAMENTO', rotulo: 'Em deslocamento' },
  { etapa: 'ATENDIMENTO', rotulo: 'Em atendimento' },
  { etapa: 'CONCLUIDO', rotulo: 'Concluído' },
]

export function etapaDoChamado(c: { status?: string; dataACaminho?: any }): Etapa {
  if (c.status === 'ABERTO') return c.dataACaminho ? 'DESLOCAMENTO' : 'AGUARDANDO'
  if (c.status === 'EM_ANDAMENTO') return 'ATENDIMENTO'
  if (c.status === 'FINALIZADO') return 'CONCLUIDO'
  return 'OUTRO'
}

export function rotuloDaEtapa(etapa: Etapa) {
  return ETAPAS_ROTULOS.find(e => e.etapa === etapa)?.rotulo ?? 'Agendado'
}

// A acao principal e' sempre a da etapa atual; os textos sao os mesmos no card e nos detalhes.
export function acaoPrincipal(etapa: Etapa): { rotulo: string; proximoStatus: 'ABERTO' | 'EM_ANDAMENTO' | 'FINALIZADO' } | null {
  switch (etapa) {
    case 'AGUARDANDO': return { rotulo: 'Iniciar deslocamento', proximoStatus: 'ABERTO' }
    case 'DESLOCAMENTO': return { rotulo: 'Cheguei · iniciar atendimento', proximoStatus: 'EM_ANDAMENTO' }
    case 'ATENDIMENTO': return { rotulo: 'Finalizar chamado', proximoStatus: 'FINALIZADO' }
    default: return null
  }
}

// ---------------------------------------------------------------- finalizacao
// O que falta para finalizar, calculado ANTES do toque: o botao mostra "Falta 1 foto e o relato"
// em vez de dar erro depois. As regras sao as mesmas que o servidor e o modal ja exigiam.
export interface EntradaPendencias {
  relato: string
  fotosValidas: number
  enviandoFotos: boolean
  /** true quando ha equipamentos na carga da equipe e nenhum foi escolhido (nem "nenhum usado"). */
  equipamentoPendente: boolean
  minFotos?: number
}

export interface ItemPendencia {
  id: 'fotos' | 'relato' | 'equipamento'
  rotulo: string
  ok: boolean
  detalhe: string
}

export function pendenciasFinalizacao(e: EntradaPendencias) {
  const min = e.minFotos ?? MIN_FOTOS
  const faltamFotos = Math.max(0, min - e.fotosValidas)
  const itens: ItemPendencia[] = [
    {
      id: 'fotos', rotulo: 'Fotos do atendimento', ok: faltamFotos === 0 && !e.enviandoFotos,
      detalhe: e.enviandoFotos ? 'Enviando fotos...' : faltamFotos === 0 ? `${e.fotosValidas} ${e.fotosValidas === 1 ? 'foto enviada' : 'fotos enviadas'}` : `Falta pelo menos ${faltamFotos} ${faltamFotos === 1 ? 'foto' : 'fotos'}`,
    },
    { id: 'relato', rotulo: 'Relato', ok: e.relato.trim().length > 0, detalhe: e.relato.trim() ? 'Escrito' : 'O que foi feito e como ficou' },
    { id: 'equipamento', rotulo: 'Equipamento usado', ok: !e.equipamentoPendente, detalhe: e.equipamentoPendente ? 'Escolha o equipamento ou marque "Nenhum equipamento foi utilizado"' : 'Informado' },
  ]
  const faltam = itens.filter(i => !i.ok)
  const nomes: Record<ItemPendencia['id'], string> = { fotos: 'foto', relato: 'o relato', equipamento: 'o equipamento' }
  const lista = faltam.map(i => nomes[i.id])
  const texto = lista.length <= 1 ? lista[0] ?? '' : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`
  return {
    itens,
    prontos: itens.length - faltam.length,
    total: itens.length,
    completo: faltam.length === 0,
    /** Texto do botao quando falta algo (ex.: "Falta foto e o relato"). Vazio quando esta tudo pronto. */
    textoFalta: !faltam.length ? '' : e.enviandoFotos && faltamFotos === 0 && faltam.length === 1 ? 'Aguarde o envio das fotos' : `Falta ${texto}`,
    primeiroQueFalta: faltam[0]?.id ?? null,
  }
}

// Frases prontas para montar o relato com toques (o tecnico completa o que faltar).
const FRASES_RELATO: Record<string, string[]> = {
  INSTALACAO: ['Instalação concluída', 'Sinal ok', 'ONU ligada', 'Cliente orientado', 'Cliente testou a internet'],
  MANUTENCAO: ['Problema resolvido', 'Cabo substituído', 'Conector trocado', 'Sinal normalizado', 'Cliente testou a internet'],
  SUPORTE: ['Problema resolvido', 'Equipamento reiniciado', 'Sinal normalizado', 'Cliente orientado', 'Cliente testou a internet'],
  RETIRADA: ['Equipamento recolhido', 'Cabo recolhido', 'Cliente informado', 'Local organizado'],
  ROMPIMENTO_MASSIVO: ['Fibra emendada', 'Sinal restabelecido', 'Teste de potência ok', 'Local sinalizado'],
}

export function frasesDeRelato(tipo?: string | null): string[] {
  return FRASES_RELATO[tipo ?? ''] ?? ['Serviço concluído', 'Sinal ok', 'Cliente orientado']
}

/** Junta uma frase ao relato (sem repetir e com pontuacao simples). */
export function acrescentarFrase(relato: string, frase: string): string {
  const atual = relato.trim()
  if (atual.toLowerCase().includes(frase.toLowerCase())) return relato
  if (!atual) return `${frase}.`
  return `${atual}${/[.!?]$/.test(atual) ? '' : '.'} ${frase}.`
}

export const MOTIVOS_CLIENTE_AUSENTE = ['Não atendeu', 'Endereço errado', 'Pediu para remarcar', 'Ninguém no local'] as const

const para = (v: any) => (v ? new Date(v) : null)

// Quando o relogio do SLA comeca: agendamento (se futuro na abertura) ou abertura.
// E' o campo inicioSla gravado pelo servidor; chamados antigos usam a abertura.
// EACE (outras cidades): so no inicio do atendimento - antes disso nao ha SLA (null).
export function inicioEfetivo(c: { inicioSla?: any; dataAbertura?: any; createdAt?: any; eace?: boolean | null; dataInicio?: any }): Date | null {
  if (c.eace) return para(c.dataInicio)
  return para(c.inicioSla) ?? para(c.dataAbertura) ?? para(c.createdAt)
}

export function formatarDuracao(minutos: number) {
  const m = Math.max(0, Math.round(minutos))
  if (m < 1) return 'menos de 1 min'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const resto = m % 60
  if (h < 24) return resto ? `${h}h ${String(resto).padStart(2, '0')}min` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export interface SituacaoTempo {
  // Tempo desde a ABERTURA - informativo, nunca e' "atraso".
  abertoHa: string | null
  // Chamado com horario marcado ainda no futuro: nao ha espera nem atraso.
  comecaEm: Date | null
  // Atraso so existe quando o prazo do SLA (a partir do inicio efetivo) foi excedido.
  atraso: { minutos: number; texto: string; prazo: 'resposta' | 'resolucao' } | null
  // Tempo dentro do prazo (restante), quando aplicavel.
  restante: string | null
  emAtendimentoHa: string | null
}

export function situacaoDeTempo(
  c: { status?: string; tipo?: string; inicioSla?: any; dataAbertura?: any; createdAt?: any; dataInicio?: any; dataAgendada?: any; eace?: boolean | null },
  agoraMs: number,
): SituacaoTempo {
  const aberturaMs = (para(c.dataAbertura) ?? para(c.createdAt))?.getTime()
  const inicio = inicioEfetivo(c)
  const base: SituacaoTempo = {
    abertoHa: aberturaMs != null && aberturaMs <= agoraMs ? formatarDuracao((agoraMs - aberturaMs) / 60000) : null,
    comecaEm: null, atraso: null, restante: null, emAtendimentoHa: null,
  }
  if (!inicio) return base
  const inicioMs = inicio.getTime()

  if (c.status === 'ABERTO') {
    if (inicioMs > agoraMs) return { ...base, comecaEm: inicio }
    const espera = (agoraMs - inicioMs) / 60000
    if (espera > META_SLA_RESPOSTA_MINUTOS) {
      const exc = espera - META_SLA_RESPOSTA_MINUTOS
      return { ...base, atraso: { minutos: exc, texto: `Atraso de ${formatarDuracao(exc)}`, prazo: 'resposta' } }
    }
    return { ...base, restante: formatarDuracao(META_SLA_RESPOSTA_MINUTOS - espera) }
  }

  if (c.status === 'EM_ANDAMENTO') {
    const ini = para(c.dataInicio)
    const emAtendimentoHa = ini && ini.getTime() <= agoraMs ? formatarDuracao((agoraMs - ini.getTime()) / 60000) : null
    const meta = META_SLA_RESOLUCAO_MINUTOS[c.tipo ?? ''] ?? META_SLA_RESOLUCAO_MINUTOS.SUPORTE
    const decorrido = Math.max(0, (agoraMs - inicioMs) / 60000)
    if (decorrido > meta) {
      const exc = decorrido - meta
      return { ...base, emAtendimentoHa, atraso: { minutos: exc, texto: `Prazo de resolução excedido em ${formatarDuracao(exc)}`, prazo: 'resolucao' } }
    }
    return { ...base, emAtendimentoHa, restante: formatarDuracao(meta - decorrido) }
  }
  return base
}

const PESO_ETAPA: Record<Etapa, number> = { ATENDIMENTO: 0, DESLOCAMENTO: 1, AGUARDANDO: 2, CONCLUIDO: 3, OUTRO: 4 }
const PESO_PRIORIDADE: Record<string, number> = { CRITICO: 0, URGENTE: 1, NORMAL: 2 }

export function prioridadeDe(obs?: string | null) {
  if (obs?.includes('[CRITICO]')) return 'CRITICO'
  if (obs?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

// Posicao na lista: etapa mais adiantada primeiro, depois prioridade, depois quem
// precisa comecar antes. Reordena sozinho quando a etapa muda.
export function ordenarChamados<T extends { status?: string; dataACaminho?: any; observacao?: string | null; inicioSla?: any; dataAbertura?: any; createdAt?: any; eace?: boolean | null; dataInicio?: any }>(lista: T[]): T[] {
  // EACE ainda sem SLA entra na fila pela abertura.
  const chave = (c: T) => (inicioEfetivo(c) ?? para(c.dataAbertura) ?? para(c.createdAt))?.getTime() ?? 0
  return [...lista].sort((a, b) => {
    const e = PESO_ETAPA[etapaDoChamado(a)] - PESO_ETAPA[etapaDoChamado(b)]
    if (e) return e
    const p = PESO_PRIORIDADE[prioridadeDe(a.observacao)] - PESO_PRIORIDADE[prioridadeDe(b.observacao)]
    if (p) return p
    return chave(a) - chave(b)
  })
}

// Atualiza um chamado dentro de uma lista com a resposta do servidor (mantem os
// relacionamentos que a resposta do PATCH nao traz: equipe, materiais...).
export function mesclarChamadoNaLista<T extends { id: string }>(lista: T[], id: string, parcial: Partial<T>): T[] {
  return lista.map(c => (c.id === id ? { ...c, ...parcial } : c))
}

export function fotosSalvas(c: { fotos?: string | null }): string[] {
  if (!c.fotos) return []
  try {
    const v = typeof c.fotos === 'string' ? JSON.parse(c.fotos) : c.fotos
    return Array.isArray(v) ? v.filter((u: any) => typeof u === 'string' && u) : []
  } catch {
    return []
  }
}
