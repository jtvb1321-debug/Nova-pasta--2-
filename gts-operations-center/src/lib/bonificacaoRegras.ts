// Regras da Proposta de Bonificacao por Desempenho (GTS NET) - calculo puro, sem banco,
// para poder ser testado e reaproveitado. Valores em CENTAVOS (sem erro de arredondamento).
//
// Creditos: chamado concluido R$4 | instalacao R$8 | retirada R$8 | SLA cumprido R$0,50/O.S.
//           avaliacao 5 = +R$2 | 4 = +R$1 | 3 = neutro
// Debitos:  avaliacao 2 = -R$5 | 1 = -R$8 (so depois da validacao do supervisor)
//           rechamada procedente -R$4 | instalacao com retorno por erro tecnico -R$8
//           O.S. sem evidencias -R$4
// Fora do calculo automatico (nao ha dado no sistema): rota criada/concluida e negociacao.
// "Retirada sem devolucao / O.S. incorreta = sem credito": O.S. encerrada pela gestao
// (fechadoAdmin) nao entra; a devolucao da retirada fica para o admin conferir na aprovacao.

export const VALORES_CENTAVOS = {
  CHAMADO_CONCLUIDO: 400,
  INSTALACAO_CONCLUIDA: 800,
  RETIRADA_CONCLUIDA: 800,
  SLA_CUMPRIDO: 50,
  AVALIACAO_5: 200,
  AVALIACAO_4: 100,
  AVALIACAO_2: -500,
  AVALIACAO_1: -800,
  RECHAMADA_PROCEDENTE: -400,
  INSTALACAO_ERRO_TECNICO: -800,
  SEM_EVIDENCIAS: -400,
} as const

export type TipoEvento = keyof typeof VALORES_CENTAVOS

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  CHAMADO_CONCLUIDO: 'Chamado concluído',
  INSTALACAO_CONCLUIDA: 'Instalação concluída',
  RETIRADA_CONCLUIDA: 'Retirada concluída',
  SLA_CUMPRIDO: 'SLA cumprido',
  AVALIACAO_5: 'Avaliação excelente (5)',
  AVALIACAO_4: 'Avaliação muito boa (4)',
  AVALIACAO_2: 'Avaliação ruim confirmada (2)',
  AVALIACAO_1: 'Avaliação péssima confirmada (1)',
  RECHAMADA_PROCEDENTE: 'Rechamada procedente',
  INSTALACAO_ERRO_TECNICO: 'Instalação com retorno por erro técnico',
  SEM_EVIDENCIAS: 'O.S. sem evidências',
}

export interface ChamadoFechado {
  id: string
  cliente: string
  tipo: string
  equipeId: string
  dataFim: Date
  qtdFotos: number
  dentroSlaResposta: boolean | null
  dentroSlaResolucao: boolean | null
  avaliacao: { nota: number | null; statusAnalise: 'PENDENTE' | 'APROVADA' | 'INVALIDADA'; respondida: boolean } | null
}

export interface RechamadaConfirmada {
  id: string                 // chamado novo (a rechamada)
  confirmadaEm: Date
  origem: { id: string; cliente: string; tipo: string; equipeId: string | null }
}

export interface ItemBonus {
  chamadoId: string
  cliente: string
  evento: TipoEvento
  centavos: number
  data: Date
  aviso?: string             // ex.: conferir devolucao da retirada
}

export interface Pendencia {
  chamadoId: string
  cliente: string
  motivo: 'AVALIACAO_EM_ANALISE'
  // Valor que entra se o supervisor aprovar a avaliacao (para o admin saber o impacto).
  centavosSeAprovada: number
}

export interface ResumoEquipe {
  equipeId: string
  creditos: number
  debitos: number          // negativo
  saldo: number
  concluidos: number
  slaCumprido: number
  avaliacoesAprovadas: number
  somaNotasAprovadas: number
  itens: ItemBonus[]
  pendencias: Pendencia[]
}

function valorAvaliacao(nota: number | null): TipoEvento | null {
  if (nota === 5) return 'AVALIACAO_5'
  if (nota === 4) return 'AVALIACAO_4'
  if (nota === 2) return 'AVALIACAO_2'
  if (nota === 1) return 'AVALIACAO_1'
  return null   // 3 = neutro
}

export function calcularBonusEquipes(chamados: ChamadoFechado[], rechamadas: RechamadaConfirmada[]): Map<string, ResumoEquipe> {
  const equipes = new Map<string, ResumoEquipe>()
  const da = (equipeId: string) => {
    let e = equipes.get(equipeId)
    if (!e) {
      e = { equipeId, creditos: 0, debitos: 0, saldo: 0, concluidos: 0, slaCumprido: 0, avaliacoesAprovadas: 0, somaNotasAprovadas: 0, itens: [], pendencias: [] }
      equipes.set(equipeId, e)
    }
    return e
  }
  const lancar = (e: ResumoEquipe, item: Omit<ItemBonus, 'centavos'> & { centavos?: number }) => {
    const centavos = item.centavos ?? VALORES_CENTAVOS[item.evento]
    e.itens.push({ ...item, centavos })
    if (centavos >= 0) e.creditos += centavos
    else e.debitos += centavos
    e.saldo += centavos
  }

  for (const c of chamados) {
    const e = da(c.equipeId)
    const base = { chamadoId: c.id, cliente: c.cliente, data: c.dataFim }
    e.concluidos++

    if (c.tipo === 'INSTALACAO') lancar(e, { ...base, evento: 'INSTALACAO_CONCLUIDA' })
    else if (c.tipo === 'RETIRADA') lancar(e, { ...base, evento: 'RETIRADA_CONCLUIDA', aviso: 'Confira a devolução do equipamento' })
    else lancar(e, { ...base, evento: 'CHAMADO_CONCLUIDO' })

    if (c.dentroSlaResolucao === true && c.dentroSlaResposta !== false) {
      e.slaCumprido++
      lancar(e, { ...base, evento: 'SLA_CUMPRIDO' })
    }

    if (c.qtdFotos === 0) lancar(e, { ...base, evento: 'SEM_EVIDENCIAS' })

    const av = c.avaliacao
    if (av?.respondida && av.nota != null) {
      const evento = valorAvaliacao(av.nota)
      if (av.statusAnalise === 'APROVADA') {
        e.avaliacoesAprovadas++
        e.somaNotasAprovadas += av.nota
        if (evento) lancar(e, { ...base, evento })
      } else if (av.statusAnalise === 'PENDENTE') {
        e.pendencias.push({ chamadoId: c.id, cliente: c.cliente, motivo: 'AVALIACAO_EM_ANALISE', centavosSeAprovada: evento ? VALORES_CENTAVOS[evento] : 0 })
      }
      // INVALIDADA: nao conta
    }
  }

  // Rechamada confirmada pelo supervisor: debita a equipe que fez o atendimento de origem.
  for (const r of rechamadas) {
    if (!r.origem.equipeId) continue
    const e = da(r.origem.equipeId)
    lancar(e, {
      chamadoId: r.origem.id,
      cliente: r.origem.cliente,
      data: r.confirmadaEm,
      evento: r.origem.tipo === 'INSTALACAO' ? 'INSTALACAO_ERRO_TECNICO' : 'RECHAMADA_PROCEDENTE',
    })
  }

  return equipes
}

// Ranking: maior saldo primeiro; empate -> mais chamados concluidos -> melhor media aprovada.
export function ordenarRanking<T extends { saldo: number; concluidos: number; mediaAvaliacao: number | null }>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    b.saldo - a.saldo ||
    b.concluidos - a.concluidos ||
    (b.mediaAvaliacao ?? 0) - (a.mediaAvaliacao ?? 0))
}
